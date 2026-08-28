"""Entity resolution.

The same purchase can arrive three times: a bank SMS, an order email, and a
photographed bill. Booking it three times would silently corrupt every number
downstream, so candidates are merged inside a tolerance window and confidence
is combined as `1 - PI(1 - conf_i)` -- two independent mediocre sources agreeing
is stronger evidence than either alone.
"""
from datetime import timedelta, timezone

from app.models.finance import Transaction, TransactionEvidence


def _aware(value):
    """SQLite returns naive datetimes; normalise before any comparison."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

# Merge tolerances -- deliberately tight. Over-merging is worse than a duplicate,
# because a duplicate is visible in the review queue while a bad merge is not.
AMOUNT_TOLERANCE_PCT = 0.02      # 2%
TIME_WINDOW_HOURS = 72
PROMOTE_THRESHOLD = 0.85         # above this a transaction stops needing review

# Which source wins a field-level disagreement.
SOURCE_AUTHORITY = {"OCR": 4, "EMAIL": 3, "SMS": 2, "MANUAL": 5}


def _merchant_overlap(left: str, right: str) -> bool:
    left, right = (left or "").lower().strip(), (right or "").lower().strip()
    if not left or not right:
        return False
    if left == right:
        return True
    if left in right or right in left:
        return True
    left_tokens = {t for t in left.replace("-", " ").split() if len(t) > 2}
    right_tokens = {t for t in right.replace("-", " ").split() if len(t) > 2}
    return bool(left_tokens & right_tokens)


def combine_confidence(existing: float, incoming: float) -> float:
    """Independent-evidence combination: 1 - PI(1 - conf_i)."""
    existing = max(0.0, min(existing or 0.0, 0.999))
    incoming = max(0.0, min(incoming or 0.0, 0.999))
    return round(min(1 - (1 - existing) * (1 - incoming), 0.99), 3)


def find_candidate(db, user_id: int, parsed: dict):
    """Locate an existing transaction this parse most likely refers to."""
    occurred_at = parsed["occurred_at"]
    amount = parsed["amount"]

    window_start = occurred_at - timedelta(hours=TIME_WINDOW_HOURS)
    window_end = occurred_at + timedelta(hours=TIME_WINDOW_HOURS)

    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.direction == parsed["direction"],
            Transaction.occurred_at >= window_start,
            Transaction.occurred_at <= window_end,
        )
        .all()
    )

    best, best_score = None, 0.0
    for row in rows:
        if not row.amount or row.occurred_at is None:
            continue
        delta = abs(row.amount - amount) / max(row.amount, amount)
        if delta > AMOUNT_TOLERANCE_PCT:
            continue

        score = 1.0 - delta                      # amount agreement
        if _merchant_overlap(row.merchant, parsed.get("merchant")):
            score += 0.6
        else:
            # Different-looking merchants with identical amounts are usually
            # genuinely different purchases, not the same one seen twice.
            score -= 0.35
        hours_apart = abs((_aware(row.occurred_at) - occurred_at).total_seconds()) / 3600.0
        score += max(0.0, (TIME_WINDOW_HOURS - hours_apart) / TIME_WINDOW_HOURS) * 0.3

        if score > best_score:
            best, best_score = row, score

    # Require real agreement, not just an amount coincidence.
    return best if best_score >= 1.0 else None


def ingest_parsed(db, user_id: int, parsed: dict, source_type: str = "SMS"):
    """Merge a parsed candidate into the ledger, or create a new transaction.

    Returns (transaction, action) where action is "created" | "merged".
    """
    candidate = find_candidate(db, user_id, parsed)

    if candidate is None:
        txn = Transaction(
            user_id=user_id,
            amount=parsed["amount"],
            direction=parsed["direction"],
            merchant=parsed.get("merchant") or "Unknown",
            category=parsed.get("category") or "Other",
            account_hint=parsed.get("account_hint"),
            channel=parsed.get("channel"),
            occurred_at=parsed["occurred_at"],
            confidence=parsed.get("confidence", 0.5),
            dedupe_key=parsed.get("dedupe_key"),
            needs_review=parsed.get("confidence", 0.5) < PROMOTE_THRESHOLD,
        )
        db.add(txn)
        db.flush()
        _attach_evidence(db, txn, parsed, source_type)
        return txn, "created"

    # ---- merge path ---------------------------------------------------------
    incoming_authority = SOURCE_AUTHORITY.get(source_type, 1)
    existing_authority = max(
        (SOURCE_AUTHORITY.get(e.source_type, 1) for e in candidate.evidence), default=1
    )

    amount_delta = abs(candidate.amount - parsed["amount"]) / max(candidate.amount, parsed["amount"])
    if amount_delta > 0.001:
        # A genuine disagreement between sources -- record it, keep the more
        # authoritative figure, and route to review rather than guessing.
        candidate.has_conflict = True
        candidate.needs_review = True
        if incoming_authority > existing_authority:
            candidate.amount = parsed["amount"]

    if incoming_authority >= existing_authority:
        if parsed.get("merchant") and parsed["merchant"] != "Unknown":
            candidate.merchant = parsed["merchant"]
        if parsed.get("category") and parsed["category"] != "Other":
            candidate.category = parsed["category"]

    candidate.confidence = combine_confidence(candidate.confidence, parsed.get("confidence", 0.5))
    if candidate.confidence >= PROMOTE_THRESHOLD and not candidate.has_conflict:
        candidate.needs_review = False

    _attach_evidence(db, candidate, parsed, source_type)
    return candidate, "merged"


def _attach_evidence(db, txn: Transaction, parsed: dict, source_type: str):
    raw = parsed.get("raw", "")
    # Don't store the identical artefact twice.
    for existing in txn.evidence:
        if existing.source_type == source_type and (existing.raw_content or "") == raw:
            return
    db.add(
        TransactionEvidence(
            transaction_id=txn.id,
            source_type=source_type,
            sender=parsed.get("sender"),
            raw_content=raw,
            source_confidence=parsed.get("confidence", 0.5),
            parsed_fields={
                "amount": parsed.get("amount"),
                "direction": parsed.get("direction"),
                "merchant": parsed.get("merchant"),
                "category": parsed.get("category"),
                "reference": parsed.get("reference"),
                "balance_after": parsed.get("balance_after"),
            },
            received_at=parsed.get("occurred_at"),
        )
    )


def ingest_many(db, user_id: int, parsed_list, source_type: str = "SMS"):
    created = merged = needs_review = 0
    transactions = []
    # Chronological order matters: the resolver merges into what already exists.
    for parsed in sorted(parsed_list, key=lambda p: p["occurred_at"]):
        txn, action = ingest_parsed(db, user_id, parsed, source_type)
        transactions.append(txn)
        if action == "created":
            created += 1
        else:
            merged += 1
    db.flush()
    needs_review = sum(1 for t in transactions if t.needs_review)
    return {
        "created": created,
        "merged": merged,
        "needs_review": needs_review,
        "transactions": transactions,
    }
