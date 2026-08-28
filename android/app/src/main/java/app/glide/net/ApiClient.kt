package app.glide.net

import app.glide.data.ChatTurn
import app.glide.data.ParsedSms
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talks to the Glide backend on the developer's machine.
 *
 * Deliberately dependency-free (HttpURLConnection + org.json): the app must
 * still build and run when the phone has no route to the backend at all, and
 * every call here degrades to a typed error rather than a crash.
 */
class ApiClient(
    @Volatile var baseUrl: String,
    @Volatile var token: String? = null,
) {

    class ApiException(message: String) : Exception(message)

    private fun open(path: String, method: String, timeoutMs: Int): HttpURLConnection {
        val connection = URL("${baseUrl.trimEnd('/')}$path").openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 8000
        connection.readTimeout = timeoutMs
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "application/json")
        token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        return connection
    }

    private suspend fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        timeoutMs: Int = 30_000,
    ): JSONObject = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            connection = open(path, method, timeoutMs)
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()

            if (status !in 200..299) {
                val detail = runCatching {
                    val error = JSONObject(text)
                    error.optString("detail").ifEmpty { error.optString("error") }
                }.getOrNull().orEmpty()
                throw ApiException(
                    if (detail.isNotEmpty()) detail else "Request failed ($status)"
                )
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            throw ApiException("Cannot reach Glide at $baseUrl — ${e.message ?: e.javaClass.simpleName}")
        } finally {
            connection?.disconnect()
        }
    }

    suspend fun health(): JSONObject = request("/health", timeoutMs = 8000)

    suspend fun login(email: String, password: String): String {
        val response = request(
            "/auth/login", "POST",
            JSONObject().put("email", email).put("password", password),
        )
        val issued = response.getString("token")
        token = issued
        return issued
    }

    suspend fun signup(email: String, password: String, name: String): String {
        val response = request(
            "/auth/signup", "POST",
            JSONObject().put("email", email).put("password", password).put("name", name),
        )
        val issued = response.getString("token")
        token = issued
        return issued
    }

    /** Push locally parsed SMS so the web dashboard mirrors the phone. */
    suspend fun syncTransactions(rows: List<ParsedSms>, deviceLabel: String): JSONObject {
        val messages = JSONArray()
        rows.forEach { row ->
            messages.put(
                JSONObject()
                    .put("body", row.raw)
                    .put("sender", row.sender)
                    .put("received_at", row.occurredAt)
            )
        }
        return request(
            "/sms/ingest-batch", "POST",
            JSONObject().put("messages", messages).put("device_label", deviceLabel),
            timeoutMs = 120_000,
        )
    }

    /**
     * Ask gemma4:12b, grounded in the backend's financial state.
     * Generous timeout: a 12B model on CPU takes a while to answer.
     */
    suspend fun chat(message: String): ChatTurn {
        val response = request(
            "/chat", "POST",
            JSONObject().put("message", message),
            timeoutMs = 240_000,
        )
        val reply = response.getJSONObject("reply")

        val grounding = ArrayList<Pair<String, String>>()
        reply.optJSONArray("grounding")?.let { array ->
            for (index in 0 until array.length()) {
                val row = array.getJSONObject(index)
                grounding.add(row.optString("label") to row.optString("value"))
            }
        }

        return ChatTurn(
            role = "assistant",
            content = reply.optString("content"),
            grounding = grounding,
            snapshotRef = reply.optString("cited_snapshot_ref").ifEmpty { null },
            engine = reply.optString("engine").ifEmpty { null },
        )
    }

    suspend fun chatSuggestions(): List<String> {
        val response = request("/chat/suggestions", timeoutMs = 20_000)
        val array = response.optJSONArray("suggestions") ?: return emptyList()
        return (0 until array.length()).map { array.getString(it) }
    }

    suspend fun chatHistory(): List<ChatTurn> {
        val response = request("/chat/history", timeoutMs = 20_000)
        val array = response.optJSONArray("messages") ?: return emptyList()
        return (0 until array.length()).map { index ->
            val row = array.getJSONObject(index)
            val grounding = ArrayList<Pair<String, String>>()
            row.optJSONArray("grounding")?.let { g ->
                for (i in 0 until g.length()) {
                    val entry = g.getJSONObject(i)
                    grounding.add(entry.optString("label") to entry.optString("value"))
                }
            }
            ChatTurn(
                role = row.optString("role"),
                content = row.optString("content"),
                grounding = grounding,
                snapshotRef = row.optString("cited_snapshot_ref").ifEmpty { null },
                engine = row.optString("engine").ifEmpty { null },
            )
        }
    }

    suspend fun insights(): List<JSONObject> {
        val response = request("/insights", timeoutMs = 20_000)
        val array = response.optJSONArray("insights") ?: return emptyList()
        return (0 until array.length()).map { array.getJSONObject(it) }
    }

    suspend fun tick(): JSONObject =
        request("/agent/tick", "POST", JSONObject().put("use_llm", false), timeoutMs = 90_000)

    suspend fun dashboardState(): JSONObject = request("/dashboard/state", timeoutMs = 30_000)
}
