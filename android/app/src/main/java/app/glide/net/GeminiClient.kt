package app.glide.net

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Google Gemini client for grounded chat.
 *
 * Same contract as every other engine here: it receives a context block built
 * from the phone's own SMS analysis and may only rephrase an answer the
 * deterministic engine already produced. The numeral guard runs on whatever
 * comes back, so a hallucinated figure never reaches the screen.
 *
 * The key is entered by the user in Profile and kept in SharedPreferences --
 * never compiled into the APK, where anyone could extract it.
 */
class GeminiClient(
    @Volatile var apiKey: String? = null,
    @Volatile var model: String = DEFAULT_MODEL,
) {

    class GeminiException(message: String) : Exception(message)

    val isConfigured: Boolean get() = !apiKey.isNullOrBlank()

    suspend fun chat(
        question: String,
        context: String,
        priorAnswer: String?,
        systemPrompt: String,
        timeoutMs: Int = 120_000,
    ): String = withContext(Dispatchers.IO) {
        val key = apiKey?.takeIf { it.isNotBlank() }
            ?: throw GeminiException("No Gemini API key set. Add one in Profile.")

        val prompt = if (priorAnswer != null) {
            "CONTEXT (the only facts you may use):\n$context\n\n" +
                "A deterministic engine already produced this correct answer:\n\"$priorAnswer\"\n\n" +
                "User asked: $question\n\n" +
                "Rewrite that answer to sound natural and conversational. Keep every number " +
                "identical. Do not add any figure that is not above."
        } else {
            "CONTEXT (the only facts you may use):\n$context\n\n" +
                "User asked: $question\n\nAnswer using only the context above."
        }

        val body = JSONObject()
            .put(
                "contents",
                JSONArray().put(
                    JSONObject().put("parts", JSONArray().put(JSONObject().put("text", prompt)))
                ),
            )
            .put(
                "systemInstruction",
                JSONObject().put("parts", JSONArray().put(JSONObject().put("text", systemPrompt))),
            )
            .put(
                "generationConfig",
                JSONObject()
                    .put("temperature", 0.3)
                    .put("maxOutputTokens", 500)
                    // Thinking is what made this slow: 26s with it on, 1.3s off.
                    // We want the grounded sentence, not the deliberation.
                    .put("thinkingConfig", JSONObject().put("thinkingBudget", 0)),
            )

        var connection: HttpURLConnection? = null
        try {
            val url = "$BASE/$model:generateContent"
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = timeoutMs
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-goog-api-key", key)
                doOutput = true
            }
            connection.outputStream.use { it.write(body.toString().toByteArray()) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()

            if (status !in 200..299) throw GeminiException(explain(status, text))

            val parsed = JSONObject(text)
            val candidates = parsed.optJSONArray("candidates")
                ?: throw GeminiException("Gemini returned no answer.")
            if (candidates.length() == 0) throw GeminiException("Gemini returned no answer.")

            val parts = candidates.getJSONObject(0)
                .optJSONObject("content")?.optJSONArray("parts")
                ?: throw GeminiException("Gemini returned an empty response.")

            val builder = StringBuilder()
            for (i in 0 until parts.length()) {
                builder.append(parts.getJSONObject(i).optString("text"))
            }
            val answer = builder.toString().trim()
            if (answer.isBlank()) throw GeminiException("Gemini returned an empty answer.")
            answer
        } catch (e: GeminiException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "gemini chat failed: ${e.message}")
            throw GeminiException("Could not reach Gemini — ${e.message ?: e.javaClass.simpleName}")
        } finally {
            connection?.disconnect()
        }
    }

    private fun explain(status: Int, body: String): String {
        val detail = runCatching {
            JSONObject(body).optJSONObject("error")?.optString("message")
        }.getOrNull().orEmpty()
        return when (status) {
            400 -> if (detail.isNotBlank()) detail else "Gemini rejected the request."
            401, 403 -> "Gemini rejected the API key. Check it in Google AI Studio."
            404 -> "Model \"$model\" is not available. $detail"
            429 -> "Gemini rate limit reached. Wait a moment and try again."
            in 500..599 -> "Gemini is having trouble (HTTP $status)."
            else -> if (detail.isNotBlank()) detail else "Gemini returned HTTP $status."
        }
    }

    companion object {
        private const val TAG = "GlideGemini"
        const val BASE = "https://generativelanguage.googleapis.com/v1beta/models"

        // gemini-2.0-flash was retired. 3.5-flash is the fastest reliable
        // option measured against this key (~1.3s); 3.7 returned 503 under load.
        const val DEFAULT_MODEL = "gemini-3.5-flash"
        val MODELS = listOf("gemini-3.5-flash", "gemini-3.6-flash")
    }
}
