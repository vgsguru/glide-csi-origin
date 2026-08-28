package app.glide.data

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.pow

/**
 * Turns a month of raw inbox into the segregated financial picture the
 * dashboard renders.
 *
 * This is the on-device mirror of the backend's financial_engine + classifier,
 * so the phone shows the same shape of answer with no network at all.
 */
object SmsAnalyzer {

    private val ESSENTIAL = setOf("Rent", "Bills", "Health", "Education")
    private val DISCRETIONARY = setOf("Food", "Shopping", "Entertainment", "Transport", "Other")

    // Obligation discovery thresholds -- same values as the Python classifier.
    private const val MIN_OCCURRENCES = 2
    private const val AMOUNT_TOLERANCE = 0.15
    private const val MIN_CONSISTENT_RATIO = 0.6

    // Credits below this are cashback, refunds and UPI dust. They still count
    // toward money-in, but including them in the income *distribution* drags
    // the median toward zero and makes the band meaningless.
    private const val INCOME_NOISE_FLOOR = 100.0

    /**
     * How far back recurring detection looks, regardless of the display window.
     * Five months gives a monthly charge four or five chances to repeat, which
     * is enough for confidence to climb meaningfully.
     */
    const val OBLIGATION_LOOKBACK_DAYS = 150

    /**
     * Recurring charges below this are card-verification pokes and wallet dust
     * (Rs.1-2 from Google, LinkedIn and the like). They repeat perfectly, so the
     * pattern detector loves them -- but calling them "obligations" is noise.
     */
    private const val MIN_OBLIGATION_AMOUNT = 50.0

    /**
     * @param messages the full read, which covers [OBLIGATION_LOOKBACK_DAYS]
     * @param windowDays the period the totals and categories describe
     *
     * The two are deliberately different. A monthly subscription appears exactly
     * once inside 30 days, so discovery -- which needs repeats -- could never
     * fire at the default window. Totals stay scoped to what the user asked for;
     * recurring detection always looks back far enough to actually see a pattern.
     */
    fun analyze(
        messages: List<RawSms>,
        windowDays: Int = 30,
        lookbackDays: Int = OBLIGATION_LOOKBACK_DAYS,
        manualEntries: List<ParsedSms> = emptyList(),
    ): SmsAnalysis {
        val parsedAll = ArrayList<ParsedSms>()
        var rejectedAll = 0

        for (message in messages) {
            val result = SmsParser.parse(message.body, message.sender, message.receivedAt)
            if (result == null) rejectedAll++ else parsedAll.add(result)
        }

        // Scanned bills and cash entries are real spending the inbox cannot see,
        // so they join the ledger on equal footing with parsed messages.
        parsedAll.addAll(manualEntries)

        // Everything below the obligation section describes the display window.
        val windowStart = System.currentTimeMillis() - windowDays * 86_400_000L
        val parsed = ArrayList(parsedAll.filter { it.occurredAt >= windowStart })
        val rejected = if (windowDays >= lookbackDays) rejectedAll else {
            // Rejections are only meaningful for the window the user is seeing.
            messages.count {
                it.receivedAt >= windowStart &&
                    SmsParser.parse(it.body, it.sender, it.receivedAt) == null
            }
        }

        if (parsed.isEmpty()) {
            return SmsAnalysis.EMPTY.copy(
                windowDays = windowDays,
                messagesScanned = messages.count { it.receivedAt >= windowStart },
                rejected = rejected,
            )
        }

        val deduped = dedupe(parsed).sortedByDescending { it.occurredAt }

        val credits = deduped.filter { it.isCredit }
        val debits = deduped.filter { !it.isCredit }
        val totalIn = credits.sumOf { it.amount }
        val totalOut = debits.sumOf { it.amount }

        // --- category segregation -----------------------------------------
        val byCategory = debits.groupBy { it.category }
        val categories = byCategory.map { (name, rows) ->
            val amount = rows.sumOf { it.amount }
            CategoryTotal(
                category = name,
                amount = amount,
                count = rows.size,
                share = if (totalOut > 0) amount / totalOut else 0.0,
                essential = name in ESSENTIAL,
            )
        }.sortedByDescending { it.amount }

        val discretionary = categories.filter { it.category in DISCRETIONARY }.sumOf { it.amount }

        // --- merchants -----------------------------------------------------
        val topMerchants = debits.groupBy { normalizeMerchant(it.merchant) }
            .map { (_, rows) ->
                MerchantTotal(
                    merchant = rows.groupingBy { it.merchant }.eachCount()
                        .maxByOrNull { it.value }?.key ?: "Unknown",
                    amount = rows.sumOf { it.amount },
                    count = rows.size,
                )
            }
            .sortedByDescending { it.amount }
            .take(8)

        return SmsAnalysis(
            windowDays = windowDays,
            messagesScanned = messages.count { it.receivedAt >= windowStart },
            parsed = deduped.size,
            rejected = rejected,
            transactions = deduped,
            totalIn = totalIn,
            totalOut = totalOut,
            net = totalIn - totalOut,
            categories = categories,
            topMerchants = topMerchants,
            obligations = discoverObligations(dedupe(parsedAll).filter { !it.isCredit }),
            income = incomeBand(credits, windowDays),
            daily = dailySeries(deduped, windowDays),
            discretionary = discretionary,
            essential = totalOut - discretionary,
            dailyRunRate = totalOut / windowDays.coerceAtLeast(1),
            averageConfidence = deduped.sumOf { it.confidence } / deduped.size,
            lowConfidenceCount = deduped.count { it.confidence < 0.85 },
        )
    }

