package app.glide

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.glide.data.ChatTurn
import app.glide.data.FirebaseService
import app.glide.data.BillScanner
import app.glide.data.LocalChatEngine
import app.glide.data.ManualStore
import app.glide.data.ParsedSms
import app.glide.data.ReceiptParser
import app.glide.data.Prefs
import app.glide.data.SmsAnalysis
import app.glide.data.SmsAnalyzer
import app.glide.data.SmsReader
import app.glide.net.ApiClient
import app.glide.net.GeminiClient
import app.glide.net.GroqClient
import app.glide.voice.ConversationController
import app.glide.voice.SpeechListener
import app.glide.voice.VoiceService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class Screen { Auth, Onboarding, Permission, Dashboard, Chat, Scan, Insights, Profile }

data class BackendStatus(
    val reachable: Boolean = false,
    val checking: Boolean = false,
    val model: String? = null,
    val modelAvailable: Boolean = false,
    val message: String? = null,
)

data class SyncStatus(
    val syncing: Boolean = false,
    val lastSyncAt: Long = 0L,
    val created: Int = 0,
    val merged: Int = 0,
    val error: String? = null,
    val cloudSynced: Boolean = false,
)

data class VoiceStatus(
    val cloudVoice: Boolean = false,
    val speaking: Boolean = false,
    val listening: Boolean = false,
    val autoSpeak: Boolean = false,
    val voiceId: String = VoiceService.DEFAULT_VOICE,
)

data class AuthState(
    val signedIn: Boolean = false,
    val busy: Boolean = false,
    val email: String? = null,
    val name: String? = null,
    val error: String? = null,
    /** True when the person chose to use the app without an account. */
    val guest: Boolean = false,
)

data class ScanState(
    val reading: Boolean = false,
    val draft: ReceiptParser.Draft? = null,
    val amountText: String = "",
    val merchantText: String = "",
    val error: String? = null,
    val saved: Int = 0,
)

data class FirebaseStatus(
    val configured: Boolean = false,
    val signedIn: Boolean = false,
    val uid: String? = null,
    val anonymous: Boolean = true,
    val email: String? = null,
    val message: String? = null,
)

class GlideViewModel(app: Application) : AndroidViewModel(app) {

    private val prefs = Prefs(app)
    private val api = ApiClient(prefs.baseUrl, prefs.token)
    private val firebase = FirebaseService(app)
    private val groq = GroqClient(prefs.groqApiKey)
    private val gemini = GeminiClient(prefs.geminiApiKey)
    private val manual = ManualStore(app)
    private val voice = VoiceService(app).apply {
        geminiKey = prefs.geminiApiKey
        voiceName = prefs.voiceName
    }

    private val _screen = MutableStateFlow(
        when {
            !prefs.signedIn -> Screen.Auth
            !prefs.onboarded -> Screen.Onboarding
            !SmsReader.hasPermission(app) -> Screen.Permission
            else -> Screen.Dashboard
        }
    )
    val screen: StateFlow<Screen> = _screen.asStateFlow()

    private val _analysis = MutableStateFlow(SmsAnalysis.EMPTY)
    val analysis: StateFlow<SmsAnalysis> = _analysis.asStateFlow()

    private val _scanning = MutableStateFlow(false)
    val scanning: StateFlow<Boolean> = _scanning.asStateFlow()

    private val _backend = MutableStateFlow(BackendStatus())
    val backend: StateFlow<BackendStatus> = _backend.asStateFlow()

    private val _sync = MutableStateFlow(SyncStatus(lastSyncAt = prefs.lastSyncAt))
    val sync: StateFlow<SyncStatus> = _sync.asStateFlow()

    private val _chat = MutableStateFlow<List<ChatTurn>>(emptyList())
    val chat: StateFlow<List<ChatTurn>> = _chat.asStateFlow()

    private val _suggestions = MutableStateFlow<List<String>>(emptyList())
    val suggestions: StateFlow<List<String>> = _suggestions.asStateFlow()

    private val _chatBusy = MutableStateFlow(false)
    val chatBusy: StateFlow<Boolean> = _chatBusy.asStateFlow()

    private val _baseUrl = MutableStateFlow(prefs.baseUrl)
    val baseUrl: StateFlow<String> = _baseUrl.asStateFlow()

    private val _bufferFloor = MutableStateFlow(prefs.bufferFloor.toDouble())
    val bufferFloor: StateFlow<Double> = _bufferFloor.asStateFlow()

