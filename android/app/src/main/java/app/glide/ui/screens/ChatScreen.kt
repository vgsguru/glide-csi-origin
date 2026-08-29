package app.glide.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import app.glide.BackendStatus
import app.glide.VoiceStatus
import app.glide.data.ChatTurn
import app.glide.ui.components.GlassCard
import app.glide.ui.components.GlideLogo
import app.glide.ui.components.Label
import app.glide.ui.theme.GlideTheme

/**
 * The flagship screen: conversation grounded in real numbers.
 *
 * Answers come from the backend, which runs gemma4:12b locally and passes
 * every generated figure through a numeral guard before it is shown here.
 */
@Composable
fun ChatScreen(
    messages: List<ChatTurn>,
    suggestions: List<String>,
    busy: Boolean,
    backend: BackendStatus,
    engineLabel: String,
    voice: VoiceStatus,
    listening: Boolean,
    partialSpeech: String,
    onSend: (String) -> Unit,
    onSpeak: (String) -> Unit,
    onStopSpeaking: () -> Unit,
    onStartListening: () -> Unit,
    onStopListening: () -> Unit,
) {
    val colors = GlideTheme.colors
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size, busy) {
        // An empty transcript still renders one item (the placeholder), and the
        // typing row adds another. Scroll to the last valid index, never past it.
        val itemCount = (if (messages.isEmpty()) 1 else messages.size) + if (busy) 1 else 0
        listState.animateScrollToItem((itemCount - 1).coerceAtLeast(0))
    }

    Column(Modifier.fillMaxSize()) {

        // ── Header ────────────────────────────────────────────────────────
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 22.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text("Chat", style = MaterialTheme.typography.displayMedium, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "Grounded in your live numbers",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            }
            Row(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.secondary)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val engineTint =
                    if (engineLabel == "on-device") colors.informational else colors.positive
                Box(
                    Modifier
                        .size(6.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(engineTint)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    engineLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.muted,
                )
            }
        }

        // ── Transcript ────────────────────────────────────────────────────
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (messages.isEmpty()) {
                item {
                    Column(
                        Modifier.fillMaxWidth().padding(top = 60.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        GlideLogo(size = 40.dp)
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Ask about your money",
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (backend.reachable) {
                                "Every answer shows the figures behind it."
                            } else {
                                "Connect to your Glide backend in Profile to start chatting."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.muted,
                            modifier = Modifier.padding(horizontal = 30.dp),
                        )
                    }
                }
            }

            itemsIndexed(messages) { index, turn ->
                // Each turn eases in from its own side; the newest one animates,
                // older ones are already settled so scrolling stays still.
                val appeared = remember(index) { MutableTransitionState(false).apply { targetState = true } }
                AnimatedVisibility(
                    visibleState = appeared,
                    enter = fadeIn(animationSpec = tween(260)) +
                        slideInVertically(
                            animationSpec = spring(
                                dampingRatio = Spring.DampingRatioLowBouncy,
                                stiffness = Spring.StiffnessMediumLow,
                            ),
                            initialOffsetY = { it / 3 },
                        ) +
                        scaleIn(initialScale = 0.94f, animationSpec = tween(260)),
                ) {
                    MessageBubble(turn, onSpeak)
                }
            }

            if (listening && partialSpeech.isNotBlank()) {
                item {
                    GlassCard(Modifier.fillMaxWidth(), cornerRadius = 20.dp) {
                        Label("Listening")
                        Spacer(Modifier.height(6.dp))
                        Text(
                            partialSpeech,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                }
            }

            if (busy) {
                item {
                    GlassCard(Modifier.fillMaxWidth(0.7f), cornerRadius = 20.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(14.dp),
                                color = colors.muted,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "reasoning over your state…",
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.muted,
                            )
                        }
                    }
                }
            }
        }

        // ── Suggestion chips, generated from live state ───────────────────
        if (suggestions.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 10.dp),
            ) {
                items(suggestions) { chip ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(colors.glass)
                            .border(1.dp, colors.glassBorder, RoundedCornerShape(999.dp))
                            .clickable(enabled = !busy) { onSend(chip) }
                            .padding(horizontal = 14.dp, vertical = 9.dp)
                    ) {
                        Text(chip, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onBackground)
                    }
                }
            }
        }

        // ── Composer ──────────────────────────────────────────────────────
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, bottom = 96.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.glass)
                    .border(1.dp, colors.glassBorder, RoundedCornerShape(999.dp))
                    .padding(horizontal = 18.dp, vertical = 14.dp)
            ) {
                if (input.isEmpty()) {
                    Text(
                        "Can I afford this?",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.muted,
                    )
                }
                BasicTextField(
                    value = input,
                    onValueChange = { input = it },
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.onBackground),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(
                    if (listening) MaterialTheme.colorScheme.error
                    else if (input.isNotBlank() && !busy) MaterialTheme.colorScheme.primary
                    else colors.secondary
                )
                .clickable(enabled = !busy || listening) {
                    if (listening) {
                        onStopListening()
                    } else if (input.isNotBlank()) {
                        onSend(input)
                        input = ""
                    } else {
                        onStartListening()
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (listening) Icons.Filled.Stop
                else if (input.isNotBlank()) Icons.AutoMirrored.Filled.Send
                else Icons.Filled.Mic,
                contentDescription = if (listening) "Stop" else if (input.isNotBlank()) "Send" else "Mic",
                tint = if (listening) MaterialTheme.colorScheme.onError
                       else if (input.isBlank() || busy) colors.muted 
                       else MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(if (input.isNotBlank() && !listening) 19.dp else 24.dp),
            )
        }
    }
    }
}

@Composable
private fun MessageBubble(turn: ChatTurn, onSpeak: (String) -> Unit) {
    val colors = GlideTheme.colors
    val isUser = turn.role == "user"

    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Box(
            Modifier
                .widthIn(max = 320.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 20.dp, topEnd = 20.dp,
                        bottomStart = if (isUser) 20.dp else 6.dp,
                        bottomEnd = if (isUser) 6.dp else 20.dp,
                    )
                )
                .background(
                    when {
                        isUser -> MaterialTheme.colorScheme.primary
                        turn.failed -> colors.negative.copy(alpha = 0.12f)
                        else -> colors.glass
                    }
                )
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Text(
                turn.content,
                style = MaterialTheme.typography.bodyMedium,
                color = when {
                    isUser -> MaterialTheme.colorScheme.onPrimary
                    turn.failed -> colors.negative
                    else -> MaterialTheme.colorScheme.onBackground
                },
            )
        }

        // Read this answer aloud.
        if (!isUser && !turn.failed) {
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .clickable { onSpeak(turn.content) }
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Outlined.VolumeUp,
                    contentDescription = "Read aloud",
                    tint = colors.muted,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text("Listen", style = MaterialTheme.typography.labelSmall, color = colors.muted)
            }
        }

        // The figures the answer was built from.
        if (!isUser && turn.grounding.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            GlassCard(Modifier.widthIn(max = 320.dp), cornerRadius = 16.dp) {
                Label("Based on")
                Spacer(Modifier.height(7.dp))
                turn.grounding.forEach { (label, value) ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(label, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        Text(
                            value,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                }
                if (turn.snapshotRef != null) {
                    Spacer(Modifier.height(7.dp))
                    Text(
                        "Snapshot ${turn.snapshotRef} · ${turn.engine ?: "rules"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.muted,
                    )
                }
            }
        }
    }
}
