package app.glide.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

/**
 * Speech input, using the device's own recogniser.
 *
 * Free, on-device where the OEM supports it, and no audio leaves the phone for
 * a third-party STT service -- which matters for an app that already asks for
 * something as sensitive as SMS access.
 */
class SpeechListener(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null
    private var listening = false

    val isAvailable: Boolean get() = SpeechRecognizer.isRecognitionAvailable(context)

    /**
     * @param onPartial interim text, for live feedback while speaking
     * @param onResult  the final transcript
     * @param onError   human-readable failure
     */
    fun start(
        onPartial: (String) -> Unit,
        onResult: (String) -> Unit,
        onError: (String) -> Unit,
        onEnd: () -> Unit,
    ) {
        if (!isAvailable) {
            onError("Speech recognition is not available on this device.")
            onEnd()
            return
        }
        stop()

        val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        this.recognizer = recognizer
        listening = true

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}

            override fun onPartialResults(partialResults: Bundle?) {
                partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.let(onPartial)
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                listening = false
                if (text.isBlank()) onError("I didn't catch that.") else onResult(text)
                onEnd()
            }

            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                listening = false
                onError(describe(error))
                onEnd()
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        runCatching { recognizer.startListening(intent) }
            .onFailure {
                listening = false
                Log.w(TAG, "startListening failed: ${it.message}")
                onError("Could not start listening.")
                onEnd()
            }
    }

    fun stop() {
        runCatching {
            recognizer?.stopListening()
            recognizer?.destroy()
        }
        recognizer = null
        listening = false
    }

    private fun describe(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "Microphone error."
        SpeechRecognizer.ERROR_CLIENT -> "Speech client error."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission denied."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
            "Speech recognition needs a network connection on this device."
        SpeechRecognizer.ERROR_NO_MATCH -> "I didn't catch that."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The recogniser is busy."
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't hear anything."
        else -> "Speech recognition failed."
    }

    companion object {
        private const val TAG = "GlideSpeech"
    }
}