    private val _windowDays = MutableStateFlow(prefs.windowDays)
    val windowDays: StateFlow<Int> = _windowDays.asStateFlow()

    private val _firebaseStatus = MutableStateFlow(FirebaseStatus(configured = firebase.isAvailable))
    val firebaseStatus: StateFlow<FirebaseStatus> = _firebaseStatus.asStateFlow()

    private val _engineLabel = MutableStateFlow(
        when {
            groq.isConfigured -> groq.model.substringAfter('/')
            gemini.isConfigured -> gemini.model
            else -> "on-device"
        }
    )
    val engineLabel: StateFlow<String> = _engineLabel.asStateFlow()

    private val _auth = MutableStateFlow(
        AuthState(
            signedIn = prefs.signedIn,
            email = prefs.email,
            name = prefs.displayName,
            guest = prefs.signedIn && prefs.email == null,
        )
    )
    val auth: StateFlow<AuthState> = _auth.asStateFlow()

    private val _scan = MutableStateFlow(ScanState())
    val scan: StateFlow<ScanState> = _scan.asStateFlow()

    private val _manualCount = MutableStateFlow(manual.count())
    val manualCount: StateFlow<Int> = _manualCount.asStateFlow()

    private val _voiceStatus = MutableStateFlow(
        VoiceStatus(
            cloudVoice = voice.isCloudVoice,
            autoSpeak = prefs.voiceEnabled,
            voiceId = prefs.voiceName,
        )
    )
    val voiceStatus: StateFlow<VoiceStatus> = _voiceStatus.asStateFlow()

    init {
        if (prefs.signedIn && SmsReader.hasPermission(app)) scanInbox()
        checkBackend()
        initFirebase()
    }

    // --- Firebase ----------------------------------------------------------

    private fun initFirebase() {
        if (!firebase.isAvailable) {
            _firebaseStatus.value = FirebaseStatus(
                configured = false,
                message = "google-services.json missing or invalid",
            )
            return
        }
        viewModelScope.launch {
            firebase.ensureSignedIn()
                .onSuccess {
                    _firebaseStatus.value = FirebaseStatus(
                        configured = true,
                        signedIn = true,
                        uid = it,
                        anonymous = firebase.currentUser?.isAnonymous ?: true,
                        email = firebase.currentUser?.email,
                    )
                    firebase.logEvent("app_open")
                }
                .onFailure {
                    _firebaseStatus.value = FirebaseStatus(
                        configured = true,
                        signedIn = false,
                        message = "Sign-in failed — enable Anonymous auth in the " +
                            "Firebase console (Authentication → Sign-in method).",
                    )
                }
        }
    }

    fun linkFirebaseEmail(email: String, password: String) {
        viewModelScope.launch {
            firebase.linkEmail(email, password)
                .onSuccess {
                    _firebaseStatus.value = _firebaseStatus.value.copy(
                        signedIn = true, uid = it, anonymous = false,
                        email = firebase.currentUser?.email, message = null,
                    )
                    firebase.logEvent("account_linked")
                }
                .onFailure {
                    _firebaseStatus.value = _firebaseStatus.value.copy(message = it.message)
                }
        }
    }

    fun navigate(screen: Screen) { _screen.value = screen }

    // --- account -----------------------------------------------------------

    fun signIn(email: String, password: String) = authenticate(email, password, null)

    fun signUp(email: String, password: String, name: String) =
        authenticate(email, password, name.ifBlank { email.substringBefore('@') })

    private fun authenticate(email: String, password: String, name: String?) {
        viewModelScope.launch {
            _auth.value = _auth.value.copy(busy = true, error = null)

            // Firebase is the identity of record; the backend account is created
            // alongside it when reachable, but must not block signing in.
            val result = if (name != null) {
                firebase.linkEmail(email, password)
            } else {
                firebase.signInEmail(email, password)
            }

            result
                .onSuccess {
                    prefs.signedIn = true
                    prefs.email = email
                    prefs.displayName = name ?: firebase.currentUser?.displayName ?: email.substringBefore('@')
                    prefs.token = null   // force a fresh backend session for this identity
                    _auth.value = AuthState(
                        signedIn = true, email = email, name = prefs.displayName,
                    )
                    _firebaseStatus.value = _firebaseStatus.value.copy(
                        signedIn = true, anonymous = false, email = email,
                    )
                    afterSignIn()
                }
                .onFailure { error ->
                    _auth.value = _auth.value.copy(
                        busy = false,
                        error = error.message ?: "Could not sign in.",
                    )
                }
        }
    }

