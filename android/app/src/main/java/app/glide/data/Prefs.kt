package app.glide.data

import android.content.Context

/** Small persisted settings store. */
class Prefs(context: Context) {

    private val store = context.getSharedPreferences("glide_prefs", Context.MODE_PRIVATE)

    var baseUrl: String
        // 10.0.2.2 is the emulator's alias for the host machine's localhost.
        get() = store.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) = store.edit().putString(KEY_BASE_URL, value.trim().trimEnd('/')).apply()

    var token: String?
        get() = store.getString(KEY_TOKEN, null)
        set(value) = store.edit().putString(KEY_TOKEN, value).apply()

    var email: String?
        get() = store.getString(KEY_EMAIL, null)
        set(value) = store.edit().putString(KEY_EMAIL, value).apply()

    var bufferFloor: Float
        get() = store.getFloat(KEY_BUFFER_FLOOR, 10_000f)
        set(value) = store.edit().putFloat(KEY_BUFFER_FLOOR, value).apply()

    var lastSyncAt: Long
        get() = store.getLong(KEY_LAST_SYNC, 0L)
        set(value) = store.edit().putLong(KEY_LAST_SYNC, value).apply()

    var windowDays: Int
        get() = store.getInt(KEY_WINDOW, 30)
        set(value) = store.edit().putInt(KEY_WINDOW, value).apply()

    /**
     * Gemini powers both chat and the spoken voice.
     *
     * Shipped with a working default so the app is useful the moment it opens.
     * A key inside an APK is extractable by anyone who downloads it, so this is
     * a demo-grade decision: rotate the key and move it server-side before any
     * real distribution.
     */
    var geminiApiKey: String
        get() = store.getString(KEY_GEMINI_KEY, DEFAULT_GEMINI_KEY) ?: DEFAULT_GEMINI_KEY
        set(value) = store.edit()
            .putString(KEY_GEMINI_KEY, value.trim().ifBlank { DEFAULT_GEMINI_KEY })
            .apply()

    var voiceEnabled: Boolean
        get() = store.getBoolean(KEY_VOICE_ENABLED, true)
        set(value) = store.edit().putBoolean(KEY_VOICE_ENABLED, value).apply()

    var voiceName: String
        get() = store.getString(KEY_VOICE_NAME, "Kore") ?: "Kore"
        set(value) = store.edit().putString(KEY_VOICE_NAME, value).apply()

    companion object {
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8080"
        const val DEFAULT_GEMINI_KEY = "AQ.Ab8RN6JMJqHeoj7jWDgRi_X2s78c0TsUk0OQts-XH9hUt9L4Kg"

        private const val KEY_BASE_URL = "base_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_EMAIL = "email"
        private const val KEY_BUFFER_FLOOR = "buffer_floor"
        private const val KEY_LAST_SYNC = "last_sync"
        private const val KEY_WINDOW = "window_days"
        private const val KEY_GEMINI_KEY = "gemini_api_key"
        private const val KEY_VOICE_ENABLED = "voice_enabled"
        private const val KEY_VOICE_NAME = "voice_name"
    }
}
