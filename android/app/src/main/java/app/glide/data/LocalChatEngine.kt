package app.glide.data

import java.util.Locale
import java.util.regex.Pattern
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The on-device half of grounded chat -- a Kotlin port of
 * backend/app/services/chat_service.py.
 *
 * Three jobs, all of which must work with no network at all:
 *  1. Build the numeric context block from the phone's own SMS analysis.
 *  2. Answer the questions that actually matter, deterministically.
 *  3. Refuse any model output containing a figure that isn't in the context.
 *
 * The rule path is the default, not the fallback. The cloud model only ever
 * gets to *rephrase* an answer this engine already produced.
 */
object LocalChatEngine {

    private val AFFORD = Pattern.compile(
        "(?:afford|spend|buy|blow|drop|purchase)\\D{0,30}?(?:rs\\.?|inr|₹)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)" +
            "|(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\D{0,25}?(?:afford|spend|worth)",
        Pattern.CASE_INSENSITIVE,
    )

    private val NUMBER = Pattern.compile("\\d[\\d,]*(?:\\.\\d+)?")

    data class Answer(
        val text: String,
        val grounding: List<Pair<String, String>>,
        val matchedRule: Boolean,
    )

    private fun money(value: Double) = formatRs(value)

    private fun formatRs(value: Double): String {
        val whole = value.roundToInt()
        val text = String.format(Locale("en", "IN"), "%,d", whole)
        return "Rs.$text"
    }

    fun safeToSpend(analysis: SmsAnalysis, bufferFloor: Double): Double =
        max(analysis.net - bufferFloor, 0.0)

    /**
     * The only facts the model is allowed to use.
     *
     * Note the deliberate wording on "net over the window": the phone sees
     * message flow, not a bank-confirmed balance, and the copy says so rather
     * than implying account access.
     */
    fun buildContext(analysis: SmsAnalysis, bufferFloor: Double): String {
        val sts = safeToSpend(analysis, bufferFloor)
        val lines = mutableListOf(
            "Currency: INR (write amounts as Rs.X)",
            "Window: last ${analysis.windowDays} days of SMS on this phone",
            "Money in: ${money(analysis.totalIn)}",
            "Money out: ${money(analysis.totalOut)}",
            "Net over the window: ${money(analysis.net)} " +
                "(derived from bank alerts, not a bank-confirmed balance)",
            "Buffer floor (user-set): ${money(bufferFloor)}",
            "Safe to spend (net minus floor): ${money(sts)}",
            "Daily run-rate: ${money(analysis.dailyRunRate)} per day",
            "Discretionary spend: ${money(analysis.discretionary)}",
            "Essential spend: ${money(analysis.essential)}",
            "Monthly income band: p10 ${money(analysis.income.p10)} / " +
                "p50 ${money(analysis.income.p50)} / p90 ${money(analysis.income.p90)}",
            "Income basis: ${analysis.income.basis} (${analysis.income.stability})",
            "Messages scanned: ${analysis.messagesScanned}, parsed as transactions: ${analysis.parsed}, " +
                "rejected as promo/OTP/failed: ${analysis.rejected}",
        )

        if (analysis.categories.isNotEmpty()) {
            lines.add("Spending by category:")
            analysis.categories.take(6).forEach {
                lines.add(
                    "  - ${it.category}: ${money(it.amount)} " +
                        "(${(it.share * 100).roundToInt()}%, ${it.count} transactions)"
                )
            }
        }

        if (analysis.obligations.isNotEmpty()) {
            lines.add("Recurring payments discovered from repeats (not configured):")
            analysis.obligations.take(6).forEach {
                lines.add(
                    "  - ${it.name}: ${money(it.expectedAmount)} due in ${it.daysUntil} days " +
                        "(${(it.confidence * 100).roundToInt()}% confidence, seen ${it.occurrences} times)"
                )
            }
        } else {
            lines.add("Recurring payments: none discovered yet")
        }

        return lines.joinToString("\n")
    }

    // -----------------------------------------------------------------------
    // Deterministic answers
    // -----------------------------------------------------------------------

    private val GREETINGS = listOf(
        "hi", "hii", "hey", "hello", "yo", "hai", "namaste", "good morning",
        "good afternoon", "good evening", "how are you", "how r u", "whats up",
        "what's up", "sup", "how you doing", "how do you do",
    )
    private val PLEASANTRIES = listOf(
        "thanks", "thank you", "thx", "ty", "cheers", "nice", "cool", "great",
        "ok", "okay", "bye", "goodbye", "good night", "see you",
    )