    /** Use the app without an account: everything local still works. */
    fun continueAsGuest() {
        prefs.signedIn = true
        prefs.email = null
        prefs.displayName = null
        _auth.value = AuthState(signedIn = true, guest = true)
        afterSignIn()
    }

    private fun afterSignIn() {
        _screen.value = if (!prefs.onboarded) Screen.Onboarding
        else if (!SmsReader.hasPermission(getApplication())) Screen.Permission
        else Screen.Dashboard
    }

    fun finishOnboarding() {
        prefs.onboarded = true
        _screen.value = if (SmsReader.hasPermission(getApplication())) {
            scanInbox()
            Screen.Dashboard
        } else Screen.Permission
    }

    fun signOut() {
        firebase.signOut()
        prefs.clearSession()
        api.token = null
        _chat.value = emptyList()
        _analysis.value = SmsAnalysis.EMPTY
        _auth.value = AuthState(signedIn = false)
        _screen.value = Screen.Auth
    }

    // --- SMS ---------------------------------------------------------------

    /** Read the inbox window and rebuild the whole on-device picture. */
    fun scanInbox() {
        val context = getApplication<Application>()
        if (!SmsReader.hasPermission(context)) {
            _screen.value = Screen.Permission
            return
        }
        viewModelScope.launch {
            _scanning.value = true
            try {
                val days = _windowDays.value
                // Always read far enough back for recurring detection to see a
                // pattern, even when the user is only looking at 30 days.
                val lookback = maxOf(days, SmsAnalyzer.OBLIGATION_LOOKBACK_DAYS)
                val result = withContext(Dispatchers.IO) {
                    SmsAnalyzer.analyze(
                        SmsReader.readInbox(context, lookback),
                        days,
                        lookback,
                        manual.all(),
                    )
                }
                _analysis.value = result
                mirrorToCloud()
            } finally {
                _scanning.value = false
            }
        }
    }

    fun onPermissionGranted() {
        _screen.value = Screen.Dashboard
        scanInbox()
    }

    fun setWindowDays(days: Int) {
        prefs.windowDays = days
        _windowDays.value = days
        scanInbox()
    }

    fun setBufferFloor(value: Double) {
        prefs.bufferFloor = value.toFloat()
        _bufferFloor.value = value
        mirrorToCloud()
    }

    // --- backend -----------------------------------------------------------

    fun setBaseUrl(url: String) {
        prefs.baseUrl = url
        api.baseUrl = prefs.baseUrl
        _baseUrl.value = prefs.baseUrl
        checkBackend()
    }

    fun checkBackend() {
        viewModelScope.launch {
            _backend.value = _backend.value.copy(checking = true, message = null)
            try {
                val response = api.health()
                val engine = response.optJSONObject("engine")
                _backend.value = BackendStatus(
                    reachable = true,
                    checking = false,
                    model = engine?.optString("model"),
                    modelAvailable = engine?.optBoolean("available") ?: false,
                )
                ensureSession()
            } catch (e: Exception) {
                _backend.value = BackendStatus(
                    reachable = false, checking = false, message = e.message,
                )
            }
        }
    }

    /**
     * Each install gets its own backend account, keyed to the Firebase uid so
     * the same phone keeps the same ledger across reinstalls. There is no shared
     * demo login: one device, one account, one set of real numbers.
     */
    private suspend fun ensureSession() {
        if (!prefs.token.isNullOrEmpty()) {
            api.token = prefs.token
            return
        }
        val identity = firebase.uid ?: android.provider.Settings.Secure.getString(
            getApplication<Application>().contentResolver,
            android.provider.Settings.Secure.ANDROID_ID,
        ) ?: java.util.UUID.randomUUID().toString()

        val email = prefs.email ?: "device-${identity.take(16)}@glide.local"
        val secret = "glide-${identity.takeLast(24)}"

        try {
            val token = api.login(email, secret)
            prefs.token = token
            prefs.email = email
        } catch (_: Exception) {
            runCatching {
                val token = api.signup(email, secret, android.os.Build.MODEL ?: "Android device")
                prefs.token = token
                prefs.email = email
            }
        }
    }

