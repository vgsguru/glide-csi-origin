# Glide — Implementation Plan

Companion to [PROJECT_SPEC.md](PROJECT_SPEC.md) and [DESIGN.md](DESIGN.md).
Ordered so that **there is a demoable artifact at the end of every milestone.** If time runs out, you ship the last completed milestone rather than a half-wired everything.

---

## Repo layout

```
/backend
  /app
    /core          settings.py, db.py, security.py, scheduler.py
    /models        user, account, transaction, evidence, obligation,
                   goal, investment, snapshot, signal, insight, agent_run
    /routers       auth, sms, bills, email, transactions, goals,
                   insights, agent, chat, dashboard
    /services      sms_parser, ocr_service, email_service, resolver,
                   classifier, financial_engine, arbitrator, policy,
                   explainer, chat_service
    /detectors     income.py, spend.py, obligations.py, buffer.py
    /agent         loop.py            ← perceive→…→act
    schemas.py  main.py  seed.py
  /tests
  requirements.txt
/web               React + Vite + Tailwind
  /src/components  AgentCard, IncomeBand, ScenarioProjection,
                   ConfidenceChip, SafeToSpendHero, ReviewRow, SourceBadge
  /src/pages       Onboarding, Login, Home, Dashboard, Activity, Chat, Profile
  /src/api         typed client
/android           Kotlin — capture client only
  SmsReceiver.kt, ApiClient.kt, PermissionScreen.kt, StatusScreen.kt
/docs              the three .md files
/samples           sample_sms.json, sample_emails.json, bills/*.jpg
```

---

## M0 — Skeleton (≈1h)
FastAPI app, SQLAlchemy + SQLite, JWT auth, `/auth/*`, health check. Alembic optional — for a hackathon, `create_all` plus a `reset_db.py` is faster and safer.
**Done when:** signup → login → `/auth/me` works via curl, and `pytest` runs green.

## M1 — Ingestion + entity resolution (≈3h) ★ core marks
The resolver is the hard part; build it before anything depends on it.

1. Models: `Transaction`, `TransactionEvidence`, `Account`.
2. `sms_parser.py` — regex + additive confidence. Unit-test against ≥20 real-shape Indian bank/UPI SMS (HDFC, ICICI, SBI, Paytm, GPay, plus 3 promos that must be rejected).
3. `resolver.py` — the §5 algorithm: candidate window → merge or create → source authority → `conf = 1 − Π(1 − conf_i)` → conflict flag → promote at 0.85.
4. `POST /sms/ingest`, `/sms/ingest-batch` → returns `{created, merged, needs_review}`.
5. `seed.py` — 90 days of realistic variable-income history: irregular gig deposits, rent, 2 subscriptions, a SIP, discretionary noise. **Plant one Amazon purchase that arrives as both SMS and email** so the merge is demoable on demand.

**Done when:** ingesting the SMS *and* the email for the same order yields **one** transaction, two evidence rows, and confidence higher than either source alone. Write that as a test — it is the single most defensible thing in the build.

## M2 — State & learning (≈2h)
`financial_engine.py` (p10/p50/p90 with `basis`, balance, discretionary run-rate, 30-day 3-scenario projection, snapshot write) and `classifier.py` (`refresh_recurring_obligations` with rising confidence).
**Done when:** `/dashboard/state` returns a full `FinancialStateOut` over seeded data, and obligations were *discovered*, not configured.

## M3 — The agent loop (≈4h) ★★ the submission
1. `detectors/` — all of §6.3, each returning `Signal` objects with evidence refs. Pure functions over a snapshot; trivially unit-testable.
2. `arbitrator.py` — the §6.4 waterfall over `user.priorities` with `floor_mult` from risk tolerance.
3. `policy.py` — scoring, attention budget, cooldown, novelty, suppression.
4. `explainer.py` — template path first, then the optional LLM path behind the same interface. **Numeral-validation guard**: reject any figure not present in the input.
5. `agent/loop.py` — the seven stages; writes `AgentRun`.
6. `core/scheduler.py` — APScheduler tick at `AGENT_TICK_SECONDS`, plus debounced trigger on ingestion. `POST /agent/tick` to force one on stage.
7. `GET /agent/runs`.

