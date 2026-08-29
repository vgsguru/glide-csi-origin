# Glide — Pitch Script

> Presenter's script. **Bold** = say it roughly as written. *Italic* = stage direction.
> Two versions: 3-minute and 5-minute. Q&A prep at the end.

---

## Before you walk up

- [ ] Phone: Glide open on the **Dashboard**, screen unlocked, brightness up
- [ ] Quest: charged, **already signed in**, app open on the ready screen
- [ ] Laptop: `manage-buddy.web.app` open in one tab, README in another
- [ ] Screenshots folder open as a **fallback if any device fails**
- [ ] Phone on **Do Not Disturb** — a real bank SMS mid-demo is a gift, a WhatsApp notification is not
- [ ] Know your one number: **145 messages → 36 transactions**

**If a demo dies, do not debug it on stage.** Switch to the screenshot and keep talking. Nobody
scores you on the cable.

---

## The 3-minute version

### 0:00 — The hook *(20s)*

> **Every budgeting app ever built assumes you get paid on the first of the month.**
>
> **About ninety percent of India's workforce doesn't.** Gig drivers, freelancers, small traders,
> commission earners. Irregular amounts, irregular days.
>
> **So when they ask an app "can I afford this?", it answers from a salary that doesn't exist.**

*Pause. Let that sit for a beat.*

### 0:20 — The insight *(25s)*

> **Here's the thing everyone gets wrong. They treat income as a number. It isn't. It's a
> distribution.**
>
> **Glide never tells you that you earn ₹23,000 a month. It tells you your income runs between
> ₹9,500 and ₹37,000, and it tells you what that's based on.**
>
> **Because a bad month you planned for is survivable. A bad month that surprises you isn't.**

### 0:45 — The demo *(75s)*

*Hold up the phone.*

> **No bank login. No statement upload. No typing.**
>
> **Your bank already texts you every time money moves. Glide reads those texts — on the phone,
> nothing uploaded.**

*Show the dashboard.*

> **This is a real inbox. A hundred and forty-five messages became thirty-six transactions,
> categorised, in under two seconds.**
>
> **Net for the period. Income as a range. Where it actually went. And recurring payments it
> found by itself — I never told it I pay for anything.**

*Tap the assistant. Say: "What's safe to spend?"*

> **And every single number in that answer is checked against my actual ledger before you see it.
> If the model invents a figure, the whole answer is thrown away and you get the computed one
> instead.**
>
> **An AI that hallucinates your bank balance is worse than no AI, because you'd believe it.**

### 2:00 — The reach *(35s)*

*Pick up the Quest.*

> **Same ledger, three surfaces. Phone, web, and this.**

*Hand it over, or show the mirrored view.*

> **A real installable Quest app — not a browser tab. In passthrough, so your finances float in
> your actual room. You say "Hey Glide" and just ask.**

### 2:35 — The close *(25s)*

> **Glide is not a budgeting app with a new coat of paint. It's a different assumption about how
> people get paid — and everything else follows from that.**
>
> **It's live at manage-buddy.web.app, both APKs are on GitHub, and the README lists what's still
> broken. Thank you.**

---

## The 5-minute version

Everything above, plus these three inserts.

### Insert A — after the hook *(45s)*

**Why the existing options don't work.**

> **The apps that do handle this want your bank credentials, or they want you to upload a
> statement every month. Most people won't — and honestly, they shouldn't have to.**
>
> **So the real constraint isn't modelling. It's trust. Whatever we built had to work without
> ever asking for a password or seeing a statement.**
>
> **That constraint is what produced the design: read the notifications you already get, parse
> them on the device, and never send the messages anywhere.**

### Insert B — after the phone demo *(60s)*

**Cash, and the thing nobody handles.**

> **Here's a problem every one of these apps gets wrong. You withdraw two thousand rupees from an
> ATM. Every budgeting app I've seen calls that two thousand rupees of spending.**
>
> **It isn't. It's two thousand rupees that moved from an account you can see into a pocket you
> can't.**
>
> **Glide treats it as an unallocated cash pool. Photograph a cash receipt and it draws down from
> that pool instead of counting the money twice. Cash still unaccounted for after two weeks gets
> labelled honestly — uncategorised discretionary — so the balance stays true instead of quietly
> wrong.**

*Optional, if you have a receipt on you — scan it live.*

> **The OCR was its own fight. Text recognition returns blocks in the order it detected them, not
> the order you'd read them. On a two-column receipt our first result was twenty rupees for a
> cappuccino. The real total was eight hundred and seventy-one fifty. We had to throw away the
> block order entirely and rebuild the rows from the bounding-box geometry.**

### Insert C — before the close *(60s)*