    /**
     * Push the summary to Firestore.
     *
     * This is what the Quest headset reads, so it deliberately does not depend
     * on the laptop backend. It used to run only after a successful
     * syncTransactions call, which meant that with the backend down -- the
     * normal case away from the dev machine -- the headset never saw a single
     * figure.
     */
    private fun mirrorToCloud() {
        val analysis = _analysis.value
        if (analysis.parsed == 0) return
        viewModelScope.launch {
            val ok = firebase.syncSummary(analysis, _bufferFloor.value).isSuccess
            _sync.value = _sync.value.copy(cloudSynced = ok)
        }
    }

    /** Upload the parsed rows so the web dashboard mirrors the phone. */
    fun syncToBackend() {
        viewModelScope.launch {
            _sync.value = _sync.value.copy(syncing = true, error = null)
            val rows = _analysis.value.transactions
            if (rows.isEmpty()) {
                _sync.value = _sync.value.copy(syncing = false, error = "Nothing parsed to sync yet")
                return@launch
            }

            // Cloud first and independently: the headset matters more than the
            // dev backend, and it must not be taken down by it.
            val cloud = firebase.syncSummary(_analysis.value, _bufferFloor.value).isSuccess

            try {
                if (api.token.isNullOrEmpty()) ensureSession()
                val response = api.syncTransactions(rows, android.os.Build.MODEL ?: "Android device")
                val now = System.currentTimeMillis()
                prefs.lastSyncAt = now
                _sync.value = SyncStatus(
                    syncing = false,
                    lastSyncAt = now,
                    created = response.optInt("created"),
                    merged = response.optInt("merged"),
                    cloudSynced = cloud,
                )
                firebase.logEvent("ledger_synced", mapOf("parsed" to rows.size))
                runCatching { api.tick() }
            } catch (e: Exception) {
                // The backend is optional. A cloud mirror still counts as a win.
                _sync.value = _sync.value.copy(
                    syncing = false,
                    cloudSynced = cloud,
                    error = if (cloud) null else e.message,
                )
            }
        }
    }

    // --- chat --------------------------------------------------------------

    fun loadChat() {
        viewModelScope.launch {
            // Chips come from the phone's own figures, so they appear even with
            // no backend and no cloud key.
            _suggestions.value = localSuggestions(_analysis.value, _bufferFloor.value)
            if (!gemini.isConfigured && _backend.value.reachable) {
                runCatching {
                    if (api.token.isNullOrEmpty()) ensureSession()
                    _chat.value = api.chatHistory()
                }
            }
        }
    }

    /**
     * Grounded chat, on-device first.
     *
     * The phone already knows every number it needs, so the order is:
     *   1. Answer deterministically from the on-device analysis.
     *   2. If an Ollama Cloud key is set, let gemma4:31b rephrase it -- but only
     *      accept the rewrite if every figure in it survives the numeral guard.
     *   3. If there is no key, fall back to the laptop backend when reachable.
     *   4. Otherwise ship the deterministic answer as-is.
     *
     * Step 4 is why chat still works on a train with no laptop and no key.
     */
    fun send(message: String, fromMic: Boolean = false) {
        val text = message.trim()
        if (text.isEmpty() || _chatBusy.value) return

        _chat.value = _chat.value + ChatTurn(role = "user", content = text)
        _chatBusy.value = true

        viewModelScope.launch {
            val analysis = _analysis.value
            val floor = _bufferFloor.value

            if (analysis.parsed == 0) {
                _chat.value = _chat.value + ChatTurn(
                    role = "assistant",
                    content = "I have not read any bank alerts yet, so I have no numbers to answer " +
                        "from. Grant SMS access and pull to refresh the dashboard first.",
                    engine = "rules",
                )
                _chatBusy.value = false
                return@launch
            }

            val context = LocalChatEngine.buildContext(analysis, floor)
            val rule = LocalChatEngine.ruleAnswer(text, analysis, floor)
            val base = rule ?: LocalChatEngine.fallback(analysis, floor)

            var content = base.text
            var engine = "on-device rules"
            var note: String? = null

            var handled = false

            if (groq.isConfigured) {
                try {
                    val generated = groq.chat(
                        question = text,
                        context = context,
                        priorAnswer = if (rule != null) base.text else null,
                        systemPrompt = LocalChatEngine.SYSTEM_PROMPT,
                        history = _chat.value.takeLast(6).map { it.role to it.content },
                    )
                    val allowed = context + System.lineSeparator() + base.text
                    if (LocalChatEngine.numeralsAreGrounded(generated, allowed)) {
                        content = generated
                        engine = groq.model.substringAfter('/')
                        handled = true
                    } else {
                        note = "(model output rejected by the numeral guard)"
                        handled = true
                    }
                } catch (e: Exception) {
                    note = e.message
                }
            }

            if (!handled && gemini.isConfigured) {
                try {
                    val generated = gemini.chat(
                        question = text,
                        context = context,
                        priorAnswer = if (rule != null) base.text else null,
                        systemPrompt = LocalChatEngine.SYSTEM_PROMPT,
                    )
                    val allowed = "$context\n${base.text}"
                    if (LocalChatEngine.numeralsAreGrounded(generated, allowed)) {
                        content = generated
                        engine = gemini.model
                        handled = true
                    } else {
                        // The model invented a figure. Keep the deterministic
                        // answer and say why, rather than showing a wrong number.
                        note = "(model output rejected by the numeral guard)"
                        handled = true
                    }
                } catch (e: Exception) {
                    // A bad or rate-limited key must not strand the user on
                    // template answers when a working backend is right there.
                    note = e.message
                }
            }

            if (!handled && _backend.value.reachable) {
                runCatching {
                    if (api.token.isNullOrEmpty()) ensureSession()
                    api.chat(text)
                }.onSuccess { reply ->
                    _chat.value = _chat.value + reply
                    _chatBusy.value = false
                    runCatching { _suggestions.value = api.chatSuggestions() }
                    return@launch
                }.onFailure { failure ->
                    note = listOfNotNull(note, failure.message).joinToString(" · ")
                }
            }

            _chat.value = _chat.value + ChatTurn(
                role = "assistant",
                content = if (note != null) "$content\n\n$note" else content,
                grounding = base.grounding,
                engine = engine,
            )
            _suggestions.value = localSuggestions(analysis, floor)
            _chatBusy.value = false

            // Speak only the answer, never the diagnostic note appended to it.
            if (fromMic) speak(content)
        }
    }

