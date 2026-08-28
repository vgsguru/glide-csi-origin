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
 * Direct client for Ollama Cloud (https://ollama.com/api/chat).
 *
 * This is what makes the phone independent of the laptop: gemma4:31b runs on
 * Ollama's hardware, the phone supplies grounding built from its own on-device
 * SMS analysis, and the numeral guard runs here before anything is shown.
 *
 * The API key is entered by the user in Profile and kept in SharedPreferences.
 * It is deliberately NOT compiled into the APK -- a key shipped inside an APK
 * is trivially extractable by anyone who downloads it.
 */
class OllamaCloudClient(
    @Volatile var apiKey: String? = null,
    @Volatile var model: String = DEFAULT_MODEL,
) {

    class CloudException(message: String) : Exception(message)

    val isConfigured: Boolean get() = !apiKey.isNullOrBlank()

    /**
     * One grounded turn. [context] is the only source of facts; [priorAnswer]
     * is the deterministic answer to rephrase, when the rule engine produced one.
     */
    suspend fun chat(
        question: String,
        context: String,
        priorAnswer: String?,
        systemPrompt: String,
        timeoutMs: Int = 120_000,
    ): String = withContext(Dispatchers.IO) {
        val key = apiKey?.takeIf { it.isNotBlank() }
            ?: throw CloudException("No Ollama API key set. Add one in Profile.")

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

        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", systemPrompt))
            .put(JSONObject().put("role", "user").put("content", prompt))

        val payload = JSONObject()
            .put("model", model)
            .put("messages", messages)
            .put("stream", false)
            // gemma4 is a thinking model; left on, reasoning tokens consume the
            // whole budget and the answer comes back empty.
            .put("think", false)
            .put("options", JSONObject().put("temperature", 0.3).put("num_predict", 500))

        var connection: HttpURLConnection? = null
        try {
            connection = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = timeoutMs
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $key")
                doOutput = true
            }
            connection.outputStream.use { it.write(payload.toString().toByteArray()) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()

            if (status !in 200..299) {
                throw CloudException(explain(status, body))
            }

            val content = JSONObject(body).optJSONObject("message")?.optString("content").orEmpty()
            if (content.isBlank()) throw CloudException("The model returned an empty answer.")
            stripThink(content)
        } catch (e: CloudException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "cloud chat failed: ${e.message}")
            throw CloudException("Could not reach Ollama Cloud — ${e.message ?: e.javaClass.simpleName}")
        } finally {
            connection?.disconnect()
        }
    }

    /** Turn API status codes into something a user can act on. */
    private fun explain(status: Int, body: String): String {
        val detail = runCatching { JSONObject(body).optString("error") }.getOrNull().orEmpty()
        return when (status) {
            401, 403 -> "Ollama rejected the API key. Check it at ollama.com/settings/keys."
            404 -> "Model \"$model\" not found on Ollama Cloud. Try gemma4:31b-cloud."
            429 -> "Ollama Cloud usage limit reached. Free-tier limits reset every few hours."
            in 500..599 -> "Ollama Cloud is having trouble (HTTP $status). Try again shortly."
            else -> if (detail.isNotBlank()) detail else "Ollama Cloud returned HTTP $status."
        }
    }

    private fun stripThink(text: String): String =
        text.replace(Regex("<think>.*?</think>", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE)), "")
            .trim()

    companion object {
        private const val TAG = "GlideOllamaCloud"
        const val ENDPOINT = "https://ollama.com/api/chat"
        const val DEFAULT_MODEL = "gemma4:31b-cloud"
        val MODELS = listOf("gemma4:31b-cloud", "gemma4:cloud", "gemma4:12b")
    }
}
