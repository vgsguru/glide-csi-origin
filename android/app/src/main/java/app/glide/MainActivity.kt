package app.glide

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import androidx.activity.result.PickVisualMediaRequest
import androidx.core.content.FileProvider
import java.io.File
import app.glide.voice.SpeechListener
import app.glide.ui.components.FloatingAssistant
import app.glide.ui.components.GlassNav
import app.glide.ui.screens.*
import app.glide.ui.theme.GlideAppTheme

class MainActivity : ComponentActivity() {

    private var onPermissionResult: ((Boolean) -> Unit)? = null

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        onPermissionResult?.invoke(granted[Manifest.permission.READ_SMS] == true)
    }

    private var onMicResult: ((Boolean) -> Unit)? = null

    private val requestMic = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> onMicResult?.invoke(granted) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GlideAppTheme(darkTheme = true) {
                GlideApp(
                    onRequestPermission = { callback ->
                        onPermissionResult = callback
                        requestPermissions.launch(
                            arrayOf(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)
                        )
                    },
                    onRequestMic = { callback ->
                        onMicResult = callback
                        requestMic.launch(Manifest.permission.RECORD_AUDIO)
                    },
                )
            }
        }
    }
}

@Composable
fun GlideApp(
    onRequestPermission: ((Boolean) -> Unit) -> Unit,
    onRequestMic: ((Boolean) -> Unit) -> Unit,
) {
    val viewModel: GlideViewModel = viewModel()

    val screen by viewModel.screen.collectAsState()
    val analysis by viewModel.analysis.collectAsState()
    val scanning by viewModel.scanning.collectAsState()
    val backend by viewModel.backend.collectAsState()
    val sync by viewModel.sync.collectAsState()
    val chat by viewModel.chat.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    val chatBusy by viewModel.chatBusy.collectAsState()
    val baseUrl by viewModel.baseUrl.collectAsState()
    val bufferFloor by viewModel.bufferFloor.collectAsState()
    val windowDays by viewModel.windowDays.collectAsState()
    val firebaseStatus by viewModel.firebaseStatus.collectAsState()
    val engineLabel by viewModel.engineLabel.collectAsState()
    val voiceStatus by viewModel.voiceStatus.collectAsState()
    val authState by viewModel.auth.collectAsState()
    // Speech recognition lives here rather than in the ViewModel: SpeechRecognizer
    // must be created and driven on the main thread.
    val context = LocalContext.current

    val scanState by viewModel.scan.collectAsState()
    val manualCount by viewModel.manualCount.collectAsState()

    // Gallery uses the photo picker, which needs no storage permission at all.
    val pickImage = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri -> uri?.let(viewModel::scanBill) }

    // Camera writes to our own cache dir, shared via FileProvider.
    var pendingPhoto by remember { mutableStateOf<android.net.Uri?>(null) }
    val takePhoto = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { ok -> if (ok) pendingPhoto?.let(viewModel::scanBill) }

    fun launchCamera() {
        val dir = File(context.cacheDir, "bills").apply { mkdirs() }
        val file = File(dir, "bill_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        pendingPhoto = uri
        takePhoto.launch(uri)
    }
    val speech = remember { SpeechListener(context) }
    var listening by remember { mutableStateOf(false) }
    var partialSpeech by remember { mutableStateOf("") }

    fun beginListening() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        fun go() {
            partialSpeech = ""
            listening = true
            speech.start(
                onPartial = { partialSpeech = it },
                onResult = { spoken ->
                    partialSpeech = ""
                    viewModel.send(spoken, fromMic = true)
                },
                onError = { partialSpeech = it },
                onEnd = { listening = false },
            )
        }

        if (granted) go() else onRequestMic { ok -> if (ok) go() }
    }

    DisposableEffect(Unit) { onDispose { speech.stop() } }

    // The assistant is global: one controller, reachable from every screen.
    val conversation = remember { viewModel.attachConversation(speech) }
    val convoState by conversation.state.collectAsState()

    fun startConversation() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) conversation.start() else onRequestMic { ok -> if (ok) conversation.start() }
    }

    // Pull history and live suggestion chips when the chat tab opens.
    LaunchedEffect(screen) {
        if (screen == Screen.Chat) viewModel.loadChat()
    }

    // Re-read the inbox whenever the app comes back to the foreground, so alerts
    // that arrived while it was backgrounded (or a permission granted from
    // Settings) show up without the user having to hit refresh.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.scanInbox()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            // targetSdk 35 makes Android 15+ draw edge-to-edge by default, so
            // without this the status bar clock sits on top of the screen titles.
            .windowInsetsPadding(WindowInsets.systemBars)
    ) {
        when (screen) {
            Screen.Auth -> AuthScreen(
                auth = authState,
                onSignIn = viewModel::signIn,
                onSignUp = viewModel::signUp,
                onContinueWithoutAccount = viewModel::continueAsGuest,
            )

            Screen.Onboarding -> OnboardingScreen(
                windowDays = windowDays,
                bufferFloor = bufferFloor,
                onWindowDaysChange = viewModel::setWindowDays,
                onBufferFloorChange = viewModel::setBufferFloor,
                onFinish = viewModel::finishOnboarding,
            )

            Screen.Permission -> PermissionScreen(
                onGrant = {
                    onRequestPermission { granted ->
                        if (granted) viewModel.onPermissionGranted()
                    }
                }
            )

            Screen.Dashboard -> DashboardScreen(
                analysis = analysis,
                scanning = scanning,
                bufferFloor = bufferFloor,
                onRescan = viewModel::scanInbox,
            )

            Screen.Chat -> ChatScreen(
                messages = chat,
                suggestions = suggestions,
                busy = chatBusy,
                backend = backend,
                engineLabel = engineLabel,
                voice = voiceStatus,
                listening = listening,
                partialSpeech = partialSpeech,
                onSend = viewModel::send,
                onSpeak = viewModel::speak,
                onStopSpeaking = viewModel::stopSpeaking,
                onStartListening = { beginListening() },
                onStopListening = { speech.stop(); listening = false },
            )

            Screen.Scan -> ScanScreen(
                scan = scanState,
                cash = analysis.cash,
                manualCount = manualCount,
                onPickImage = {
                    pickImage.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                },
                onTakePhoto = { launchCamera() },
                onAmountChange = viewModel::setScanAmount,
                onMerchantChange = viewModel::setScanMerchant,
                onSave = viewModel::saveScannedBill,
                onDiscard = viewModel::discardScan,
            )

            Screen.Insights -> InsightsScreen(analysis = analysis, bufferFloor = bufferFloor)

            Screen.Profile -> ProfileScreen(
                analysis = analysis,
                auth = authState,
                cloudSynced = sync.cloudSynced,
                voice = voiceStatus,
                engineLabel = engineLabel,
                bufferFloor = bufferFloor,
                windowDays = windowDays,
                onBufferFloorChange = viewModel::setBufferFloor,
                onWindowDaysChange = viewModel::setWindowDays,
                onVoiceEnabledChange = viewModel::setVoiceEnabled,
                onPreviewVoice = {
                    viewModel.speak("Hello, I am Glide. I read your bank messages on this phone and answer from your own numbers.")
                },
                onSignOut = viewModel::signOut,
            )
        }

        // Nav and the assistant belong to the app proper, not to the gates in
        // front of it: sign-in, onboarding and the permission rationale.
        if (screen !in setOf(Screen.Auth, Screen.Onboarding, Screen.Permission)) {
            GlassNav(
                current = screen,
                onSelect = viewModel::navigate,
                modifier = Modifier.align(Alignment.BottomCenter),
            )

            // Sits above the nav, on top of whatever screen is showing.
            if (screen != Screen.Chat) {
                FloatingAssistant(
                    state = convoState,
                    engineLabel = engineLabel,
                    onStart = { startConversation() },
                    onStop = conversation::stop,
                    onBargeIn = conversation::bargeIn,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 16.dp, bottom = 96.dp),
                )
            }
        }
    }
}
