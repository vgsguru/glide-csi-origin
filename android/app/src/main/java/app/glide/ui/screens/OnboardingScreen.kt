package app.glide.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.glide.ui.components.GlassCard
import app.glide.ui.components.GlideLockup
import app.glide.ui.theme.GlideTheme

/**
 * Three questions before the first read.
 *
 * Only what actually changes the numbers: how far back to look, the floor to
 * protect, and permission to read the alerts. Everything else the app works out
 * for itself, which is the point.
 */
@Composable
fun OnboardingScreen(
    windowDays: Int,
    bufferFloor: Double,
    onWindowDaysChange: (Int) -> Unit,
    onBufferFloorChange: (Double) -> Unit,
    onFinish: () -> Unit,
) {
    val colors = GlideTheme.colors
    var step by remember { mutableStateOf(0) }
    var floorDraft by remember(bufferFloor) { mutableStateOf(bufferFloor.toInt().toString()) }
    val steps = 3

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))
        GlideLockup(width = 140.dp)
        Spacer(Modifier.height(22.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(steps) { index ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(3.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (index <= step) MaterialTheme.colorScheme.primary else colors.secondary
                        )
                )
            }
        }
        Spacer(Modifier.height(28.dp))

        AnimatedContent(
            targetState = step,
            transitionSpec = {
                (fadeIn(tween(240)) + slideInHorizontally { it / 4 })
                    .togetherWith(fadeOut(tween(160)) + slideOutHorizontally { -it / 4 })
            },
            label = "step",
        ) { current ->
            when (current) {
                0 -> GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        "How Glide works",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Your bank already texts you every time money moves. Glide reads those " +
                            "alerts on this phone, works out what is spending, what repeats, and " +
                            "what is safe to spend — without you typing a thing.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.muted,
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "Nothing is uploaded. Parsing happens here, on the device.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.positive,
                    )
                }

                1 -> GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        "How far back should I read?",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "This sets the totals you see. Recurring payments are always detected " +
                            "over a longer span, so a monthly bill is not missed.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(7, 30, 60, 90).forEach { days ->
                            val selected = days == windowDays
                            Box(
                                Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(
                                        if (selected) MaterialTheme.colorScheme.primary
                                        else colors.secondary
                                    )
                                    .clickable { onWindowDaysChange(days) }
                                    .padding(vertical = 12.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "${days}d",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = if (selected) MaterialTheme.colorScheme.onPrimary
                                    else colors.muted,
                                )
                            }
                        }
                    }
                }

                else -> GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        "Your safety floor",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "The amount you never want to drop below. Everything Glide calls " +
                            "\"safe to spend\" sits above this line.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Rs.", style = MaterialTheme.typography.titleLarge, color = colors.muted)
                        Spacer(Modifier.width(8.dp))
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(colors.secondary.copy(alpha = 0.6f))
                                .padding(horizontal = 14.dp, vertical = 13.dp)
                        ) {
                            BasicTextField(
                                value = floorDraft,
                                onValueChange = { value ->
                                    floorDraft = value.filter { it.isDigit() }
                                    floorDraft.toDoubleOrNull()?.let(onBufferFloorChange)
                                },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                textStyle = MaterialTheme.typography.titleLarge.copy(
                                    color = MaterialTheme.colorScheme.onBackground,
                                ),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.onBackground),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(5000, 10000, 20000).forEach { preset ->
                            Box(
                                Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(colors.secondary)
                                    .clickable {
                                        floorDraft = preset.toString()
                                        onBufferFloorChange(preset.toDouble())
                                    }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "Rs.$preset",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = colors.muted,
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (step > 0) {
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(999.dp))
                        .background(colors.secondary)
                        .clickable { step-- }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Back", style = MaterialTheme.typography.labelLarge, color = colors.muted)
                }
            }
            Box(
                Modifier
                    .weight(if (step > 0) 1.6f else 1f)
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable { if (step < steps - 1) step++ else onFinish() }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (step < steps - 1) "Continue" else "Read my messages",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}