    /**
     * Banks often send two alerts for one payment (the debit and the UPI
     * confirmation). Same amount + direction + merchant within 24h is one event.
     */
    private fun dedupe(rows: List<ParsedSms>): List<ParsedSms> {
        val kept = ArrayList<ParsedSms>()
        for (row in rows.sortedBy { it.occurredAt }) {
            val duplicate = kept.any { existing ->
                existing.direction == row.direction &&
                    abs(existing.amount - row.amount) / maxOf(existing.amount, row.amount) < 0.001 &&
                    abs(existing.occurredAt - row.occurredAt) < 86_400_000L &&
                    merchantsOverlap(existing.merchant, row.merchant)
            }
            if (!duplicate) kept.add(row)
        }
        return kept
    }

    private fun merchantsOverlap(left: String, right: String): Boolean {
        val a = normalizeMerchant(left)
        val b = normalizeMerchant(right)
        if (a.isEmpty() || b.isEmpty()) return false
        if (a == b || a.contains(b) || b.contains(a)) return true
        val at = a.split(" ").filter { it.length > 2 }.toSet()
        val bt = b.split(" ").filter { it.length > 2 }.toSet()
        return at.intersect(bt).isNotEmpty()
    }

    fun normalizeMerchant(name: String): String =
        name.lowercase(Locale.ROOT)
            .replace(Regex("\\b(pvt|private|ltd|limited|india|inc|llp|co)\\b"), "")
            .replace(Regex("@[a-z]+$"), "")
            .replace(Regex("[0-9]{3,}"), "")
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    // --- recurring discovery ------------------------------------------------

    private fun discoverObligations(debits: List<ParsedSms>): List<DiscoveredObligation> {
        val groups = debits.groupBy { normalizeMerchant(it.merchant) }
        val found = ArrayList<DiscoveredObligation>()

        for ((key, rows) in groups) {
            if (key.isEmpty() || key == "unknown" || rows.size < MIN_OCCURRENCES) continue

            val amounts = rows.map { it.amount }.sorted()
            val median = amounts[amounts.size / 2]
            val consistent = rows.filter {
                abs(it.amount - median) / maxOf(median, 1.0) <= AMOUNT_TOLERANCE
            }
            if (consistent.size < MIN_OCCURRENCES) continue
            if (consistent.size.toDouble() / rows.size < MIN_CONSISTENT_RATIO) continue
            if (median < MIN_OBLIGATION_AMOUNT) continue

            val dates = consistent.map { it.occurredAt }.sorted()
            val gaps = dates.zipWithNext { a, b -> ((b - a) / 86_400_000L).toInt() }.filter { it > 0 }
            if (gaps.isEmpty()) continue

            var cadence = gaps.sorted()[gaps.size / 2]
            listOf(7, 14, 30, 31, 90, 365).firstOrNull { abs(cadence - it) <= 6 }?.let {
                cadence = if (it == 31) 30 else it
            }
            if (cadence < 5) continue

            val occurrences = consistent.size
            // Confidence rises with each confirming repeat.
            val confidence = min(0.97, 1 - 0.55.pow(occurrences - 1))

            val lastSeen = dates.last()
            var nextDue = lastSeen + cadence * 86_400_000L
            val now = System.currentTimeMillis()
            while (nextDue < now - cadence * 86_400_000L) nextDue += cadence * 86_400_000L

            found.add(
                DiscoveredObligation(
                    name = consistent.groupingBy { it.merchant }.eachCount()
                        .maxByOrNull { it.value }?.key ?: "Recurring payment",
                    category = consistent.groupingBy { it.category }.eachCount()
                        .maxByOrNull { it.value }?.key ?: "Other",
                    expectedAmount = median,
                    cadenceDays = cadence,
                    occurrences = occurrences,
                    confidence = confidence,
                    lastSeen = lastSeen,
                    nextDue = nextDue,
                )
            )
        }
        return found.sortedBy { it.nextDue }
    }

