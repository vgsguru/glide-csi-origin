package app.glide.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import app.glide.data.SmsParser

/**
 * Keeps the ledger live.
 *
 * When a new bank alert arrives it is parsed immediately with the same rules
 * the batch scan uses. Parsing happens here on-device; the message itself is
 * never forwarded anywhere from this receiver.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Could not read incoming SMS: ${e.message}")
            return
        } ?: return

        for (message in messages) {
            val body = message.messageBody ?: continue
            val sender = message.originatingAddress.orEmpty()
            val parsed = SmsParser.parse(body, sender, System.currentTimeMillis())

            if (parsed != null) {
                // The dashboard re-reads the inbox on resume, so the new row is
                // picked up there; this log makes the live path verifiable.
                Log.i(
                    TAG,
                    "Captured ${parsed.direction} ${parsed.amount} at ${parsed.merchant} " +
                        "(${parsed.category}, confidence ${parsed.confidence})",
                )
            }
        }
    }

    companion object {
        private const val TAG = "GlideSmsReceiver"
    }
}
