"""Indian bank / UPI SMS parser.

Design rules:
  * Never treat a parse as fact. Every extraction carries an additive confidence.
  * Reject promotional traffic aggressively -- a false transaction is far worse
    than a missed one, because it silently corrupts the financial state model.
  * The Kotlin parser in the Android client is a direct port of this file; keep
    the two in sync when editing patterns.
"""
import hashlib
import re
from datetime import datetime, timedelta, timezone

# --------------------------------------------------------------------------
# Amount / direction / merchant patterns
# --------------------------------------------------------------------------

_AMOUNT_RE = re.compile(
    r"(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"
    r"|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|₹)",
    re.IGNORECASE,
)

_DEBIT_WORDS = [
    "debited", "debit", "spent", "paid", "withdrawn", "purchase", "deducted",
    "sent", "transferred to", "payment of", "charged", "txn of",
]
_CREDIT_WORDS = [
    "credited", "credit", "received", "deposited", "refund", "cashback",
    "salary", "transferred from", "added to",
]

# Words that begin bank boilerplate rather than a payee. Indian bank alerts end
# with things like "SMS BLOCK to 567676" or "call 1800... to report", and a
# naive "to <name>" capture happily returns "Block" or "report". Case is not a
# filter here: the patterns are IGNORECASE, so [A-Z] matches lowercase too.
_NON_MERCHANT_LEADS = {
    "block", "view", "end", "avoid", "download", "continue", "report", "call",
    "dial", "know", "click", "visit", "check", "update", "complete", "verify",
    "use", "get", "claim", "unsubscribe", "stop", "reply", "sms", "contact",
    "login", "log", "activate", "renew", "recharge", "ignore", "disregard",
    "confirm", "track", "manage", "enable", "disable", "settle", "repay",
    "your", "the", "this", "that", "any", "all", "be", "is", "was", "will",
    "date", "time", "today", "tomorrow", "help", "support", "customer", "care",
}


_AMOUNT_SHAPED = re.compile(r"^(?:rs\.?|inr|₹)?\s*[0-9][0-9,]*(?:\.[0-9]+)?$", re.IGNORECASE)


def _looks_like_boilerplate(name: str) -> bool:
    cleaned = name.strip()
    # "... credited by Rs.9500 to ..." can capture the amount as the payee.
    if _AMOUNT_SHAPED.match(cleaned):
        return True
    first = re.split(r"[\s,.]+", cleaned.lower(), maxsplit=1)[0]
    return first in _NON_MERCHANT_LEADS


_MERCHANT_PATTERNS = [
    # \b matters: without it "to" matches inside "ZOMATO" and the payee name
    # loses its first word.
    re.compile(r"\b(?:to|at|towards)\s+([A-Z0-9][A-Za-z0-9&'\.\- ]{2,40}?)(?:\s+on\b|\s+ref\b|\s+upi\b|[.,;]|$)", re.IGNORECASE),
    re.compile(r"\b(?:from)\s+([A-Z0-9][A-Za-z0-9&'\.\- ]{2,40}?)(?:\s+on\b|\s+ref\b|[.,;]|$)", re.IGNORECASE),
    re.compile(r"vpa\s+([a-z0-9._\-]+@[a-z]+)", re.IGNORECASE),
    # Stop at the sentence end -- banks append "... Available balance INR X."
    re.compile(r"info[:\-\s]+([A-Za-z0-9&'\-/ ]{3,40})", re.IGNORECASE),
]

