package app.glide.data

import java.util.Calendar
import java.util.Locale
import java.util.regex.Pattern

/**
 * On-device Indian bank / UPI SMS parser.
 *
 * A direct port of backend/app/services/sms_parser.py -- same patterns, same
 * additive confidence, same promo rejection. Parsing on-device means the
 * dashboard is populated the instant permission is granted, with no network
 * and no inbox contents leaving the phone unless the user syncs.
 *
 * Keep this file and its Python twin in step when editing rules.
 */
object SmsParser {

    // --- patterns ----------------------------------------------------------
    private val AMOUNT = Pattern.compile(
        "(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)" +
            "|([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:rs\\.?|inr|₹)",
        Pattern.CASE_INSENSITIVE,
    )
    private val AMOUNT_FALLBACK = Pattern.compile(
        "(?:debited|credited|spent|paid|received)\\s*(?:by|for|of|with)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE,
    )

    // \b matters: without it "to" matches inside "ZOMATO".
    private val MERCHANT_PATTERNS = listOf(
        Pattern.compile(
            "\\b(?:to|at|towards)\\s+([A-Z0-9][A-Za-z0-9&'.\\- ]{2,40}?)(?:\\s+on\\b|\\s+ref\\b|\\s+upi\\b|[.,;]|$)",
            Pattern.CASE_INSENSITIVE,
        ),
        Pattern.compile(
            "\\b(?:from)\\s+([A-Z0-9][A-Za-z0-9&'.\\- ]{2,40}?)(?:\\s+on\\b|\\s+ref\\b|[.,;]|$)",
            Pattern.CASE_INSENSITIVE,
        ),
        Pattern.compile("vpa\\s+([a-z0-9._\\-]+@[a-z]+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("info[:\\-\\s]+([A-Za-z0-9&'\\-/ ]{3,40})", Pattern.CASE_INSENSITIVE),
    )
    // Indian bank alerts end with boilerplate like "SMS BLOCK to 567676" or
    // "call 1800... to report", and a naive "to <name>" capture returns
    // "Block" or "report". Case is no filter: the patterns are IGNORECASE.
    private val NON_MERCHANT_LEADS = setOf(
        "block", "view", "end", "avoid", "download", "continue", "report", "call",
        "dial", "know", "click", "visit", "check", "update", "complete", "verify",
        "use", "get", "claim", "unsubscribe", "stop", "reply", "sms", "contact",
        "login", "log", "activate", "renew", "recharge", "ignore", "disregard",
        "confirm", "track", "manage", "enable", "disable", "settle", "repay",
        "your", "the", "this", "that", "any", "all", "be", "is", "was", "will",
        "date", "time", "today", "tomorrow", "help", "support", "customer", "care",
    )

    // "... credited by Rs.9500 to ..." can capture the amount as the payee.
    private val AMOUNT_SHAPED = Pattern.compile(
        "^(?:rs\\.?|inr|₹)?\\s*[0-9][0-9,]*(?:\\.[0-9]+)?$",
        Pattern.CASE_INSENSITIVE,
    )

    private fun looksLikeBoilerplate(name: String): Boolean {
        val cleaned = name.trim()
        if (AMOUNT_SHAPED.matcher(cleaned).matches()) return true
        val first = cleaned.lowercase(Locale.ROOT).split(Regex("[\\s,.]+")).firstOrNull().orEmpty()
        return first in NON_MERCHANT_LEADS
    }

    private val MERCHANT_TAIL = Pattern.compile(
        "\\b(on|ref|refno|upi|txn|dated|via|is|was|has|for|with|successful|success|" +
            "completed|credited|debited|trf|from|your)\\b.*$",
        Pattern.CASE_INSENSITIVE,
    )

    private val ACCOUNT = Pattern.compile(
        "(?:a/c|acct|account|card|ac)\\s*(?:no\\.?)?\\s*[xX*]*\\s*([0-9]{3,6})",
        Pattern.CASE_INSENSITIVE,
    )
    private val REFERENCE = Pattern.compile(
        "(?:ref(?:erence)?|txn|utr|rrn)\\s*(?:no\\.?|id)?[:\\s#]*([A-Za-z0-9]{6,20})",
        Pattern.CASE_INSENSITIVE,
    )
    private val BALANCE = Pattern.compile(
        "(?:avl|available|avbl|bal(?:ance)?)[^0-9]{0,18}([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE,
    )
    private val DLT_SENDER = Pattern.compile("^[A-Z]{2}-[A-Z]{6}$")

    private val DEBIT_WORDS = listOf(
        "debited", "debit", "spent", "paid", "withdrawn", "purchase", "deducted",
        "sent", "transferred to", "payment of", "charged", "txn of",
    )
    private val CREDIT_WORDS = listOf(
        "credited", "credit", "received", "deposited", "refund", "cashback",
        "salary", "transferred from", "added to",
    )

    private val REJECT_PHRASES = listOf(
        "otp", "one time password", "do not share", "click here", "offer", "sale",
        "discount", "cashback offer", "win ", "congratulations", "loan approved",
        "pre-approved", "apply now", "limited time", "lowest price", "coupon",
        "flat %", "% off", "unsubscribe", "download the app", "get upto",
        "eligible for", "reward points expiring", "recharge now", "plan expires",
        "will be debited", "is due", "due on", "reminder", "kindly pay",
        "request money", "requesting", "collect request", "failed", "declined",
        "unsuccessful", "reversed",
    )
    private val TXN_ANCHORS = listOf(
        "debited", "credited", "spent", "paid", "withdrawn", "received",
        "deposited", "transferred", "purchase", "refund", "txn", "payment",
        "transaction", "trf", "sent to", "debit", "credit",
    )
    private val KNOWN_SENDERS = listOf(
        "hdfc", "icici", "sbi", "axis", "kotak", "yesbnk", "idfc", "indus", "pnb",
        "bob", "canbnk", "unionb", "federal", "rbl", "aubank", "bandhn", "csbbnk",
        "paytm", "gpay", "phonpe", "phonepe", "amazonpay", "mobikwik", "freecharg",
        "slice", "jupiter", "fi", "cred", "razorpay", "billdesk", "airtel", "jio",
    )

    // --- categories --------------------------------------------------------
    private val CATEGORY_RULES: List<Pair<String, List<String>>> = listOf(
        "Food" to listOf(
            "swiggy", "zomato", "dominos", "pizza", "mcdonald", "kfc", "burger",
            "starbucks", "cafe", "restaurant", "eatfit", "faasos", "biryani",
            "dunzo", "blinkit", "zepto", "instamart", "bigbasket", "grofers",
            "licious", "freshtohome", "hotel", "bakery", "chai", "barbeque",
        ),
        "Transport" to listOf(
            "uber", "ola", "rapido", "irctc", "redbus", "indigo", "spicejet",
            "airindia", "vistara", "metro", "dmrc", "bmtc", "fastag", "petrol",
            "hpcl", "iocl", "bpcl", "shell", "fuel", "parking", "yulu", "bounce",
        ),
        "Shopping" to listOf(
            "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "tatacliq",
            "snapdeal", "decathlon", "ikea", "croma", "reliance digital", "lifestyle",
            "westside", "zara", "shoppers stop", "pharmeasy", "1mg", "netmeds",
            "apollo", "dmart", "more retail", "spencer",
        ),
        "Bills" to listOf(
            "electricity", "bescom", "mseb", "tneb", "kseb", "bses", "tata power",
            "adani electricity", "water bill", "gas", "indane", "hp gas", "broadband",
            "act fibernet", "hathway", "jiofiber", "airtel", "vodafone", "jio",
            "bsnl", "dth", "tatasky", "tata play", "dish tv", "insurance",
            "lic", "premium", "policybazaar", "municipal", "property tax",
        ),
        "Entertainment" to listOf(
            "netflix", "prime video", "hotstar", "disney", "spotify", "youtube premium",
            "gaana", "wynk", "sonyliv", "zee5", "voot", "bookmyshow", "pvr", "inox",
            "playstation", "steam", "xbox",
        ),
        "Rent" to listOf("rent", "landlord", "nobroker", "housing", "society maintenance", "maintenance charge"),
        "Investment" to listOf(
            "sip", "mutual fund", "groww", "zerodha", "upstox", "coin", "kuvera",
            "etmoney", "smallcase", "nps", "ppf", "elss", "nippon", "hdfc amc",
            "icici pru", "sbi mf", "axis mf", "mirae", "parag parikh", "quant mf",
            "recurring deposit", "fixed deposit",
        ),
        "Health" to listOf("hospital", "clinic", "diagnostic", "lab", "practo", "cult.fit", "cultfit", "gym", "fitness", "medical"),
        "Education" to listOf("udemy", "coursera", "byju", "unacademy", "vedantu", "school fee", "college", "tuition", "exam fee"),
        "Salary" to listOf("salary", "payroll", "stipend", "wages"),
        "Transfer" to listOf("upi", "imps", "neft", "rtgs", "transfer", "sent to", "received from"),
    )
    private val INCOME_HINTS = listOf(
        "salary", "payroll", "stipend", "client", "invoice", "payout", "settlement",
        "freelance", "commission", "refund", "cashback", "interest", "dividend",
    )

    // Word-boundary matchers: plain `contains` makes "lab" match "available".
    private val categoryMatchers: List<Pair<String, List<Pattern>>> =
        CATEGORY_RULES.map { (label, words) -> label to words.map { wordBoundary(it) } }
    private val incomeMatchers: List<Pair<String, Pattern>> =
        INCOME_HINTS.map { it to wordBoundary(it) }

    private fun wordBoundary(word: String): Pattern =
        Pattern.compile("\\b" + Pattern.quote(word.trim()) + "\\b", Pattern.CASE_INSENSITIVE)

    private val DATE_DMY = Pattern.compile("\\b(\\d{2})[-/](\\d{2})[-/](\\d{4})\\b")
    private val DATE_DMY2 = Pattern.compile("\\b(\\d{2})[-/](\\d{2})[-/](\\d{2})\\b")
    private val DATE_MON = Pattern.compile("\\b(\\d{1,2})[-\\s]([A-Za-z]{3})[-\\s](\\d{2,4})\\b")
    private val MONTHS = mapOf(
        "jan" to 0, "feb" to 1, "mar" to 2, "apr" to 3, "may" to 4, "jun" to 5,
        "jul" to 6, "aug" to 7, "sep" to 8, "oct" to 9, "nov" to 10, "dec" to 11,
    )

    // -----------------------------------------------------------------------

    fun isProbablePromo(text: String): Boolean {
        val low = text.lowercase(Locale.ROOT)
        if (TXN_ANCHORS.none { low.contains(it) }) return true
        return REJECT_PHRASES.any { low.contains(it) }
    }

    fun parse(body: String, sender: String, receivedAt: Long): ParsedSms? {
        val text = body.trim()
        if (text.length < 10) return null
        if (isProbablePromo(text)) return null

        val (amount, hadSymbol) = findAmount(text) ?: return null
        if (amount <= 0 || amount > 10_000_000) return null

        val low = text.lowercase(Locale.ROOT)
        val (direction, directionConfidence) = findDirection(low) ?: return null

        val merchant = findMerchant(text)
        val accountMatcher = ACCOUNT.matcher(text)
        val hasAccount = accountMatcher.find()
        val referenceMatcher = REFERENCE.matcher(text)
        val hasReference = referenceMatcher.find()
        val balanceMatcher = BALANCE.matcher(text)
        val hasBalance = balanceMatcher.find()

        // --- additive confidence, mirroring the backend ---------------------
        var confidence = 0.30
        if (hadSymbol) confidence += 0.20
        confidence += directionConfidence * 0.20
        if (hasAccount) confidence += 0.10
        if (hasReference) confidence += 0.10
        if (hasBalance) confidence += 0.05
        if (merchant != null) confidence += 0.08

        val senderLow = sender.lowercase(Locale.ROOT)
        if (KNOWN_SENDERS.any { senderLow.contains(it) }) confidence += 0.12
        else if (DLT_SENDER.matcher(sender.uppercase(Locale.ROOT)).matches()) confidence += 0.06
        confidence = minOf(confidence, 0.97)

        val channel = findChannel(low)
        val resolvedMerchant = merchant ?: if (channel == "NETBANKING") "Bank Transfer" else "Unknown"

        return ParsedSms(
            amount = amount,
            direction = direction,
            merchant = resolvedMerchant,
            category = categorize(resolvedMerchant, text, direction),
            channel = channel,
            accountHint = if (hasAccount) "${senderBank(sender)} XX${accountMatcher.group(1)}" else senderBank(sender),
            reference = if (hasReference) referenceMatcher.group(1) else null,
            balanceAfter = if (hasBalance) cleanAmount(balanceMatcher.group(1)) else null,
            occurredAt = findDate(text, receivedAt),
            confidence = confidence,
            sender = sender,
            raw = text,
        )
    }

    private fun cleanAmount(raw: String): Double = raw.replace(",", "").toDouble()

    private fun findAmount(text: String): Pair<Double, Boolean>? {
        val matcher = AMOUNT.matcher(text)
        if (matcher.find()) {
            val raw = matcher.group(1) ?: matcher.group(2)
            if (raw != null) runCatching { return cleanAmount(raw) to true }
        }
        val fallback = AMOUNT_FALLBACK.matcher(text)
        if (fallback.find()) {
            fallback.group(1)?.let { runCatching { return cleanAmount(it) to false } }
        }
        return null
    }

    private fun findDirection(low: String): Pair<String, Double>? {
        val debit = DEBIT_WORDS.firstOrNull { low.contains(it) }
        val credit = CREDIT_WORDS.firstOrNull { low.contains(it) }
        return when {
            debit != null && credit != null ->
                if (low.indexOf(debit) < low.indexOf(credit)) "DEBIT" to 0.6 else "CREDIT" to 0.6
            debit != null -> "DEBIT" to 0.85
            credit != null -> "CREDIT" to 0.85
            else -> null
        }
    }

    private fun findMerchant(text: String): String? {
        for (pattern in MERCHANT_PATTERNS) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                var name = matcher.group(1)?.trim { it == ' ' || it == '.' || it == ',' || it == '-' } ?: continue
                name = name.replace(Regex("\\s{2,}"), " ")
                name = MERCHANT_TAIL.matcher(name).replaceAll("").trim { it == ' ' || it == '.' || it == ',' || it == '-' }
                // Keep looking if this capture is boilerplate, not a payee.
                if (looksLikeBoilerplate(name)) continue
                if (name.length in 3..40 && !name.all { it.isDigit() }) return name
            }
        }
        return null
    }

    private fun findChannel(low: String): String = when {
        low.contains("upi") || low.contains("vpa") || low.contains("@") -> "UPI"
        low.contains("atm") || low.contains("withdrawn") -> "ATM"
        low.contains("card") || low.contains("pos") -> "CARD"
        low.contains("neft") || low.contains("imps") || low.contains("rtgs") || low.contains("netbanking") -> "NETBANKING"
        else -> "BANK"
    }

    fun categorize(merchant: String?, text: String, direction: String): String {
        val haystack = "${merchant ?: ""} $text"
        if (direction == "CREDIT") {
            for ((hint, matcher) in incomeMatchers) {
                if (matcher.matcher(haystack).find()) {
                    return if (hint in listOf("salary", "payroll", "stipend")) "Salary" else "Income"
                }
            }
        }
        for ((label, matchers) in categoryMatchers) {
            for (matcher in matchers) {
                if (matcher.matcher(haystack).find()) {
                    if (label == "Transfer" && direction == "CREDIT") return "Income"
                    return label
                }
            }
        }
        if (direction == "CREDIT") return "Income"
        return "Other"
    }

    private fun senderBank(sender: String): String {
        val low = sender.lowercase(Locale.ROOT)
        KNOWN_SENDERS.firstOrNull { low.contains(it) }?.let { return it.uppercase(Locale.ROOT) }
        return if (sender.isNotEmpty()) sender.uppercase(Locale.ROOT) else "UNKNOWN"
    }

    private fun findDate(text: String, fallback: Long): Long {
        fun build(year: Int, month: Int, day: Int): Long {
            val cal = Calendar.getInstance()
            cal.set(year, month, day, 12, 0, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.timeInMillis
        }

        DATE_DMY.matcher(text).let {
            if (it.find()) runCatching {
                return build(it.group(3)!!.toInt(), it.group(2)!!.toInt() - 1, it.group(1)!!.toInt())
            }
        }
        DATE_DMY2.matcher(text).let {
            if (it.find()) runCatching {
                return build(2000 + it.group(3)!!.toInt(), it.group(2)!!.toInt() - 1, it.group(1)!!.toInt())
            }
        }
        DATE_MON.matcher(text).let {
            if (it.find()) runCatching {
                val month = MONTHS[it.group(2)!!.lowercase(Locale.ROOT)] ?: return@runCatching
                var year = it.group(3)!!.toInt()
                if (year < 100) year += 2000
                return build(year, month, it.group(1)!!.toInt())
            }
        }
        return fallback
    }
}
