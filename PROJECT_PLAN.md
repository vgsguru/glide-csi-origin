# Pravah / Glide — Build Plan

> An agentic AI copilot for variable-income financial management.
> Perceive → Model → Reason → Act. Powered locally by **gemma4:12b** via Ollama.

## 1. What ships

| Deliverable | Stack | Status target |
|---|---|---|
| **Backend API** | Python 3.14 · Flask · SQLAlchemy · SQLite · Ollama | All endpoints live |
| **Web app** | React 18 · Vite · Tailwind · framer-motion (liquid-glass theme) | All 6 screens wired to real API |
| **Android app** | Kotlin · Jetpack Compose Material3 (same theme) | Signed debug **APK** |

## 2. Shared design system (web ⇄ android parity)

| Token | Web (`index.css`) | Android (`Theme.kt`) |
|---|---|---|
| Background | `oklch(0.08 0 0)` | `#141414` |
| Foreground | `oklch(0.98 0 0)` | `#FAFAFA` |
| Card / glass | `white 12%` gradient + blur | `Color.White.copy(0.06f)` + 1dp `white 12%` border |
| Radius | `rounded-3xl` (24px) / `4xl` (32px) | `24.dp` / `32.dp` |
| Display font | Space Grotesk, tracking `-0.02em` | Space Grotesk, `letterSpacing = (-0.5).sp` |
| Body font | Inter | Inter |
| Nav | floating glass pill, animated active chip | floating glass pill bottom bar, animated active chip |
| Accent (positive) | green-500/10 · green-400 | `#4ADE80` @ 10% bg |
| Accent (risk) | red-500/10 · red-400 | `#F87171` @ 10% bg |

Both apps use the same screen set and the same vocabulary:
**Onboarding → Dashboard (Home) → Chat → Activity → Profile.**

## 3. Backend architecture

```
backend/app/
  core/          db.py · security.py (itsdangerous tokens + werkzeug hashing)
  models/        finance.py  (User, Account, Transaction, TransactionEvidence,
                              Obligation, Insight, AgentRun, ChatMessage, Snapshot)
  services/
    sms_parser.py       regex + additive confidence over Indian bank/UPI SMS
    resolver.py         entity resolution — conf = 1 − Π(1 − conf_i), merge window ±2% / 72h
    classifier.py       recurring-obligation discovery, confidence rises per repeat
    financial_engine.py income p10/p50/p90, safe-to-spend, 30-day 3-scenario projection
    llm_service.py      Ollama gemma4:12b — chat, extraction, insight explanation
    chat_service.py     grounded chat: builds snapshot context → LLM → numeral guard
  detectors/     income · spend · obligations · buffer  → Signal objects
  agent/         arbitrator.py (priority waterfall) · policy.py (score/cooldown) · loop.py
  routers/       auth · sms · transactions · dashboard · insights · agent · chat · profile
  seed.py        90 days of realistic variable-income history
```

### Endpoints
```
POST /auth/signup           POST /auth/login          GET  /auth/me
POST /sms/ingest            POST /sms/ingest-batch    GET  /sms/status
GET  /transactions          POST /transactions        GET  /transactions/categories
GET  /dashboard/state       GET  /dashboard/projection
GET  /obligations           GET  /insights            POST /insights/<id>/dismiss
POST /agent/tick            GET  /agent/runs
POST /chat                  GET  /chat/history        GET  /chat/suggestions
GET  /profile               PATCH /profile
POST /demo/seed             GET  /health
```

### The reasoning core (what makes this an agent, not a tracker)
1. **Perceive** — SMS/manual/email land through `sms_parser` → confidence-scored.
2. **Model** — `resolver` dedupes across sources; `classifier` discovers recurring obligations; `financial_engine` recomputes the live state snapshot.
3. **Reason** — `detectors/` emit Signals; `arbitrator` resolves competing objectives against the user's *stated priority order* and risk tolerance; `policy` scores, applies cooldown + novelty and suppresses the rest.
4. **Act** — surfaced Insights on Home, grounded Chat answers, and a full `AgentRun` audit log on Activity showing what was suppressed and why.

Same data + different `priorities` order ⇒ **different decision**. That is the demo.

## 4. Android app — SMS analysis pipeline

1. Request `READ_SMS` with a plain-language rationale screen.
2. `SmsReader` queries `content://sms/inbox` for `date >= now − 30d`.
3. `SmsParser.kt` — a Kotlin port of the backend parser (identical regex + confidence rules) runs **on-device**, so the dashboard works with no network.
4. Segregation: `CREDIT` / `DEBIT`, category (Food, Rent, Shopping, Bills, Transport, Salary, Transfer, Investment), recurring detection, merchant extraction, promo rejection.
5. `SmsRepository` aggregates → total in/out, net, category breakdown, income band, safe-to-spend, top merchants, recurring obligations, daily spend series.
6. `SyncWorker` uploads parsed rows to `POST /sms/ingest-batch` so the web dashboard mirrors the phone.
7. `RECEIVE_SMS` broadcast receiver keeps it live for new messages.
8. **Chat** screen → `POST /chat` on the PC backend → gemma4:12b, with on-device financial context attached. Base URL editable in Profile (defaults to `10.0.2.2:8080` for emulator).

## 5. Toolchain to provision (none present initially)
- Node 24 LTS (portable zip) → build the web app
- Temurin JDK 21 (portable zip) → Gradle/AGP
- Android SDK cmdline-tools → `platforms;android-35`, `build-tools;35.0.0`, `platform-tools`
- Gradle wrapper 8.11.1 (downloaded by the wrapper itself)

## 6. Milestones
- **M1** Backend: models, auth, parser, resolver, engine — `/health` + `/dashboard/state` green
- **M2** Backend: detectors, arbitrator, policy, agent loop, `/agent/runs`
- **M3** Backend: chat via gemma4:12b + seed data
- **M4** Web: API client + all screens on live data
- **M5** Android: theme, nav, SMS pipeline, 5 screens
- **M6** Build APK, verify, hand over path