_ACCOUNT_RE = re.compile(
    r"(?:a/c|acct|account|card|ac)\s*(?:no\.?)?\s*[xX*]*\s*([0-9]{3,6})", re.IGNORECASE
)
_REF_RE = re.compile(r"(?:ref(?:erence)?|txn|utr|rrn)\s*(?:no\.?|id)?[:\s#]*([A-Za-z0-9]{6,20})", re.IGNORECASE)
_BALANCE_RE = re.compile(r"(?:avl|available|avbl|bal(?:ance)?)[^0-9]{0,18}([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.IGNORECASE)

_DATE_PATTERNS = [
    (re.compile(r"\b(\d{2})[-/](\d{2})[-/](\d{4})\b"), "%d-%m-%Y"),
    (re.compile(r"\b(\d{2})[-/](\d{2})[-/](\d{2})\b"), "%d-%m-%y"),
    (re.compile(r"\b(\d{4})[-/](\d{2})[-/](\d{2})\b"), "%Y-%m-%d"),
    (re.compile(r"\b(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})\b"), None),
]

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# --------------------------------------------------------------------------
# Promo / OTP rejection
# --------------------------------------------------------------------------

_REJECT_PHRASES = [
    "otp", "one time password", "do not share", "click here", "offer", "sale",
    "discount", "cashback offer", "win ", "congratulations", "loan approved",
    "pre-approved", "apply now", "limited time", "lowest price", "coupon",
    "flat %", "% off", "unsubscribe", "download the app", "get upto",
    "eligible for", "reward points expiring", "recharge now", "plan expires",
    "will be debited", "is due", "due on", "reminder", "kindly pay",
    "request money", "requesting", "collect request", "failed", "declined",
    "unsuccessful", "reversed",
]

_TXN_ANCHORS = [
    "debited", "credited", "spent", "paid", "withdrawn", "received",
    "deposited", "transferred", "purchase", "refund", "txn", "payment",
    "transaction", "trf", "sent to", "debit", "credit",
]

# Known bank / wallet sender-id fragments.
_KNOWN_SENDERS = [
    "hdfc", "icici", "sbi", "axis", "kotak", "yesbnk", "idfc", "indus", "pnb",
    "bob", "canbnk", "unionb", "federal", "rbl", "aubank", "bandhn", "csbbnk",
    "paytm", "gpay", "phonpe", "phonepe", "amazonpay", "mobikwik", "freecharg",
    "slice", "jupiter", "fi", "cred", "razorpay", "billdesk", "airtel", "jio",
]

# --------------------------------------------------------------------------
# Category rules
# --------------------------------------------------------------------------

CATEGORY_RULES = [
    ("Food", [
        "swiggy", "zomato", "dominos", "pizza", "mcdonald", "kfc", "burger",
        "starbucks", "cafe", "restaurant", "eatfit", "faasos", "biryani",
        "dunzo", "blinkit", "zepto", "instamart", "bigbasket", "grofers",
        "licious", "freshtohome", "hotel", "bakery", "chai", "barbeque",
    ]),
    ("Transport", [
        "uber", "ola", "rapido", "irctc", "redbus", "indigo", "spicejet",
        "airindia", "vistara", "metro", "dmrc", "bmtc", "fastag", "petrol",
        "hpcl", "iocl", "bpcl", "shell", "fuel", "parking", "yulu", "bounce",
    ]),
    ("Shopping", [
        "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "tatacliq",
        "snapdeal", "decathlon", "ikea", "croma", "reliance digital", "lifestyle",
        "westside", "zara", "hm ", "shoppers stop", "pharmeasy", "1mg", "netmeds",
        "apollo", "dmart", "more retail", "spencer",
    ]),
    ("Bills", [
        "electricity", "bescom", "mseb", "tneb", "kseb", "bses", "tata power",
        "adani electricity", "water bill", "gas", "indane", "hp gas", "broadband",
        "act fibernet", "hathway", "jiofiber", "airtel", "vodafone", "vi ",
        "jio", "bsnl", "dth", "tatasky", "tata play", "dish tv", "insurance",
        "lic ", "premium", "policybazaar", "municipal", "property tax",
    ]),
    ("Entertainment", [
        "netflix", "prime video", "hotstar", "disney", "spotify", "youtube premium",
        "gaana", "wynk", "sonyliv", "zee5", "voot", "bookmyshow", "pvr", "inox",
        "playstation", "steam", "xbox",
    ]),
    ("Rent", ["rent", "landlord", "nobroker", "housing", "society maintenance", "maintenance charge"]),
    ("Investment", [
        "sip", "mutual fund", "groww", "zerodha", "upstox", "coin", "kuvera",
        "etmoney", "smallcase", "nps", "ppf", "elss", "nippon", "hdfc amc",
        "icici pru", "sbi mf", "axis mf", "mirae", "parag parikh", "quant mf",
        "recurring deposit", "fixed deposit",
    ]),
    ("Health", ["hospital", "clinic", "diagnostic", "lab", "practo", "cult.fit", "cultfit", "gym", "fitness", "medical"]),
    ("Education", ["udemy", "coursera", "byju", "unacademy", "vedantu", "school fee", "college", "tuition", "exam fee"]),
    ("Salary", ["salary", "payroll", "stipend", "wages"]),
    ("Transfer", ["upi", "imps", "neft", "rtgs", "transfer", "sent to", "received from"]),
]

_INCOME_HINTS = [
    "salary", "payroll", "stipend", "client", "invoice", "payout", "settlement",
    "freelance", "commission", "refund", "cashback", "interest", "dividend",
]

# Merchants that read like people rather than businesses (UPI p2p).
_PERSON_LIKE = re.compile(r"^[a-z0-9._\-]+@[a-z]+$", re.IGNORECASE)


def _clean_amount(raw: str) -> float:
    return float(raw.replace(",", ""))


def _find_amount(text: str):
    """Returns (amount, matched_with_currency_symbol)."""
    match = _AMOUNT_RE.search(text)
    if match:
        raw = match.group(1) or match.group(2)
        try:
            return _clean_amount(raw), True
        except ValueError:
            pass
    # Fall back to a bare number next to a transaction verb.
    fallback = re.search(
        r"(?:debited|credited|spent|paid|received)\s*(?:by|for|of|with)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        text, re.IGNORECASE,
    )
    if fallback:
        try:
            return _clean_amount(fallback.group(1)), False
        except ValueError:
            pass
    return None, False


def _find_direction(low: str):
    debit_hit = next((w for w in _DEBIT_WORDS if w in low), None)
    credit_hit = next((w for w in _CREDIT_WORDS if w in low), None)
    if debit_hit and credit_hit:
        # Both present -- the earlier verb usually describes the actual movement.
        return ("DEBIT", 0.6) if low.index(debit_hit) < low.index(credit_hit) else ("CREDIT", 0.6)
    if debit_hit:
        return "DEBIT", 0.85
    if credit_hit:
        return "CREDIT", 0.85
    return None, 0.0


def _find_merchant(text: str):
    for pattern in _MERCHANT_PATTERNS:
        match = pattern.search(text)
        if match:
            name = match.group(1).strip(" .,-")
            name = re.sub(r"\s{2,}", " ", name)
            # Strip the trailing clause banks append after the payee name
            # ("... to SPOTIFY INDIA is successful on 30-05-2026").
            name = re.sub(
                r"\b(on|ref|refno|upi|txn|dated|via|is|was|has|for|with|successful|"
                r"success|completed|credited|debited|trf|from|your)\b.*$",
                "", name, flags=re.IGNORECASE,
            ).strip(" .,-")
            # Keep looking if this capture is bank boilerplate rather than a payee.
            if _looks_like_boilerplate(name):
                continue
            if 2 < len(name) <= 40 and not name.isdigit():
                return name
    return None


def _find_channel(low: str):
    if "upi" in low or "vpa" in low or "@" in low:
        return "UPI"
    if "atm" in low or "withdrawn" in low:
        return "ATM"
    if "card" in low or "pos" in low:
        return "CARD"
    if "neft" in low or "imps" in low or "rtgs" in low or "netbanking" in low:
        return "NETBANKING"
    return "BANK"


def _keyword_re(keyword: str):
    """Word-boundary matcher.

    Plain substring matching is a trap here: "lab" matches "avai(lab)le" and
    "to" matches "ZOMA(TO)". Every keyword is anchored on word boundaries.
    """
    return re.compile(r"\b" + re.escape(keyword.strip()) + r"\b", re.IGNORECASE)


_CATEGORY_MATCHERS = [
    (label, [_keyword_re(k) for k in keywords]) for label, keywords in CATEGORY_RULES
]
_INCOME_HINT_MATCHERS = [(hint, _keyword_re(hint)) for hint in _INCOME_HINTS]


def categorize(merchant: str, text: str, direction: str) -> str:
    haystack = f"{merchant or ''} {text or ''}"
    if direction == "CREDIT":
        for hint, matcher in _INCOME_HINT_MATCHERS:
            if matcher.search(haystack):
                return "Salary" if hint in ("salary", "payroll", "stipend") else "Income"
    for label, matchers in _CATEGORY_MATCHERS:
        for matcher in matchers:
            if matcher.search(haystack):
                if label == "Transfer" and direction == "CREDIT":
                    return "Income"
                return label
    if direction == "CREDIT":
        return "Income"
    if merchant and _PERSON_LIKE.match(merchant):
        return "Transfer"
    return "Other"


def _find_date(text: str, fallback: datetime) -> datetime:
    for pattern, fmt in _DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        try:
            if fmt is None:
                day, mon, year = match.group(1), match.group(2).lower()[:3], match.group(3)
                if mon not in _MONTHS:
                    continue
                year_int = int(year)
                if year_int < 100:
                    year_int += 2000
                return datetime(year_int, _MONTHS[mon], int(day), 12, 0, tzinfo=timezone.utc)
            parsed = datetime.strptime(match.group(0).replace("/", "-"), fmt)
            return parsed.replace(hour=12, tzinfo=timezone.utc)
        except (ValueError, KeyError):
            continue
    return fallback


def is_probable_promo(text: str, sender: str = "") -> bool:
    low = (text or "").lower()
    if not any(anchor in low for anchor in _TXN_ANCHORS):
        return True
    for phrase in _REJECT_PHRASES:
        if phrase in low:
            # A real debit alert can still say "txn ... failed"; treat those as promo/noise.
            return True
    return False


def dedupe_key(user_id: int, amount: float, direction: str, merchant: str, when: datetime) -> str:
    bucket = when.strftime("%Y%m%d") if when else "nodate"
    raw = f"{user_id}|{round(amount, 2)}|{direction}|{(merchant or '').lower().strip()}|{bucket}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def parse_sms(text: str, sender: str = "", received_at: datetime = None) -> dict:
    """Parse one SMS into a confidence-scored transaction candidate.

    Returns a dict with `ok`. When False, `reason` explains the rejection --
    which the review queue surfaces rather than hiding.
    """
    received_at = received_at or datetime.now(timezone.utc)
    text = (text or "").strip()
    sender = (sender or "").strip()
    low = text.lower()

    if len(text) < 10:
        return {"ok": False, "reason": "too_short", "confidence": 0.0}

    if is_probable_promo(text, sender):
        return {"ok": False, "reason": "promotional_or_non_transactional", "confidence": 0.0}

    amount, had_symbol = _find_amount(text)
    if amount is None or amount <= 0:
        return {"ok": False, "reason": "no_amount", "confidence": 0.0}
    if amount > 10_000_000:
        return {"ok": False, "reason": "implausible_amount", "confidence": 0.0}

    direction, direction_conf = _find_direction(low)
    if direction is None:
        return {"ok": False, "reason": "no_direction", "confidence": 0.0}

    merchant = _find_merchant(text)
    account = _ACCOUNT_RE.search(text)
    reference = _REF_RE.search(text)
    balance = _BALANCE_RE.search(text)
    occurred_at = _find_date(text, received_at)

    # ---- additive confidence -------------------------------------------------
    confidence = 0.30
    if had_symbol:
        confidence += 0.20                       # explicit Rs./INR/₹ marker
    confidence += direction_conf * 0.20          # unambiguous direction verb
    if account:
        confidence += 0.10                       # names an account/card
    if reference:
        confidence += 0.10                       # carries a bank reference id
    if balance:
        confidence += 0.05                       # quotes a resulting balance
    if merchant:
        confidence += 0.08
    sender_low = sender.lower()
    if any(known in sender_low for known in _KNOWN_SENDERS):
        confidence += 0.12                       # recognised bank/wallet sender
    elif re.match(r"^[A-Z]{2}-[A-Z]{6}$", sender.upper()):
        confidence += 0.06                       # DLT-format sender id
    confidence = round(min(confidence, 0.97), 3)

    channel = _find_channel(low)
    category = categorize(merchant, text, direction)

    return {
        "ok": True,
        "amount": amount,
        "direction": direction,
        "merchant": merchant or ("Bank Transfer" if channel == "NETBANKING" else "Unknown"),
        "category": category,
        "channel": channel,
        "account_hint": f"{_sender_bank(sender)} XX{account.group(1)}" if account else _sender_bank(sender),
        "reference": reference.group(1) if reference else None,
        "balance_after": _clean_amount(balance.group(1)) if balance else None,
        "occurred_at": occurred_at,
        "confidence": confidence,
        "sender": sender,
        "raw": text,
    }


def _sender_bank(sender: str) -> str:
    low = (sender or "").lower()
    for known in _KNOWN_SENDERS:
        if known in low:
            return known.upper()
    return sender.upper() if sender else "UNKNOWN"


def parse_batch(messages, user_id: int = 0):
    """messages: iterable of {body, sender, received_at(iso or epoch ms)}."""
    parsed, rejected = [], []
    for message in messages:
        body = message.get("body") or message.get("text") or ""
        sender = message.get("sender") or message.get("address") or ""
        received_at = _coerce_time(message.get("received_at") or message.get("date"))
        result = parse_sms(body, sender, received_at)
        if result.get("ok"):
            result["dedupe_key"] = dedupe_key(
                user_id, result["amount"], result["direction"],
                result["merchant"], result["occurred_at"],
            )
            parsed.append(result)
        else:
            rejected.append({"sender": sender, "body": body[:160], "reason": result.get("reason")})
    return parsed, rejected


def _coerce_time(value):
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        # Epoch milliseconds (Android) or seconds.
        seconds = value / 1000.0 if value > 10_000_000_000 else float(value)
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    try:
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def window_start(days: int = 30) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)
