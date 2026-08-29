package app.glide.data

/** One SMS successfully parsed into a transaction candidate. */
data class ParsedSms(
    val amount: Double,
    val direction: String,          // CREDIT | DEBIT
    val merchant: String,
    val category: String,
    val channel: String,
    val accountHint: String,
    val reference: String?,
    val balanceAfter: Double?,
    val occurredAt: Long,
    val confidence: Double,
    val sender: String,
    val raw: String,
) {
    val isCredit get() = direction == "CREDIT"
}

/** A raw inbox row, before parsing. */
data class RawSms(
    val body: String,
    val sender: String,
    val receivedAt: Long,
)

data class CategoryTotal(
    val category: String,
    val amount: Double,
    val count: Int,
    val share: Double,
    val essential: Boolean,
)

data class MerchantTotal(
    val merchant: String,
    val amount: Double,
    val count: Int,
)

data class DiscoveredObligation(
    val name: String,
    val category: String,
    val expectedAmount: Double,
    val cadenceDays: Int,
    val occurrences: Int,
    val confidence: Double,
    val lastSeen: Long,
    val nextDue: Long,
) {
    val daysUntil: Int
        get() = ((nextDue - System.currentTimeMillis()) / 86_400_000L).toInt()
}

data class DaySpend(
    val dayLabel: String,
    val inflow: Double,
    val outflow: Double,
)

/**
 * Cash drawn from an ATM, and how much of it has been accounted for.
 *
 * Money leaves the *bank* at withdrawal and leaves the *wallet* at purchase.
 * Counting both as spending double-books it, so a withdrawal is treated as a
 * transfer into this pool, and logged cash purchases draw the pool down and
 * give it a category. Whatever is still unallocated after [agingDays] stops
 * being "cash in hand" and is reported as spending we simply cannot categorise.
 */
data class CashPosition(
    val withdrawn: Double = 0.0,
    val allocated: Double = 0.0,
    val unallocated: Double = 0.0,
    val aged: Double = 0.0,
    val withdrawalCount: Int = 0,
    val purchaseCount: Int = 0,
    val oldestUnreconciledAt: Long? = null,
    val agingDays: Int = 14,
) {
    val hasCash: Boolean get() = withdrawn > 0
    val reconciledShare: Double
        get() = if (withdrawn > 0) (allocated / withdrawn).coerceIn(0.0, 1.0) else 0.0
    val daysSinceOldest: Int?
        get() = oldestUnreconciledAt?.let {
            ((System.currentTimeMillis() - it) / 86_400_000L).toInt()
        }
}

data class IncomeBand(
    val p10: Double,
    val p50: Double,
    val p90: Double,
    val basis: String,
    val stability: String,
    val depositCount: Int,
)

/**
 * The result of analysing one month of inbox: the whole Android dashboard is
 * rendered from this single value.
 */
data class SmsAnalysis(
    val windowDays: Int,
    val messagesScanned: Int,
    val parsed: Int,
    val rejected: Int,
    val transactions: List<ParsedSms>,
    val totalIn: Double,
    val totalOut: Double,
    val net: Double,
    val categories: List<CategoryTotal>,
    val topMerchants: List<MerchantTotal>,
    val obligations: List<DiscoveredObligation>,
    val income: IncomeBand,
    val daily: List<DaySpend>,
    val discretionary: Double,
    val essential: Double,
    val dailyRunRate: Double,
    val averageConfidence: Double,
    val lowConfidenceCount: Int,
    val cash: CashPosition = CashPosition(),
) {
    companion object {
        val EMPTY = SmsAnalysis(
            windowDays = 30, messagesScanned = 0, parsed = 0, rejected = 0,
            transactions = emptyList(), totalIn = 0.0, totalOut = 0.0, net = 0.0,
            categories = emptyList(), topMerchants = emptyList(), obligations = emptyList(),
            income = IncomeBand(0.0, 0.0, 0.0, "No income observed yet", "unknown", 0),
            daily = emptyList(), discretionary = 0.0, essential = 0.0,
            dailyRunRate = 0.0, averageConfidence = 0.0, lowConfidenceCount = 0,
        )
    }
}

data class ChatTurn(
    val role: String,               // user | assistant
    val content: String,
    val grounding: List<Pair<String, String>> = emptyList(),
    val snapshotRef: String? = null,
    val engine: String? = null,
    val pending: Boolean = false,
    val failed: Boolean = false,
)
