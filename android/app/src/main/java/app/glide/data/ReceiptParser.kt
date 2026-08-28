package app.glide.data

import java.util.Calendar
import java.util.Locale
import java.util.regex.Pattern

/**
 * Turns raw OCR text from a bill photo into a transaction draft.
 *
 * Receipts are far messier than SMS: no fixed grammar, arbitrary line order,
 * and OCR noise on top. So this is deliberately cautious -- it prefers an
 * explicitly labelled total over the largest number on the page, reports a
 * confidence, and the UI never commits a draft without the user confirming it.
 */
object ReceiptParser {

    data class Draft(
        val amount: Double,
        val merchant: String,
        val category: String,
        val occurredAt: Long,
        val confidence: Double,
        val rawText: String,
        val amountLabel: String?,
    )

    /** Labels that mark the figure we actually want, best first. */
    private val TOTAL_LABELS = listOf(
        "grand total", "net payable", "net amount", "amount payable", "total payable",
        "bill amount", "invoice total", "total amount", "you pay", "paid",
        "total", "amount", "balance due",
    )

    // A money-looking figure, with or without a currency marker.
    private val MONEY = Pattern.compile(
        "(?:rs\\.?|inr|₹)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE,
    )

    private val DATE_PATTERNS = listOf(
        Pattern.compile("\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})\\b"),
        Pattern.compile("\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2})\\b"),
        Pattern.compile("\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b"),
    )

    // Lines that are never a merchant name.
    private val NOT_MERCHANT = Regex(
        "^(gst|cgst|sgst|igst|tax|invoice|bill|receipt|date|time|total|amount|" +
            "subtotal|qty|item|cash|change|thank|welcome|visit|tel|ph|phone|" +
            "no\\.?|order|table|token|cashier|counter|www\\.|http|[0-9₹rs.,\\s-]+)",
        RegexOption.IGNORE_CASE,
    )

    fun parse(text: String, capturedAt: Long = System.currentTimeMillis()): Draft? {
        if (text.isBlank()) return null
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.isEmpty()) return null

        val (amount, label) = findAmount(lines) ?: return null
        if (amount <= 0 || amount > 10_000_000) return null

        val merchant = findMerchant(lines)
        val occurredAt = findDate(text) ?: capturedAt

        // Additive confidence, same discipline as the SMS parser.
        var confidence = 0.35
        if (label != null) confidence += 0.30              // an explicit "Total:" line
        if (merchant != null) confidence += 0.15
        if (findDate(text) != null) confidence += 0.10
        if (text.length > 120) confidence += 0.05          // a real receipt, not a scrap
        confidence = minOf(confidence, 0.92)

        val resolvedMerchant = merchant ?: "Bill"
        return Draft(
            amount = amount,
            merchant = resolvedMerchant,
            category = SmsParser.categorize(resolvedMerchant, text, "DEBIT"),
            occurredAt = occurredAt,
            confidence = confidence,
            rawText = text.take(2000),
            amountLabel = label,
        )
    }

    /**
     * Prefer a figure on a line that names itself as the total. Falling back to
     * "largest number on the page" is a last resort -- on a receipt that is
     * often a phone number or an item code.
     */
    private fun findAmount(lines: List<String>): Pair<Double, String?>? {
        for (label in TOTAL_LABELS) {
            for (line in lines) {
                val low = line.lowercase(Locale.ROOT)
                if (!low.contains(label)) continue
                // Take the last figure on the line: "Total 3 items 450.00".
                val figures = moneyOn(line)
                if (figures.isNotEmpty()) return figures.last() to label
            }
            // Some layouts put the label and the figure on adjacent lines.
            for ((index, line) in lines.withIndex()) {
                if (!line.lowercase(Locale.ROOT).contains(label)) continue
                val next = lines.getOrNull(index + 1) ?: continue
                val figures = moneyOn(next)
                if (figures.isNotEmpty() && next.length < 24) return figures.last() to label
            }
        }

        val all = lines.flatMap { moneyOn(it) }.filter { it >= 1.0 }
        return all.maxOrNull()?.let { it to null }
    }

    private fun moneyOn(line: String): List<Double> {
        // Skip lines that are clearly identifiers rather than money.
        val low = line.lowercase(Locale.ROOT)
        if (low.contains("gstin") || low.contains("invoice no") || low.contains("phone")) {
            return emptyList()
        }
        val out = ArrayList<Double>()
        val matcher = MONEY.matcher(line)
        while (matcher.find()) {
            val raw = matcher.group(1) ?: continue
            // A bare 4+ digit integer with no decimals is usually a code.
            val hasMarker = matcher.group().trimStart().firstOrNull()?.isDigit() == false
            val looksLikeCode = !raw.contains('.') && !raw.contains(',') &&
                raw.length >= 4 && !hasMarker
            if (looksLikeCode) continue
            raw.replace(",", "").toDoubleOrNull()?.let(out::add)
        }
        return out
    }

    private fun findMerchant(lines: List<String>): String? {
        // Receipt headers carry the shop name, so search from the top.
        for (line in lines.take(6)) {
            val cleaned = line.replace(Regex("[^A-Za-z0-9&'. -]"), "").trim()
            if (cleaned.length !in 3..40) continue
            if (NOT_MERCHANT.containsMatchIn(cleaned)) continue
            if (cleaned.count { it.isDigit() } > cleaned.length / 3) continue
            if (cleaned.none { it.isLetter() }) continue
            return cleaned
        }
        return null
    }

    private fun findDate(text: String): Long? {
        for (pattern in DATE_PATTERNS) {
            val m = pattern.matcher(text)
            if (!m.find()) continue
            runCatching {
                val a = m.group(1)!!.toInt()
                val b = m.group(2)!!.toInt()
                val c = m.group(3)!!.toInt()
                val (year, month, day) = when {
                    a > 1000 -> Triple(a, b, c)                       // yyyy-mm-dd
                    c > 1000 -> Triple(c, b, a)                       // dd-mm-yyyy
                    else -> Triple(2000 + c, b, a)                    // dd-mm-yy
                }
                if (month !in 1..12 || day !in 1..31) return@runCatching
                val cal = Calendar.getInstance()
                cal.set(year, month - 1, day, 12, 0, 0)
                cal.set(Calendar.MILLISECOND, 0)
                // Reject dates far in the future -- almost always a misread.
                if (cal.timeInMillis > System.currentTimeMillis() + 86_400_000L) return@runCatching
                return cal.timeInMillis
            }
        }
        return null
    }
}