    /**
     * Small talk deserves small talk.
     *
     * Someone saying "hi" is not asking for a balance report, and answering one
     * with the other is the fastest way to make an assistant feel robotic. These
     * replies carry no grounding panel, because there are no figures in them.
     */
    fun smallTalk(question: String): Answer? {
        val low = question.lowercase(Locale.ROOT).trim().trim('!', '.', '?', ',')
        if (low.length > 40) return null

        val isGreeting = GREETINGS.any { low == it || low.startsWith("$it ") || low.endsWith(" $it") }
        val isPleasantry = PLEASANTRIES.any { low == it || low.startsWith("$it ") }

        val text = when {
            low.contains("how are you") || low.contains("how r u") || low.contains("how you doing") ->
                "Doing well, thanks! How can I help you today?"
            isGreeting ->
                "Hi! How can I help you today?"
            low.startsWith("thank") || low == "thx" || low == "ty" || low == "cheers" ->
                "Anytime."
            low.startsWith("bye") || low.startsWith("good night") || low.startsWith("see you") ->
                "Talk soon."
            isPleasantry -> "Glad that helps."
            low.contains("who are you") || low.contains("what are you") || low.contains("what can you do") ->
                "I am Glide. I read your bank messages on this phone and answer questions about " +
                    "your spending, income and what is safe to spend."
            else -> return null
        }
        return Answer(text, emptyList(), matchedRule = true)
    }

    fun ruleAnswer(question: String, analysis: SmsAnalysis, bufferFloor: Double): Answer? {
        smallTalk(question)?.let { return it }
        val low = question.lowercase(Locale.ROOT)
        val sts = safeToSpend(analysis, bufferFloor)
        val obligationTotal = analysis.obligations.sumOf { it.expectedAmount }

        // --- "can I afford Rs.X?" -----------------------------------------
        val matcher = AFFORD.matcher(question)
        if (matcher.find() &&
            listOf("afford", "spend", "buy", "purchase", "worth", "ok to").any { low.contains(it) }
        ) {
            val raw = matcher.group(1) ?: matcher.group(2)
            val amount = raw?.replace(",", "")?.toDoubleOrNull()
            if (amount != null && amount > 0) {
                val remaining = sts - amount
                val verdict = if (remaining >= 0) {
                    "Yes -- ${money(amount)} fits. Your safe-to-spend right now is ${money(sts)}, " +
                        "so you would have ${money(remaining)} left above your ${money(bufferFloor)} floor."
                } else {
                    "I would be cautious. Safe-to-spend is ${money(sts)}, so ${money(amount)} would dip " +
                        "${money(abs(remaining))} below your ${money(bufferFloor)} buffer floor."
                }
                val nearest = analysis.obligations.firstOrNull()
                val tail = if (nearest != null) {
                    " ${nearest.name} (${money(nearest.expectedAmount)}) is due in " +
                        "${nearest.daysUntil} days and is already accounted for."
                } else ""
                return Answer(
                    verdict + tail,
                    listOf(
                        "Safe to spend" to money(sts),
                        "Requested" to money(amount),
                        "Buffer floor" to money(bufferFloor),
                        "Obligations due" to money(obligationTotal),
                    ),
                    true,
                )
            }
        }

        // --- "why is my buffer low?" --------------------------------------
        if (listOf("buffer", "safe to spend", "safe-to-spend").any { low.contains(it) } &&
            listOf("why", "low", "down", "drop", "thin", "shrink").any { low.contains(it) }
        ) {
            val detail = analysis.obligations.take(3).joinToString("; ") {
                "${it.name} ${money(it.expectedAmount)} in ${it.daysUntil}d"
            }.ifEmpty { "no recurring payments discovered yet" }
            var text = "Safe-to-spend is ${money(sts)} because you are ${money(analysis.net)} net over the " +
                "last ${analysis.windowDays} days and your floor is ${money(bufferFloor)}. " +
                "The largest upcoming claims: $detail."
            if (analysis.discretionary > analysis.essential) {
                text += " Discretionary spending (${money(analysis.discretionary)}) is also outrunning " +
                    "essentials (${money(analysis.essential)})."
            }
            return Answer(
                text,
                listOf(
                    "Safe to spend" to money(sts),
                    "Net this period" to money(analysis.net),
                    "Buffer floor" to money(bufferFloor),
                    "Obligations due" to money(obligationTotal),
                ),
                true,
            )
        }

        // --- "how much do I earn?" ----------------------------------------
        if (listOf("income", "earn", "make", "salary").any { low.contains(it) } &&
            !listOf("spend", "spent").any { low.contains(it) }
        ) {
            return Answer(
                "I model your income as a range, not a single number: a low month is about " +
                    "${money(analysis.income.p10)}, typical is ${money(analysis.income.p50)}, and a good " +
                    "month reaches ${money(analysis.income.p90)}. Basis: ${analysis.income.basis}. " +
                    "I treat it as ${analysis.income.stability}, so plan against the low end.",
                listOf(
                    "Low month (p10)" to money(analysis.income.p10),
                    "Typical (p50)" to money(analysis.income.p50),
                    "Good month (p90)" to money(analysis.income.p90),
                    "Basis" to analysis.income.basis,
                ),
                true,
            )
        }

        // --- "what is due?" -----------------------------------------------
        if (listOf("due", "obligation", "bill", "upcoming", "rent", "subscription", "recurring")
                .any { low.contains(it) }
        ) {
            if (analysis.obligations.isEmpty()) {
                return Answer(
                    "I have not discovered any recurring payments yet. They appear automatically once a " +
                        "payment repeats in your inbox -- there is nothing to configure.",
                    listOf("Discovered obligations" to "0"),
                    true,
                )
            }
            val listed = analysis.obligations.take(5).joinToString("; ") {
                "${it.name} ${money(it.expectedAmount)} in ${it.daysUntil}d " +
                    "(${(it.confidence * 100).roundToInt()}% confidence)"
            }
            return Answer(
                "${money(obligationTotal)} is committed across your discovered recurring payments: " +
                    "$listed. Every one of these was learned from repeats, not entered by you.",
                listOf("Total committed" to money(obligationTotal)) +
                    analysis.obligations.take(4).map {
                        it.name to "${money(it.expectedAmount)} in ${it.daysUntil}d"
                    },
                true,
            )
        }

        // --- "where did my money go?" -------------------------------------
        if (listOf("where", "spend", "spent", "going", "breakdown", "category")
                .any { low.contains(it) } && analysis.categories.isNotEmpty()
        ) {
            val top = analysis.categories.take(4)
            val listed = top.joinToString(", ") {
                "${it.category} ${money(it.amount)} (${(it.share * 100).roundToInt()}%)"
            }
            return Answer(
                "Over the last ${analysis.windowDays} days you spent ${money(analysis.totalOut)} across " +
                    "${analysis.parsed} transactions: $listed. ${money(analysis.discretionary)} of that " +
                    "was discretionary -- that is the part you can actually move.",
                listOf("Total spend" to money(analysis.totalOut)) +
                    top.map { it.category to money(it.amount) },
                true,
            )
        }

        return null
    }

