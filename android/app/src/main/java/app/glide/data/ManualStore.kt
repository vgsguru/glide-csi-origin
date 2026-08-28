package app.glide.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Transactions the inbox cannot see: scanned bills and cash entries.
 *
 * SMS-derived rows are recomputed from the inbox on every scan, so they need no
 * storage. These do -- a photographed receipt exists nowhere else -- so they are
 * persisted and merged into the analysis alongside the parsed messages.
 */
class ManualStore(context: Context) {

    private val store = context.getSharedPreferences("glide_manual", Context.MODE_PRIVATE)

    fun all(): List<ParsedSms> {
        val raw = store.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).map { index ->
                val o = array.getJSONObject(index)
                ParsedSms(
                    amount = o.getDouble("amount"),
                    direction = o.optString("direction", "DEBIT"),
                    merchant = o.optString("merchant", "Bill"),
                    category = o.optString("category", "Other"),
                    channel = o.optString("channel", "CASH"),
                    accountHint = o.optString("source", "OCR"),
                    reference = o.optString("id").ifEmpty { null },
                    balanceAfter = null,
                    occurredAt = o.getLong("occurredAt"),
                    confidence = o.optDouble("confidence", 0.9),
                    sender = o.optString("source", "OCR"),
                    raw = o.optString("raw", ""),
                )
            }
        }.getOrDefault(emptyList())
    }

    fun add(entry: ParsedSms) {
        val array = JSONArray()
        (all() + entry).forEach { row ->
            array.put(
                JSONObject()
                    .put("id", row.reference ?: System.nanoTime().toString())
                    .put("amount", row.amount)
                    .put("direction", row.direction)
                    .put("merchant", row.merchant)
                    .put("category", row.category)
                    .put("channel", row.channel)
                    .put("source", row.sender)
                    .put("occurredAt", row.occurredAt)
                    .put("confidence", row.confidence)
                    .put("raw", row.raw.take(500))
            )
        }
        store.edit().putString(KEY, array.toString()).apply()
    }

    fun remove(occurredAt: Long, amount: Double) {
        val kept = all().filterNot { it.occurredAt == occurredAt && it.amount == amount }
        val array = JSONArray()
        kept.forEach { row ->
            array.put(
                JSONObject()
                    .put("id", row.reference ?: System.nanoTime().toString())
                    .put("amount", row.amount)
                    .put("direction", row.direction)
                    .put("merchant", row.merchant)
                    .put("category", row.category)
                    .put("channel", row.channel)
                    .put("source", row.sender)
                    .put("occurredAt", row.occurredAt)
                    .put("confidence", row.confidence)
                    .put("raw", row.raw.take(500))
            )
        }
        store.edit().putString(KEY, array.toString()).apply()
    }

    fun count(): Int = all().size

    private companion object {
        const val KEY = "manual_entries"
    }
}