    /** Suggestion chips built from the phone's own figures. */
    private fun localSuggestions(analysis: SmsAnalysis, floor: Double): List<String> {
        val chips = mutableListOf<String>()
        val sts = LocalChatEngine.safeToSpend(analysis, floor)
        if (sts > 0) {
            val probe = maxOf(500.0, Math.round(sts * 0.4 / 100.0) * 100.0)
            chips.add("Can I afford Rs.${probe.toInt()}?")
        }
        analysis.obligations.firstOrNull()?.let { chips.add("Why is ${it.name} due so soon?") }
        if (sts <= 0) chips.add("Why is my buffer low?")
        if (analysis.totalOut > 0) chips.add("Where did my money go?")
        chips.add("What is my income range?")
        return chips.take(5)
    }

    fun setGeminiKey(key: String) {
        prefs.geminiApiKey = key
        gemini.apiKey = prefs.geminiApiKey
        voice.geminiKey = prefs.geminiApiKey
        _engineLabel.value = if (gemini.isConfigured) gemini.model else "on-device"
        _voiceStatus.value = _voiceStatus.value.copy(cloudVoice = voice.isCloudVoice)
    }

    // --- bill OCR ----------------------------------------------------------

    /** Read a bill photo and produce an editable draft -- never a committed row. */
    fun scanBill(uri: android.net.Uri) {
        viewModelScope.launch {
            _scan.value = _scan.value.copy(reading = true, error = null, draft = null)
            val outcome = withContext(Dispatchers.IO) {
                BillScanner.read(getApplication(), uri)
            }
            val text = when (outcome) {
                is BillScanner.Outcome.Text -> outcome.value
                BillScanner.Outcome.NoText -> {
                    _scan.value = _scan.value.copy(
                        reading = false,
                        error = "No readable text found. Try a straighter, better-lit photo.",
                    )
                    return@launch
                }
                BillScanner.Outcome.BadImage -> {
                    _scan.value = _scan.value.copy(
                        reading = false,
                        error = "That image could not be opened.",
                    )
                    return@launch
                }
                BillScanner.Outcome.ModelUnavailable -> {
                    _scan.value = _scan.value.copy(
                        reading = false,
                        error = "The text recogniser is not available on this device. It ships " +
                            "through Google Play Services, which this device is missing.",
                    )
                    return@launch
                }
            }
            val draft = ReceiptParser.parse(text)
            if (draft == null) {
                _scan.value = _scan.value.copy(
                    reading = false,
                    error = "Text was read, but no amount looked like a total. " +
                        "You can still add it manually.",
                )
                return@launch
            }
            _scan.value = ScanState(
                reading = false,
                draft = draft,
                amountText = if (draft.amount % 1.0 == 0.0) draft.amount.toInt().toString()
                            else String.format(java.util.Locale.US, "%.2f", draft.amount),
                merchantText = draft.merchant,
            )
        }
    }