    /** Last resort when no rule matches and no model is reachable. */
    fun fallback(analysis: SmsAnalysis, bufferFloor: Double): Answer {
        val sts = safeToSpend(analysis, bufferFloor)
        return Answer(
            "I can answer from the ${analysis.parsed} transactions I read on this phone. Right now: " +
                "safe-to-spend ${money(sts)}, ${money(analysis.totalIn)} in and " +
                "${money(analysis.totalOut)} out over ${analysis.windowDays} days. Ask me whether you " +
                "can afford something, why your buffer moved, or where your money went.",
            listOf(
                "Safe to spend" to money(sts),
                "Money in" to money(analysis.totalIn),
                "Money out" to money(analysis.totalOut),
            ),
            false,
        )
    }

    // -----------------------------------------------------------------------
    // Numeral guard
    // -----------------------------------------------------------------------

    private fun numerals(text: String): Set<Double> {
        val found = HashSet<Double>()
        val matcher = NUMBER.matcher(text)
        while (matcher.find()) {
            val cleaned = matcher.group().replace(",", "").trimEnd('.')
            cleaned.toDoubleOrNull()?.let { found.add(Math.round(it * 100) / 100.0) }
        }
        return found
    }

    /**
     * True when every figure in [generated] also appears in [context].
     *
     * Small integers and percentages are treated as ordinary prose ("3 days",
     * "44%"), not as financial claims.
     */
    fun numeralsAreGrounded(generated: String, context: String): Boolean {
        val allowed = numerals(context)
        for (value in numerals(generated)) {
            if (value in allowed) continue
            if (value <= 100) continue
            return false
        }
        return true
    }

    /**
     * Glide talks like a person who happens to know your finances.
     *
     * The earlier version treated every message as a money question, so "hi, how
     * are you" came back as a balance report. That is not a copilot, it is a
     * vending machine. Small talk now gets small talk; the figures come out when
     * the question is actually about money.
     *
     * The one thing that never relaxes is the numbers: any figure must come from
     * the CONTEXT block, and the numeral guard enforces that independently.
     */
    const val SYSTEM_PROMPT: String =
        "You are Glide, a financial copilot for people with variable income in India. " +
            "You are warm, brief and natural -- a knowledgeable friend, not a report generator.\n\n" +
            "HOW TO TALK:\n" +
            "- Greetings and small talk ('hi', 'how are you', 'thanks', 'good morning') get a " +
            "short, friendly, human reply. Do NOT recite balances or transactions at someone who " +
            "just said hello. One line is plenty, and you may offer to help.\n" +
            "- Questions about money get a real answer built from the CONTEXT figures.\n" +
            "- If asked something you genuinely cannot know from the context, say so simply and " +
            "offer what you can answer instead.\n" +
            "- General questions that are not about this person's money can be answered briefly " +
            "and honestly, then gently brought back to what you are actually useful for.\n\n" +
            "ABOUT NUMBERS (these never relax):\n" +
            "1. Every figure you state must appear in the CONTEXT block. Never invent, estimate " +
            "or extrapolate one.\n" +
            "2. Write amounts as Rs.X (no currency symbol).\n" +
            "3. When you use figures, name them, so the person can check you.\n" +
            "4. You are not a licensed financial adviser. Describe this person's own numbers " +
            "rather than recommending specific financial products.\n\n" +
            "STYLE: plain English, no markdown, no bullet lists, no emoji. Two to four sentences " +
            "for a money question; one or two for anything else."
}
