package app.glide.ui.screens

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.glide.AuthState
import app.glide.VoiceStatus
import app.glide.data.SmsAnalysis
import app.glide.ui.components.*
import app.glide.ui.theme.GlideTheme

/**
 * Settings the person actually owns: how far back to read, the floor they never
 * want to cross, and whether answers are spoken.
 *
 * Connection plumbing -- API keys, backend URL, sync state, auth ids -- used to
 * live here. That was developer scaffolding, not settings, and it made the
 * screen read like a debug console. The app now picks its own engine and simply
 * reports which one it landed on, which is the only part a user needs.
 */
@Composable
fun ProfileScreen(
    analysis: SmsAnalysis,
    auth: AuthState,
    cloudSynced: Boolean,
    voice: VoiceStatus,
    engineLabel: String,
    bufferFloor: Double,
    windowDays: Int,
    onBufferFloorChange: (Double) -> Unit,
    onWindowDaysChange: (Int) -> Unit,
    onVoiceEnabledChange: (Boolean) -> Unit,
    onPreviewVoice: () -> Unit,
    onSignOut: () -> Unit,
) {
    val colors = GlideTheme.colors
    var floorDraft by remember(bufferFloor) { mutableStateOf(bufferFloor.toInt().toString()) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.padding(start = 4.dp, bottom = 2.dp)) {
            Text(
                "Settings",
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                "How far back Glide reads, and the floor it protects.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }

        // ── Account ───────────────────────────────────────────────────────
        GlassCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(colors.secondary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        (auth.name ?: auth.email ?: "G").take(1).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        auth.name ?: if (auth.guest) "Guest" else "Signed in",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        auth.email ?: "Using Glide without an account",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            StatusRow("Account", if (auth.guest) "guest" else "email", colors.muted)
            StatusRow("Ledger", "${analysis.parsed} transactions", colors.muted)

            Spacer(Modifier.height(14.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.negative.copy(alpha = 0.12f))
                    .clickable(onClick = onSignOut)
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (auth.guest) "Sign in to an account" else "Sign out",
                    style = MaterialTheme.typography.labelLarge,
                    color = colors.negative,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Signing out clears your account from this phone. Your settings and " +
                    "scanned bills stay; your messages were never uploaded.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }

        // ── Safety floor ──────────────────────────────────────────────────
        GlassCard(Modifier.fillMaxWidth()) {
            SectionTitle("Safety floor")
            Spacer(Modifier.height(4.dp))
            Text(
                "The amount you never want to drop below. Safe-to-spend is measured above this line.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
            Spacer(Modifier.height(14.dp))
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
        }

        // ── Capture window ────────────────────────────────────────────────
        GlassCard(Modifier.fillMaxWidth()) {
            SectionTitle("Capture window")
            Spacer(Modifier.height(4.dp))
            Text(
                "How far back Glide reads your inbox.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(7, 30, 60, 90).forEach { days ->
                    val selected = days == windowDays
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(999.dp))
                            .background(
                                if (selected) MaterialTheme.colorScheme.primary else colors.secondary
                            )
                            .clickable { onWindowDaysChange(days) }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "${days}d",
                            style = MaterialTheme.typography.labelLarge,
                            color = if (selected) MaterialTheme.colorScheme.onPrimary else colors.muted,
                        )
                    }
                }
            }
        }

        // ── Voice ─────────────────────────────────────────────────────────
        GlassCard(Modifier.fillMaxWidth()) {
            SectionTitle("Voice")
            Spacer(Modifier.height(4.dp))
            Text(
                "Answers can be spoken aloud. Speech input uses your phone's own " +
                    "recogniser, so no audio is uploaded.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { onVoiceEnabledChange(!voice.autoSpeak) }
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Speak answers aloud",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "Every reply is read out as it arrives.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                }
                Switch(checked = voice.autoSpeak, onCheckedChange = onVoiceEnabledChange)
            }
            Spacer(Modifier.height(10.dp))
            SecondaryButton("Hear a sample", Modifier.fillMaxWidth(), onClick = onPreviewVoice)
        }

        // ── What is running, in one line ──────────────────────────────────
        GlassCard(Modifier.fillMaxWidth()) {
            SectionTitle("On this device")
            Spacer(Modifier.height(12.dp))
            StatusRow("Messages scanned", analysis.messagesScanned.toString())
            StatusRow("Transactions found", analysis.parsed.toString())
            StatusRow("Ignored as promo or OTP", analysis.rejected.toString())
            StatusRow("Recurring payments", analysis.obligations.size.toString())
            StatusRow("Assistant", engineLabel, colors.positive)
            // Whether the headset can see these figures. Not dev trivia: it is
            // the difference between the Quest showing your money and showing
            // nothing at all.
            StatusRow(
                "Visible on your headset",
                if (cloudSynced) "yes" else "not yet",
                if (cloudSynced) colors.positive else colors.muted,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Your messages are read and categorised on this phone. Nothing is " +
                    "uploaded unless you ask a question.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }

        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            GlideLockup(width = 108.dp)
        }
    }
}

@Composable
private fun StatusRow(label: String, value: String, tint: Color? = null) {
    val colors = GlideTheme.colors
    Row(
        Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = colors.muted)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = tint ?: MaterialTheme.colorScheme.onBackground,
        )
    }
}

@Composable
private fun SecondaryButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = GlideTheme.colors
    Box(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(colors.secondary)
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onBackground)
    }
}