**The engineering you can't see, and what's still broken.**

> **Two things I'd point at if you look at the code.**
>
> **First — recurring payments came back as zero, on an inbox full of them. A monthly bill appears
> once in a thirty-day window, so it could never hit the repeat threshold. The feature was
> structurally incapable of working. Detection now runs over a hundred and fifty days while the
> display stays at thirty.**
>
> **Second — our income estimator once reported an income of a hundred and twenty-one rupees a
> month against forty-one thousand rupees of actual credits. Thirty-nine of a hundred and
> sixty-three credits were under a hundred rupees — cashback, refunds, one-rupee verification
> pings — and the median collapsed into that noise.**
>
> **And when we fixed it, the fix had its own bug: it derived the spread from variance alone, so
> two similar deposits looked like perfectly stable income. The app was most confident exactly
> when it had the least evidence. A test caught that one.**

*Then, deliberately:*

> **And I'll tell you what's still broken, because you'd find it anyway. Forty percent of
> merchants still come back as "Unknown" — fixing that needs a corpus of Indian bank SMS
> templates that doesn't exist, because nobody will share their bank texts. The API keys ship
> inside the app, which is unavoidable for a client-only build and wants a proxy. And the voice
> loop is half-duplex, because Gemini's realtime API requires OAuth and rejects API keys outright.**
>
> **It's in the README. We'd rather you heard it from us.**

---

## Demo choreography

| Beat | Device | Show | If it fails |
|---|---|---|---|
| 1 | Phone | Dashboard — 36 from 145 | `docs/screenshots/` |
| 2 | Phone | Income as a range, with basis | Same |
| 3 | Phone | Recurring payments, with confidence % | Same |
| 4 | Phone | Ask "what's safe to spend?" | Say the number yourself; it's `net − floor` |
| 5 | Quest | Passthrough, panels in the room | `vr-room-overview.png` |
| 6 | Quest | "Hey Glide, what did I spend?" | Trigger to talk instead |

**Sequencing note:** do the phone first, always. It's the product. The Quest is the "and also"
— impressive, but it reads as a gimmick if you lead with it.

**Handing over the headset costs 45 seconds** of a 5-minute slot. Only do it if a judge asks, or
if you have the time.

---

## Q&A — likely questions

**"Isn't reading SMS a privacy nightmare?"**
> The opposite — it's why we chose it. Reading SMS needs one Android permission and nothing else.
> The alternative is handing a third party your net-banking credentials. Parsing happens on the
> device; message bodies never leave it. What syncs to the cloud is an aggregate summary — no
> message text, no per-transaction rows.

**"What stops the AI making up numbers?"**
> A numeral guard. We extract every figure from the generated text and check it against the
> grounding context. Any number above 100 that isn't in the context discards the entire response
> and we fall back to the deterministic answer. Not corrected — discarded.

**"Why not just use Plaid / account aggregators?"**
> India's AA framework is genuinely good and it's where this goes at scale. But it requires
> onboarding as a regulated entity, and the users we're targeting are the least likely to trust a
> new app with account linkage. SMS works on day one, on any bank, with no integration.

**"How is this different from Walnut or Money View?"**
> Those parse SMS too — that part isn't novel. Three things are. Income modelled as a
> distribution rather than an average. Cash reconciled against ATM withdrawals instead of
> double-counted. And an assistant that structurally cannot state a number that isn't in your
> ledger.

**"Does it work offline?"**
> Every figure and every deterministic answer is computed on the device. The cloud model only
> rephrases. Turn off the network and you still get correct answers, just plainer ones.

**"Why VR? Isn't that a gimmick?"**
> Fair challenge. It's the third surface, not the pitch. What it genuinely adds is spatial
> comparison — four views at once at arm's length, instead of tabbing on a phone. It also cost us
> almost nothing: it's the same web stack packaged as an APK, 1.6 megabytes.

**"How long did this take?"**
> *[Your answer.]* Worth mentioning: most of the time went into real-inbox correctness, not
> features. Word-boundary bugs, the income collapse, the cash double-count, OCR row ordering.
> Every one was found by running it against a real inbox, not test data.

**"What's next?"**
> Backend proxy so keys leave the client. The merchant corpus. Porting the arbitrator to the
> phone so priority-based advice works offline. And a proper account-aggregator path once the
> trust is earned.

---

## If you only remember one thing

> **Income isn't a number. It's a distribution. Every wrong answer in personal finance for
> variable earners comes from that one mistake — and everything Glide does differently comes
> from fixing it.**

---

<div align="center">
<sub><a href="../README.md">README</a> · <a href="DOCUMENTATION.md">Technical documentation</a></sub>
</div>