    fun setScanAmount(value: String) {
        _scan.value = _scan.value.copy(amountText = value.filter { it.isDigit() || it == '.' })
    }

    fun setScanMerchant(value: String) {
        _scan.value = _scan.value.copy(merchantText = value)
    }

    fun saveScannedBill() {
        val state = _scan.value
        val draft = state.draft ?: return
        val amount = state.amountText.toDoubleOrNull() ?: return
        if (amount <= 0) return

        val merchant = state.merchantText.ifBlank { "Bill" }
        manual.add(
            ParsedSms(
                amount = amount,
                direction = "DEBIT",
                merchant = merchant,
                // Re-derive from the edited name: the user may have corrected it.
                category = app.glide.data.SmsParser.categorize(merchant, draft.rawText, "DEBIT"),
                channel = "CASH",
                accountHint = "OCR",
                reference = System.nanoTime().toString(),
                balanceAfter = null,
                occurredAt = draft.occurredAt,
                // A human confirmed the figures, so this is authoritative.
                confidence = 0.99,
                sender = "OCR",
                raw = draft.rawText,
            )
        )
        _manualCount.value = manual.count()
        _scan.value = ScanState(saved = state.saved + 1)
        scanInbox()
    }

    fun discardScan() {
        _scan.value = ScanState()
    }

    // --- conversation ------------------------------------------------------

    private var conversation: ConversationController? = null

    /** Bound once from the UI, which owns the SpeechListener (main-thread API). */
    fun attachConversation(speech: SpeechListener): ConversationController {
        conversation?.let { return it }
        val controller = ConversationController(getApplication(), viewModelScope, speech, voice)
        controller.answer = { question -> answerAloud(question) }
        conversation = controller
        return controller
    }

    /**
     * The spoken path. Same grounding and same numeral guard as the typed one --
     * a voice answer is not allowed to be looser about figures than a written
     * one. It is only phrased for the ear.
     */
    private suspend fun answerAloud(question: String): String {
        val analysis = _analysis.value
        val floor = _bufferFloor.value

        if (analysis.parsed == 0) {
            return "I have not read any bank messages yet, so I have no numbers to answer from."
        }

        val context = LocalChatEngine.buildContext(analysis, floor)
        val rule = LocalChatEngine.ruleAnswer(question, analysis, floor)
        val base = rule ?: LocalChatEngine.fallback(analysis, floor)

        val spoken = if (groq.isConfigured) {
            runCatching {
                val generated = groq.chat(
                    question = question,
                    context = context,
                    priorAnswer = if (rule != null) base.text else null,
                    systemPrompt = LocalChatEngine.SYSTEM_PROMPT,
                    history = _chat.value.takeLast(4).map { it.role to it.content },
                    spoken = true,
                )
                val allowed = context + System.lineSeparator() + base.text
                if (LocalChatEngine.numeralsAreGrounded(generated, allowed)) {
                    generated
                } else base.text
            }.getOrDefault(base.text)
        } else base.text

        // Keep the transcript so the typed screen and the voice share one thread.
        _chat.value = _chat.value +
            ChatTurn(role = "user", content = question) +
            ChatTurn(
                role = "assistant",
                content = spoken,
                grounding = base.grounding,
                engine = if (groq.isConfigured) groq.model.substringAfter('/') else "on-device",
            )
        return spoken
    }

    // --- voice -------------------------------------------------------------

    fun setVoiceEnabled(enabled: Boolean) {
        prefs.voiceEnabled = enabled
        _voiceStatus.value = _voiceStatus.value.copy(autoSpeak = enabled)
    }

    /** Read one answer aloud. */
    fun speak(text: String) {
        viewModelScope.launch {
            _voiceStatus.value = _voiceStatus.value.copy(speaking = true)
            runCatching { voice.speak(text) }
            _voiceStatus.value = _voiceStatus.value.copy(speaking = false)
        }
    }

    fun stopSpeaking() {
        voice.stop()
        _voiceStatus.value = _voiceStatus.value.copy(speaking = false)
    }

    override fun onCleared() {
        super.onCleared()
        voice.release()
    }

}
