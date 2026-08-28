"""The six tests that carry the whole backend argument.

Run with:  venv/Scripts/python.exe -m pytest tests -q
(or:       venv/Scripts/python.exe tests/test_core.py  -- no pytest needed)
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GLIDE_DATABASE_URL", "sqlite:///:memory:")

from app.core.db import Base, SessionLocal, engine          # noqa: E402
from app.core.security import hash_password                 # noqa: E402
from app.models.finance import (                            # noqa: E402
    DEFAULT_PRIORITIES, Insight, Obligation, Transaction, User,
)
from app.agent import loop                                  # noqa: E402
from app.services import financial_engine, resolver         # noqa: E402
from app.services.classifier import refresh_recurring_obligations  # noqa: E402
from app.services.sms_parser import parse_sms               # noqa: E402


def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return SessionLocal()


def make_user(db, **overrides):
    user = User(
        email=overrides.get("email", "t@t.com"),
        name="Test",
        password_hash=hash_password("x"),
        risk_tolerance=overrides.get("risk_tolerance", 50),
        priorities=overrides.get("priorities", list(DEFAULT_PRIORITIES)),
        buffer_floor=overrides.get("buffer_floor", 10000.0),
        onboarded=True,
    )
    db.add(user)
    db.commit()
    return user


def ingest(db, user, body, sender="VM-HDFCBK", when=None, source="SMS"):
    parsed = parse_sms(body, sender, when or datetime.now(timezone.utc))
    assert parsed["ok"], f"parser rejected: {body[:70]} ({parsed.get('reason')})"
    txn, action = resolver.ingest_parsed(db, user.id, parsed, source)
    db.commit()
    return txn, action


# ---------------------------------------------------------------------------
# 1. Cross-source merge raises confidence instead of double-booking.
# ---------------------------------------------------------------------------

def test_sms_and_email_for_one_order_merge():
    db = fresh_db()
    user = make_user(db)
    when = datetime.now(timezone.utc) - timedelta(days=2)

    sms_txn, sms_action = ingest(
        db, user,
        "Rs.2,499.00 debited from A/c XX4521 on 26-08-2026 to AMAZON PAY INDIA. "
        "UPI Ref 447281930022. Avl Bal Rs.18,000.00. -HDFC Bank",
        when=when,
    )
    sms_confidence = sms_txn.confidence

    email_txn, email_action = ingest(
        db, user,
        "Rs.2,499.00 paid to AMAZON PAY INDIA on 26-08-2026 for order 408-2298311-2210",
        sender="amazon.in", when=when, source="EMAIL",
    )

    assert sms_action == "created"
    assert email_action == "merged"
    assert sms_txn.id == email_txn.id
    assert db.query(Transaction).filter(Transaction.user_id == user.id).count() == 1
    assert len(email_txn.evidence) == 2
    assert {e.source_type for e in email_txn.evidence} == {"SMS", "EMAIL"}
    assert email_txn.confidence > sms_confidence, "agreement between sources must raise confidence"
    print("  1. cross-source merge: 1 txn, 2 evidence rows, "
          f"confidence {sms_confidence} -> {email_txn.confidence}")


# ---------------------------------------------------------------------------
# 2. Conflicting amounts land in review rather than being guessed at.
# ---------------------------------------------------------------------------

def test_conflicting_amounts_flag_for_review():
    db = fresh_db()
    user = make_user(db)
    when = datetime.now(timezone.utc) - timedelta(days=1)

    ingest(db, user,
           "Rs.1,000.00 debited from A/c XX4521 to BLUE BOTTLE. UPI Ref 900011122233. "
           "Avl Bal Rs.5,000.00. -HDFC Bank", when=when)
    # The OCR path is more authoritative and disagrees slightly.
    txn, action = ingest(db, user,
                         "Rs.1,015.00 paid to BLUE BOTTLE on 27-08-2026 ref 900011122234",
                         sender="bill-ocr", when=when, source="OCR")

    assert action == "merged"
    assert txn.has_conflict is True
    assert txn.needs_review is True
    assert txn.amount == 1015.00, "the more authoritative source wins the field"
    print(f"  2. conflict: kept OCR amount {txn.amount}, flagged for review")


# ---------------------------------------------------------------------------
# 3. Thin history produces a wide band and says so.
# ---------------------------------------------------------------------------

def test_thin_history_gives_wide_band_with_honest_basis():
    db = fresh_db()
    user = make_user(db)
    for offset, amount in ((5, "8,000.00"), (18, "12,500.00")):
        ingest(db, user,
               f"Your A/c XX4521 has been credited with Rs.{amount} from UPWORK ESCROW. "
               f"UPI Ref 5544{offset}. Bal: Rs.30,000.00. -SBI",
               sender="JD-SBIINB",
               when=datetime.now(timezone.utc) - timedelta(days=offset))

    band = financial_engine.income_band(financial_engine.load_transactions(db, user.id))
    spread = (band["p90"] - band["p10"]) / band["p50"]

    assert band["p10"] < band["p50"] < band["p90"]
    assert spread > 0.5, "two deposits must not produce a confident narrow band"
    assert "deposit" in band["basis"].lower()
    assert band["confidence"] < 0.6
    print(f"  3. thin history: band {band['p10']:.0f}/{band['p50']:.0f}/{band['p90']:.0f}, "
          f"basis '{band['basis']}'")


# ---------------------------------------------------------------------------
# 4. Repetition discovers an obligation; confidence rises with each repeat.
# ---------------------------------------------------------------------------

def test_repeats_discover_obligation_with_rising_confidence():
    db = fresh_db()
    user = make_user(db)
    now = datetime.now(timezone.utc)

    confidences = []
    for index, offset in enumerate((90, 60, 30)):
        ingest(db, user,
               f"Rs.649.00 debited from A/c XX4521 to NETFLIX INDIA. UPI Ref 7788{index}. "
               f"Avl Bal Rs.12,000.00. -HDFC Bank",
               when=now - timedelta(days=offset))
        refresh_recurring_obligations(db, user.id)
        db.commit()
        found = db.query(Obligation).filter(Obligation.user_id == user.id).first()
        if found:
            confidences.append(found.confidence)

    obligation = db.query(Obligation).filter(Obligation.user_id == user.id).one()
    assert obligation.expected_amount == 649.00
    assert obligation.occurrences == 3
    assert obligation.cadence_days == 30
    assert obligation.confidence > 0.6
    assert obligation.status == "active"
    assert confidences == sorted(confidences), "confidence must not fall as repeats accumulate"
    print(f"  4. discovered '{obligation.name}' Rs.{obligation.expected_amount:.0f} "
          f"every {obligation.cadence_days}d, confidence {confidences}")


# ---------------------------------------------------------------------------
# 5. Same data + different priorities => different decision. The core claim.
# ---------------------------------------------------------------------------

def _seed_surplus_state(db, user):
    now = datetime.now(timezone.utc)
    for index, offset in enumerate((70, 40, 12)):
        ingest(db, user,
               f"Your A/c XX4521 has been credited with Rs.48,000.00 from ACME STUDIO. "
               f"UPI Ref 6611{index}. Bal: Rs.60,000.00. -SBI",
               sender="JD-SBIINB", when=now - timedelta(days=offset))
    for index, offset in enumerate((90, 60, 30)):
        ingest(db, user,
               f"Rs.12,000.00 debited from A/c XX4521 to SURESH LANDLORD. UPI Ref 5511{index}. "
               f"Avl Bal Rs.30,000.00. -HDFC Bank",
               when=now - timedelta(days=offset))


def test_priority_order_flips_the_decision():
    db = fresh_db()
    user = make_user(db, priorities=["buffer", "obligations", "goals", "investing", "discretionary"],
                     risk_tolerance=15)
    _seed_surplus_state(db, user)

    conservative = loop.tick(db, user, use_llm=False)
    conservative_winner = conservative.arbitration["winner_objective"]

    # Same ledger, same engine -- only the person's stated preferences change.
    db.query(Insight).delete()
    db.commit()
    user.priorities = ["investing", "goals", "discretionary", "obligations", "buffer"]
    user.risk_tolerance = 90
    db.commit()

    aggressive = loop.tick(db, user, use_llm=False)
    aggressive_winner = aggressive.arbitration["winner_objective"]

    assert conservative.arbitration["floor_mult"] > aggressive.arbitration["floor_mult"]
    assert conservative_winner != aggressive_winner, (
        f"arbitration did not change: both chose '{conservative_winner}'"
    )
    print(f"  5. arbitration flip: conservative -> '{conservative_winner}', "
          f"aggressive -> '{aggressive_winner}'")


# ---------------------------------------------------------------------------
# 6. A dismissed insight stays quiet unless it materially worsens.
# ---------------------------------------------------------------------------

def test_dismissed_insight_is_not_resurfaced():
    db = fresh_db()
    user = make_user(db)
    _seed_surplus_state(db, user)

    first = loop.tick(db, user, use_llm=False)
    assert first.surfaced, "expected at least one surfaced insight to dismiss"

    surfaced_detector = first.surfaced[0]["detector"]
    insight = (
        db.query(Insight)
        .filter(Insight.user_id == user.id, Insight.detector == surfaced_detector)
        .first()
    )
    insight.status = "dismissed"
    insight.dismissed_at = datetime.now(timezone.utc)
    db.commit()

    second = loop.tick(db, user, use_llm=False)
    resurfaced = [s["detector"] for s in second.surfaced]
    suppressed = {s["detector"]: s["reason"] for s in second.suppressed}

    assert surfaced_detector not in resurfaced, "a dismissed insight must not come straight back"
    assert surfaced_detector in suppressed
    assert "cooldown" in suppressed[surfaced_detector]
    print(f"  6. suppression: '{surfaced_detector}' -> {suppressed[surfaced_detector][:60]}…")


TESTS = [
    test_sms_and_email_for_one_order_merge,
    test_conflicting_amounts_flag_for_review,
    test_thin_history_gives_wide_band_with_honest_basis,
    test_repeats_discover_obligation_with_rising_confidence,
    test_priority_order_flips_the_decision,
    test_dismissed_insight_is_not_resurfaced,
]

if __name__ == "__main__":
    failures = 0
    print("Glide backend — the six tests that carry the argument\n")
    for test in TESTS:
        try:
            test()
        except AssertionError as exc:
            failures += 1
            print(f"  FAIL {test.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"  ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(TESTS) - failures}/{len(TESTS)} passed")
    sys.exit(1 if failures else 0)
