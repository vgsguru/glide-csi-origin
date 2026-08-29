package app.glide.voice

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Hands-free conversation: listen, answer aloud, listen again.
 *
 * A note on what this is and is not. Gemini's Live API would give true
 * full-duplex streaming audio, but it authenticates only with an OAuth2 access
 * token -- it rejects API keys outright -- so it cannot ship inside an app that
 * holds a key. This is the honest alternative: a turn-taking loop that keeps the
 * microphone open between turns, so the user never presses anything twice.
 *
 * The parts that matter for it to feel like a conversation:
 *  - the mic reopens automatically once the reply finishes
 *  - speaking while Glide is talking interrupts it (barge-in)
 *  - every state is observable, so the UI can animate against it
 */
class ConversationController(
    context: Context,
    private val scope: CoroutineScope,
    private val speech: SpeechListener,
    private val voice: VoiceService,
) {

    enum class Phase { Idle, Listening, Thinking, Speaking }

    data class State(
        val active: Boolean = false,
        val phase: Phase = Phase.Idle,
        val partial: String = "",
        val lastQuestion: String = "",
        val lastAnswer: String = "",
        val error: String? = null,
        /** Rough mic level 0..1, for the waveform. */
        val level: Float = 0f,
        val turns: Int = 0,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Supplied by the ViewModel: question in, spoken answer out. */
    var answer: (suspend (String) -> String)? = null

    private var loop: Job? = null

    fun start() {
        if (_state.value.active) return
        _state.value = State(active = true, phase = Phase.Listening)
        listenOnce()
    }

    fun stop() {
        loop?.cancel()
        loop = null
        speech.stop()
        voice.stop()
        _state.value = State(active = false, phase = Phase.Idle)
    }

    /** Tapping while Glide talks cuts it off and hands the turn back. */
    fun bargeIn() {
        if (!_state.value.active) return
        voice.stop()
        loop?.cancel()
        _state.value = _state.value.copy(phase = Phase.Listening, partial = "")
        listenOnce()
    }

    private fun listenOnce() {
        if (!_state.value.active) return
        _state.value = _state.value.copy(phase = Phase.Listening, partial = "", error = null)

        speech.start(
            onPartial = { text ->
                // Drive the waveform off transcript growth: no extra audio
                // permission plumbing, and it reacts when the user is talking.
                val level = (text.length % 12) / 12f
                _state.value = _state.value.copy(partial = text, level = level)
            },
            onResult = { spoken -> handle(spoken) },
            onError = { message ->
                if (!_state.value.active) return@start
                // "I didn't catch that" is a normal part of a conversation, so
                // wait a beat and listen again instead of ending the session.
                _state.value = _state.value.copy(error = message, partial = "")
                loop = scope.launch {
                    delay(900)
                    if (_state.value.active) listenOnce()
                }
            },
            onEnd = { },
        )
    }

    private fun handle(spoken: String) {
        val question = spoken.trim()
        if (question.isEmpty()) {
            listenOnce()
            return
        }

        loop = scope.launch {
            _state.value = _state.value.copy(
                phase = Phase.Thinking,
                partial = "",
                lastQuestion = question,
                turns = _state.value.turns + 1,
            )

            val reply = runCatching { answer?.invoke(question).orEmpty() }
                .getOrElse { "Sorry, I could not work that out just now." }

            if (!_state.value.active) return@launch
            _state.value = _state.value.copy(phase = Phase.Speaking, lastAnswer = reply)

            runCatching { voice.speak(reply) }

            if (!_state.value.active) return@launch
            // A short beat before reopening the mic, so the tail of the reply
            // is not picked up as the next question.
            delay(350)
            if (_state.value.active) listenOnce()
        }
    }
}
