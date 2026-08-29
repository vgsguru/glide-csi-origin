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
    /** Groq powers the reasoning; Gemini powers the voice. */
    var groqApiKey: String
        get() = store.getString(KEY_GROQ_KEY, DEFAULT_GROQ_KEY) ?: DEFAULT_GROQ_KEY
        set(value) = store.edit()
            .putString(KEY_GROQ_KEY, value.trim().ifBlank { DEFAULT_GROQ_KEY })
            .apply()

    var geminiApiKey: String
        get() = store.getString(KEY_GEMINI_KEY, DEFAULT_GEMINI_KEY) ?: DEFAULT_GEMINI_KEY
        set(value) = store.edit()
            .putString(KEY_GEMINI_KEY, value.trim().ifBlank { DEFAULT_GEMINI_KEY })
            .apply()

    var displayName: String?
        get() = store.getString(KEY_NAME, null)
        set(value) = store.edit().putString(KEY_NAME, value).apply()

    /** Cleared on sign-out; drives whether the app shows Auth on launch. */
    var signedIn: Boolean
        get() = store.getBoolean(KEY_SIGNED_IN, false)
        set(value) = store.edit().putBoolean(KEY_SIGNED_IN, value).apply()

    var onboarded: Boolean
        get() = store.getBoolean(KEY_ONBOARDED, false)
        set(value) = store.edit().putBoolean(KEY_ONBOARDED, value).apply()

    /** Sign-out clears identity, never the user's own settings or scanned bills. */
    fun clearSession() {
        store.edit()
            .remove(KEY_TOKEN).remove(KEY_EMAIL).remove(KEY_NAME)
            .putBoolean(KEY_SIGNED_IN, false)
            .apply()
    }

    var voiceEnabled: Boolean
        get() = store.getBoolean(KEY_VOICE_ENABLED, true)
        set(value) = store.edit().putBoolean(KEY_VOICE_ENABLED, value).apply()

    var voiceName: String
        get() = store.getString(KEY_VOICE_NAME, "Kore") ?: "Kore"
        set(value) = store.edit().putString(KEY_VOICE_NAME, value).apply()

    companion object {
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8080"
        // Supplied at build time from android/local.properties, which is not
        // in version control. A public repo is no place for a live key, and a
        // committed constant also ends up inside every compiled .dex.
        const val DEFAULT_GEMINI_KEY = app.glide.BuildConfig.GEMINI_API_KEY
        const val DEFAULT_GROQ_KEY = app.glide.BuildConfig.GROQ_API_KEY

        private const val KEY_BASE_URL = "base_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_EMAIL = "email"
        private const val KEY_BUFFER_FLOOR = "buffer_floor"
        private const val KEY_LAST_SYNC = "last_sync"
        private const val KEY_WINDOW = "window_days"
        private const val KEY_GEMINI_KEY = "gemini_api_key"
        private const val KEY_GROQ_KEY = "groq_api_key"
        private const val KEY_VOICE_ENABLED = "voice_enabled"
        private const val KEY_VOICE_NAME = "voice_name"
        private const val KEY_NAME = "display_name"
        private const val KEY_SIGNED_IN = "signed_in"
        private const val KEY_ONBOARDED = "onboarded"
    }
}