    // --- income band --------------------------------------------------------

    private fun incomeBand(credits: List<ParsedSms>, windowDays: Int): IncomeBand {
        if (credits.isEmpty()) {
            return IncomeBand(0.0, 0.0, 0.0, "No income observed in this window", "unknown", 0)
        }

        // Scale the observed TOTAL to 30 days rather than multiplying a median
        // deposit by the deposit count. Real inboxes carry a long tail of tiny
        // credits (Rs.1-2 cashback, refunds); with those in the sample the
        // median collapses and median x count produced absurd results -- a real
        // phone showed "Rs.93/month" against Rs.41,821 actually received.
        val spanDays = ((credits.maxOf { it.occurredAt } - credits.minOf { it.occurredAt }) / 86_400_000L)
            .toInt().coerceAtLeast(1)
        val observedTotal = credits.sumOf { it.amount }
        val p50 = observedTotal * (30.0 / spanDays.coerceAtLeast(1))

        // Band width takes the larger of two uncertainties: how lumpy the
        // deposits are, and how little evidence there is. Two similar deposits
        // are not proof of a steady income -- they are two data points.
        val meaningful = credits.map { it.amount }.filter { it >= INCOME_NOISE_FLOOR }
            .ifEmpty { credits.map { it.amount } }
        val count = meaningful.size
        val smallSampleFloor = when {
            count <= 2 -> 0.45
            count <= 4 -> 0.35
            count <= 8 -> 0.28
            else -> 0.20
        }
        val spread = if (count > 1) {
            val mean = meaningful.average()
            val variance = meaningful.sumOf { (it - mean) * (it - mean) } / count
            val dispersion = kotlin.math.sqrt(variance) / maxOf(mean, 1.0)
            minOf(0.60, maxOf(smallSampleFloor, dispersion * 0.5))
        } else 0.50

        val ignored = credits.size - count
        val stability = when {
            spread < 0.25 -> "steady"
            spread < 0.45 -> "variable"
            else -> "highly variable"
        }

        return IncomeBand(
            p10 = p50 * (1 - spread),
            p50 = p50,
            p90 = p50 * (1 + spread),
            basis = "$count deposit${if (count == 1) "" else "s"} over $windowDays days" +
                if (ignored > 0) ", $ignored tiny credits ignored" else "",
            stability = stability,
            depositCount = count,
        )
    }

    private fun percentile(sorted: List<Double>, pct: Double): Double {
        if (sorted.isEmpty()) return 0.0
        if (sorted.size == 1) return sorted[0]
        val position = (sorted.size - 1) * pct
        val lower = position.toInt()
        val upper = min(lower + 1, sorted.size - 1)
        val weight = position - lower
        return sorted[lower] * (1 - weight) + sorted[upper] * weight
    }

    // --- daily series -------------------------------------------------------

    private fun dailySeries(rows: List<ParsedSms>, windowDays: Int): List<DaySpend> {
        val format = SimpleDateFormat("d MMM", Locale.getDefault())
        val buckets = LinkedHashMap<String, DaySpend>()

        val calendar = Calendar.getInstance()
        calendar.timeInMillis = System.currentTimeMillis() - (windowDays - 1) * 86_400_000L
        repeat(windowDays) {
            val label = format.format(calendar.time)
            buckets[label] = DaySpend(label, 0.0, 0.0)
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }

        for (row in rows) {
            val label = format.format(java.util.Date(row.occurredAt))
            val bucket = buckets[label] ?: continue
            buckets[label] = if (row.isCredit) {
                bucket.copy(inflow = bucket.inflow + row.amount)
            } else {
                bucket.copy(outflow = bucket.outflow + row.amount)
            }
        }
        return buckets.values.toList()
    }
}
