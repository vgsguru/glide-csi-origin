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
 * Groq client -- the app's primary reasoning engine.
 *
 * Chosen for latency: measured against this key, gpt-oss-120b answers a grounded
 * question in about a second, which is what makes a spoken conversation feel
 * like a conversation rather than a wait.
 *
 * Same contract as every other engine here: it only ever sees a context block
 * built from the phone's own analysis, and the numeral guard checks whatever
 * comes back before it reaches the screen or the speaker.
 */
class GroqClient(
    @Volatile var apiKey: String? = null,
    @Volatile var model: String = DEFAULT_MODEL,
) {

    class GroqException(message: String) : Exception(message)

    val isConfigured: Boolean get() = !apiKey.isNullOrBlank()

    /**
     * @param history prior turns, oldest first, as (role, content)
     * @param spoken  trims the reply for speech: no lists, shorter sentences
     */
    suspend fun chat(
        question: String,
        context: String,
        priorAnswer: String?,
        systemPrompt: String,
        history: List<Pair<String, String>> = emptyList(),
        spoken: Boolean = false,
        timeoutMs: Int = 60_000,
    ): String = withContext(Dispatchers.IO) {
        val key = apiKey?.takeIf { it.isNotBlank() }
            ?: throw GroqException("No Groq API key set.")

        val instruction = buildString {
            append(systemPrompt)
            if (spoken) {
                append(
                    "\nThis answer will be spoken aloud. Keep it under 45 words, one or two " +
                        "sentences, no lists, no symbols, and never read out a long reference number."
                )
            }
        }

        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", instruction))

        // A little history is what lets "what about tomorrow?" mean anything.
        history.takeLast(6).forEach { (role, content) ->
            messages.put(JSONObject().put("role", role).put("content", content))
        }

        val userText = if (priorAnswer != null) {
            "CONTEXT (the only facts you may use):\n$context\n\n" +
                "A deterministic engine already produced this correct answer:\n\"$priorAnswer\"\n\n" +
                "User asked: $question\n\n" +
                "Rewrite that answer to sound natural and conversational. Keep every number " +
                "identical. Do not add any figure that is not above."
        } else {
            "CONTEXT (the only facts you may use):\n$context\n\n" +
                "User asked: $question\n\nAnswer using only the context above."
        }
        messages.put(JSONObject().put("role", "user").put("content", userText))

        val body = JSONObject()
            .put("model", model)
            .put("messages", messages)
            .put("temperature", 0.3)
            .put("max_tokens", if (spoken) 200 else 400)

        var connection: HttpURLConnection? = null
        try {
            connection = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 12_000
                readTimeout = timeoutMs
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $key")
                doOutput = true
            }
            connection.outputStream.use { it.write(body.toString().toByteArray()) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            if (status !in 200..299) throw GroqException(explain(status, text))

            val choices = JSONObject(text).optJSONArray("choices")
                ?: throw GroqException("Groq returned no answer.")
            if (choices.length() == 0) throw GroqException("Groq returned no answer.")

            val answer = choices.getJSONObject(0)
                .optJSONObject("message")?.optString("content").orEmpty().trim()
            if (answer.isBlank()) throw GroqException("Groq returned an empty answer.")
            answer
        } catch (e: GroqException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "groq chat failed: ${e.message}")
            throw GroqException("Could not reach Groq — ${e.message ?: e.javaClass.simpleName}")
        } finally {
            connection?.disconnect()
        }
    }

    private fun explain(status: Int, body: String): String {
        val detail = runCatching {
            JSONObject(body).optJSONObject("error")?.optString("message")
        }.getOrNull().orEmpty()
        return when (status) {
            401 -> "Groq rejected the API key."
            404 -> "Model \"$model\" is not available on Groq."
            429 -> "Groq rate limit reached. Wait a moment and try again."
            in 500..599 -> "Groq is having trouble (HTTP $status)."
            else -> if (detail.isNotBlank()) detail else "Groq returned HTTP $status."
        }
    }

    companion object {
        private const val TAG = "GlideGroq"
        const val ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

        // Measured on this key: 120b ~1.0s with the best arithmetic, 20b ~0.6s.
        // Correctness wins for a money app; the extra 400ms is not felt.
        const val DEFAULT_MODEL = "openai/gpt-oss-120b"
        val MODELS = listOf("openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b")
    }
}