**Done when:** changing `risk_tolerance` or reordering `priorities` in the DB and forcing a tick produces a *different arbitration decision* — with the reasoning visible in `AgentRun`. Ship nothing else until this works; it is what separates this from a tracker.

## M4 — Remaining ingestion + chat (≈2.5h)
OCR upload → editable draft (never auto-commit); email demo mode with bundled samples; chat grounded in the snapshot with `cited_snapshot_id`, rule-based first.
**Done when:** all four paths land through the resolver, and chat answers "can I afford ₹2,000 this weekend?" with real numbers and a citation.

## M5 — Web app (≈6h) ★ where the marks become visible
Order matters — build the components that carry the argument first.

1. API client + auth + onboarding (the drag-to-order priorities step is not optional: it is the arbitrator's input).
2. `AgentCard` with the "Why am I seeing this?" evidence expansion. **Build this before the charts.**
3. Home: hero, card feed, review queue banner.
4. Dashboard: `IncomeBand`, `ScenarioProjection`, obligations with confidence bars.
5. **Activity screen** — the `AgentRun` log with surfaced/suppressed and scores.
6. Chat, Profile (edits trigger a visible re-tick).

**Done when:** dismissing a card, then forcing a tick, does *not* resurrect it — and the Activity log shows exactly why ("cooldown, dismissed 2d ago").

## M6 — Android capture client (≈2.5h)
`READ_SMS`/`RECEIVE_SMS` permission with a plain-language rationale screen, `SmsReceiver` → `ApiClient` → `/sms/ingest`, backfill of the last 30 days on first grant, one status screen (last sync, count ingested, sync-now). **No mirrored dashboards.**
**Done when:** a real SMS on a device appears in the web dashboard within seconds. Record this as a video — device demos fail on stage.

## M7 — Polish (≈2h)
Suppression log formatting, confidence vocabulary consistency, empty states, README with a 60-second setup, `.env.example`, seed reset script.

---

## Demo script (5 minutes)

1. **Cold open — the merge.** Ingest the Amazon SMS. Then the Amazon email. One transaction, two source badges, confidence rose 0.72 → 0.94. *"Most systems would have booked this twice."*
2. **Uncertainty.** Dashboard: income as a band, not a number, with its basis. *"Three deposits — so it's a wide band, and the app says so."*
3. **Learning.** Obligations list — nothing here was configured; rent and both subscriptions were discovered, with confidence that grew per repeat.
4. **The agent acts.** Force a tick. A buffer-vs-SIP card appears. Expand "Why am I seeing this?" — real numbers, real source rows.
5. **Preference alignment.** Flip risk tolerance to aggressive, or drag `investing` above `buffer`. Re-tick. **The recommendation reverses.** *"Same data, same engine — different user."*
6. **The close — Activity.** *"It considered three things and said one. Here are the other two, and the scores that kept them quiet."*

Beats 1, 5 and 6 are the ones that win. Rehearse those.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Tesseract binary missing on demo machine | Bundle `/samples/bills/*.jpg` and a "use sample bill" button; never depend on a live camera |
| LLM key absent / rate-limited / slow | Template path is the default, not the fallback; LLM is an upgrade toggled by env |
| Android device fails on stage | Pre-recorded 30s video + the web "Simulate SMS" button reproduces the same path |
| Resolver over-merges two genuinely separate purchases | Tolerance is tight (±2% / 72h / merchant overlap); merges are reversible from the review queue — and showing that unmerge exists is itself a good answer to a judge's question |
| Time overrun | Cut in this order: Android → live Gmail OAuth → LLM explainer → charts. Never cut M3. |

## Test coverage that is worth writing

Six tests carry the whole argument — write these even if nothing else gets tested:

1. SMS + email for one order → one transaction, two evidence rows, raised confidence.
2. Conflicting amounts → `has_conflict`, authoritative amount kept, lands in review.
3. Thin income history → wide band + honest `basis` string.
4. Same merchant ×3 → obligation with rising confidence; then 2 misses → `dormant`.
5. Identical state, different `priorities` order → opposite arbitration outcome.
6. Dismissed insight + unchanged magnitude → not resurfaced; +30% magnitude → resurfaced.
