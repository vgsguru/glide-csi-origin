package app.glide.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import app.glide.voice.ConversationController
import app.glide.ui.theme.GlideTheme
import kotlin.math.sin

/**
 * The assistant, reachable from every screen.
 *
 * Collapsed it is a single button; expanded it becomes a voice conversation
 * that keeps listening between turns. It floats above whatever screen is
 * showing, because a question about your money is rarely a reason to leave the
 * thing you were looking at.
 */
@Composable
fun FloatingAssistant(
    state: ConversationController.State,
    engineLabel: String,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onBargeIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GlideTheme.colors

    Box(modifier) {
        AnimatedContent(
            targetState = state.active,
            transitionSpec = {
                (fadeIn(tween(220)) + scaleIn(initialScale = 0.85f, animationSpec = tween(220)))
                    .togetherWith(fadeOut(tween(160)) + scaleOut(targetScale = 0.85f))
            },
            label = "assistant",
        ) { active ->
            if (!active) {
                CollapsedButton(onStart)
            } else {
                ConversationPanel(state, engineLabel, onStop, onBargeIn)
            }
        }
    }
}

@Composable
private fun CollapsedButton(onStart: () -> Unit) {
    val colors = GlideTheme.colors
    // A slow breathing pulse: present without demanding attention.
    val breathe = rememberInfiniteTransition(label = "breathe")
    val pulse by breathe.animateFloat(
        initialValue = 0.97f,
        targetValue = 1.03f,
        animationSpec = infiniteRepeatable(tween(2200, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulse",
    )

    Box(
        Modifier
            .scale(pulse)
            .size(58.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary)
            .clickable(onClick = onStart),
        contentAlignment = Alignment.Center,
    ) {
        // The Glide mark, not a generic mic: this is the app speaking, and the
        // dark variant is the one that reads on the light button.
        Image(
            painter = painterResource(app.glide.R.drawable.logo_mark_dark),
            contentDescription = "Talk to Glide",
            modifier = Modifier.size(26.dp),
        )
    }
}

@Composable
private fun ConversationPanel(
    state: ConversationController.State,
    engineLabel: String,
    onStop: () -> Unit,
    onBargeIn: () -> Unit,
) {
    val colors = GlideTheme.colors
    val shape = RoundedCornerShape(28.dp)

    val phaseLabel = when (state.phase) {
        ConversationController.Phase.Listening -> "Listening…"
        ConversationController.Phase.Thinking -> "Thinking…"
        ConversationController.Phase.Speaking -> "Speaking"
        ConversationController.Phase.Idle -> "Ready"
    }

    Column(
        Modifier
            .widthIn(max = 340.dp)
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        colors.glass.copy(alpha = colors.glass.alpha * 2.6f),
                        colors.glass.copy(alpha = colors.glass.alpha * 1.5f),
                    )
                )
            )
            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.90f))
            .border(1.dp, colors.glassBorder, shape)
            .padding(18.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GlideLogo(size = 18.dp)
                Spacer(Modifier.width(8.dp))
                Text(
                    phaseLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = when (state.phase) {
                        ConversationController.Phase.Listening -> colors.positive
                        ConversationController.Phase.Speaking -> colors.informational
                        else -> colors.muted
                    },
                )
            }
            Box(
                Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(colors.secondary)
                    .clickable(onClick = onStop),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "End conversation",
                    tint = colors.muted,
                    modifier = Modifier.size(15.dp),
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        // ── The waveform: the visual heart of the conversation ─────────────
        VoiceWave(
            phase = state.phase,
            level = state.level,
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { if (state.phase == ConversationController.Phase.Speaking) onBargeIn() },
        )

        Spacer(Modifier.height(14.dp))

        AnimatedContent(
            targetState = when {
                state.partial.isNotBlank() -> state.partial
                state.lastAnswer.isNotBlank() -> state.lastAnswer
                else -> "Ask me anything about your money."
            },
            transitionSpec = { fadeIn(tween(200)).togetherWith(fadeOut(tween(120))) },
            label = "transcript",
        ) { text ->
            Text(
                text,
                style = MaterialTheme.typography.bodyMedium,
                color = if (state.partial.isNotBlank()) {
                    MaterialTheme.colorScheme.onBackground
                } else colors.muted,
            )
        }

        if (state.phase == ConversationController.Phase.Speaking) {
            Spacer(Modifier.height(10.dp))
            Text(
                "Tap the wave to interrupt",
                style = MaterialTheme.typography.labelSmall,
                color = colors.muted,
            )
        }

        Spacer(Modifier.height(12.dp))
        Text(
            "$engineLabel · ${state.turns} turn${if (state.turns == 1) "" else "s"}",
            style = MaterialTheme.typography.labelSmall,
            color = colors.muted,
        )
    }
}

/**
 * A bar waveform that behaves differently per phase, so the state is legible
 * without reading the label: tall and reactive while listening, a travelling
 * ripple while speaking, a gentle shimmer while thinking.
 */
@Composable
private fun VoiceWave(
    phase: ConversationController.Phase,
    level: Float,
    modifier: Modifier = Modifier,
) {
    val colors = GlideTheme.colors
    val bars = 28

    val transition = rememberInfiniteTransition(label = "wave")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing)),
        label = "t",
    )

    val tint = when (phase) {
        ConversationController.Phase.Listening -> colors.positive
        ConversationController.Phase.Speaking -> colors.informational
        ConversationController.Phase.Thinking -> colors.warning
        else -> colors.muted
    }

    Row(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(bars) { index ->
            val phaseShift = index * 0.45f
            val amplitude = when (phase) {
                // Two layers: a travelling idle shimmer that runs even in
                // silence, plus voice level on top. Without the first layer the
                // bars sit dead flat while waiting, which reads as "broken".
                ConversationController.Phase.Listening -> {
                    val idle = 0.20f + 0.16f * sin(t * 1.6f + phaseShift)
                    idle + (0.64f * level) * (0.55f + 0.45f * sin(t * 2.4f + phaseShift))
                }
                // A pulse travelling outward from the centre.
                ConversationController.Phase.Speaking -> {
                    val centre = 1f - kotlin.math.abs(index - bars / 2f) / (bars / 2f)
                    0.18f + 0.82f * centre * (0.5f + 0.5f * sin(t * 2 + phaseShift))
                }
                ConversationController.Phase.Thinking ->
                    0.15f + 0.25f * (0.5f + 0.5f * sin(t * 1.4f + phaseShift))
                else -> 0.12f
            }.coerceIn(0.08f, 1f)

            val height by animateFloatAsState(
                targetValue = amplitude,
                animationSpec = spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessLow),
                label = "bar$index",
            )

            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight(height)
                    .clip(RoundedCornerShape(999.dp))
                    .background(tint.copy(alpha = 0.35f + 0.55f * height))
            )
        }
    }
}
