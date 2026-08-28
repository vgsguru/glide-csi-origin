package app.glide.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
import androidx.core.content.ContextCompat

/** Reads the device SMS inbox. Nothing here leaves the phone unless the user syncs. */
object SmsReader {

    private val INBOX: Uri = Telephony.Sms.Inbox.CONTENT_URI

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Every inbox message received in the last [days] days, newest first.
     * The date filter is applied by the content provider, so a large inbox
     * does not have to be pulled into memory.
     */
    fun readInbox(context: Context, days: Int = 30, limit: Int = 4000): List<RawSms> {
        if (!hasPermission(context)) return emptyList()

        val since = System.currentTimeMillis() - days * 86_400_000L
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
        )

        val messages = ArrayList<RawSms>()
        context.contentResolver.query(
            INBOX,
            projection,
            "${Telephony.Sms.DATE} >= ?",
            arrayOf(since.toString()),
            "${Telephony.Sms.DATE} DESC",
        )?.use { cursor ->
            val addressIndex = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
            val bodyIndex = cursor.getColumnIndex(Telephony.Sms.BODY)
            val dateIndex = cursor.getColumnIndex(Telephony.Sms.DATE)

            while (cursor.moveToNext() && messages.size < limit) {
                val body = if (bodyIndex >= 0) cursor.getString(bodyIndex) else null
                if (body.isNullOrBlank()) continue
                messages.add(
                    RawSms(
                        body = body,
                        sender = if (addressIndex >= 0) cursor.getString(addressIndex).orEmpty() else "",
                        receivedAt = if (dateIndex >= 0) cursor.getLong(dateIndex) else System.currentTimeMillis(),
                    )
                )
            }
        }
        return messages
    }
}
