package app.glide.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import kotlin.coroutines.resume

/**
 * Speech output.
 *
 * Gemini's TTS is the default voice -- it needs no extra account, uses the same
 * key as chat, and sounds markedly better than the platform synthesiser. The
 * device voice remains as a fallback so the feature never simply fails.
 *
 * This layer only ever speaks text the grounded chat engine produced. It is a
 * renderer; it does not decide what is true.
 */
class VoiceService(private val context: Context) {

    @Volatile var geminiKey: String? = null
    @Volatile var voiceName: String = DEFAULT_VOICE

    val isCloudVoice: Boolean get() = !geminiKey.isNullOrBlank()

    private var player: MediaPlayer? = null
    private var androidTts: TextToSpeech? = null
    private var ttsReady = false

    init {
        androidTts = TextToSpeech(context) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                // en-IN reads Indian names and rupee amounts far better than en-US.
                val result = androidTts?.setLanguage(Locale("en", "IN"))
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    androidTts?.setLanguage(Locale.UK)
                }
                androidTts?.setSpeechRate(0.98f)
            }
        }
    }

    /** Speak [text]. Returns true when the Gemini voice was used. */
    suspend fun speak(text: String): Boolean {
        stop()
        val spoken = humanize(text)

        if (isCloudVoice) {
            val wav = runCatching { synthesize(spoken) }
                .onFailure { Log.w(TAG, "Gemini TTS failed: ${it.message}") }
                .getOrNull()
            if (wav != null) {
                val played = runCatching { play(wav) }.isSuccess
                if (played) return true
            }
        }

        speakWithDevice(spoken)
        return false
    }

    fun stop() {
        runCatching {
            player?.let { if (it.isPlaying) it.stop(); it.release() }
        }
        player = null
        runCatching { androidTts?.stop() }
    }

    fun release() {
        stop()
        runCatching { androidTts?.shutdown() }
        androidTts = null
    }

    // -----------------------------------------------------------------------

    /** Gemini returns headerless PCM, so we wrap it in a WAV container to play it. */
    private suspend fun synthesize(text: String): File = withContext(Dispatchers.IO) {
        val key = geminiKey ?: throw IllegalStateException("No Gemini key")

        val body = JSONObject()
            .put(
                "contents",
                JSONArray().put(
                    JSONObject().put(
                        "parts",
                        JSONArray().put(
                            JSONObject().put(
                                "text",
                                "Say this warmly and naturally, like a helpful friend: $text",
                            )
                        ),
                    )
                ),
            )
            .put(
                "generationConfig",
                JSONObject()
                    .put("responseModalities", JSONArray().put("AUDIO"))
                    .put(
                        "speechConfig",
                        JSONObject().put(
                            "voiceConfig",
                            JSONObject().put(
                                "prebuiltVoiceConfig",
                                JSONObject().put("voiceName", voiceName),
                            ),
                        ),
                    ),
            )

        var connection: HttpURLConnection? = null
        try {
            connection = (URL("$TTS_BASE/$TTS_MODEL:generateContent").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 90_000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-goog-api-key", key)
                doOutput = true
            }
            connection.outputStream.use { it.write(body.toString().toByteArray()) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw IllegalStateException("Gemini TTS HTTP $status")

            val part = JSONObject(payload)
                .getJSONArray("candidates").getJSONObject(0)
                .getJSONObject("content").getJSONArray("parts").getJSONObject(0)
            val inline = part.optJSONObject("inlineData") ?: part.optJSONObject("inline_data")
                ?: throw IllegalStateException("No audio returned")

            val mime = inline.optString("mimeType").ifEmpty { inline.optString("mime_type") }
            val rate = Regex("rate=(\\d+)").find(mime)?.groupValues?.get(1)?.toIntOrNull() ?: 24_000
            val pcm = Base64.decode(inline.getString("data"), Base64.DEFAULT)

            val file = File(context.cacheDir, "glide_speech.wav")
            file.writeBytes(wavHeader(pcm.size, rate) + pcm)
            file
        } finally {
            connection?.disconnect()
        }
    }

    /** Minimal 44-byte RIFF/WAVE header for 16-bit mono PCM. */
    private fun wavHeader(dataBytes: Int, sampleRate: Int): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * bitsPerSample / 8
        return ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray())
            putInt(36 + dataBytes)
            put("WAVE".toByteArray())
            put("fmt ".toByteArray())
            putInt(16)                                   // PCM chunk size
            putShort(1)                                  // format = PCM
            putShort(channels.toShort())
            putInt(sampleRate)
            putInt(byteRate)
            putShort((channels * bitsPerSample / 8).toShort())
            putShort(bitsPerSample.toShort())
            put("data".toByteArray())
            putInt(dataBytes)
        }.array()
    }

    private suspend fun play(file: File): Unit = suspendCancellableCoroutine { cont ->
        val mp = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            setDataSource(file.absolutePath)
            setOnCompletionListener { if (cont.isActive) cont.resume(Unit) }
            setOnErrorListener { _, _, _ -> if (cont.isActive) cont.resume(Unit); true }
            prepare()
            start()
        }
        player = mp
        cont.invokeOnCancellation { runCatching { mp.stop(); mp.release() } }
    }

    private fun speakWithDevice(text: String) {
        if (!ttsReady) return
        androidTts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "glide")
    }

    /**
     * Make figures read naturally aloud. "Rs.12,000" spoken literally comes out
     * as "R S dot twelve comma zero zero zero", which sounds broken.
     */
    private fun humanize(text: String): String = text
        .replace(Regex("Rs\\.?\\s?([0-9,]+)")) { m -> "${m.groupValues[1].replace(",", "")} rupees" }
        .replace("p10", "the tenth percentile")
        .replace("p50", "the median")
        .replace("p90", "the ninetieth percentile")
        .replace("UPI", "U P I")
        .replace("SMS", "S M S")
        .replace(Regex("\\s+"), " ")
        .trim()

    companion object {
        private const val TAG = "GlideVoice"
        private const val TTS_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
        const val TTS_MODEL = "gemini-3.1-flash-tts-preview"

        /** Warm, natural default from Gemini's prebuilt voice set. */
        const val DEFAULT_VOICE = "Kore"
        val VOICES = listOf("Kore", "Puck", "Charon", "Aoede")
    }
}
