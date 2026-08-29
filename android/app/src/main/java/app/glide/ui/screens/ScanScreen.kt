package app.glide.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.glide.ScanState
import app.glide.data.CashPosition
import app.glide.ui.components.*
import app.glide.ui.theme.GlideTheme
import app.glide.ui.theme.RadiusLarge
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Bill capture.
 *
 * The draft is deliberately never committed automatically. OCR on a crumpled
 * receipt is the least reliable input this app has, so the figures land in
 * editable fields and the user confirms them -- the same "never treat a parse as
 * fact" rule the SMS pipeline follows, just made visible.
 */
@Composable
fun ScanScreen(
    scan: ScanState,
    cash: CashPosition,
    manualCount: Int,
    onPickImage: () -> Unit,
    onTakePhoto: () -> Unit,
    onAmountChange: (String) -> Unit,
    onMerchantChange: (String) -> Unit,
    onSave: () -> Unit,
    onDiscard: () -> Unit,
) {
    val colors = GlideTheme.colors
    val dateFormat = remember { SimpleDateFormat("d MMM yyyy", Locale.getDefault()) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.padding(start = 4.dp, bottom = 2.dp)) {
            Text(
                "Scan a bill",
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                "For cash spending your bank never sees.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }

        Surface(
            shape = RoundedCornerShape(RadiusLarge),
            color = colors.glass,
            border = androidx.compose.foundation.BorderStroke(1.dp, colors.glassBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Outlined.AccountBalanceWallet,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Money Bucket",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                }
                
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Unallocated Cash: ${formatCurrency(cash.unallocated)}",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        "When you withdraw cash, it sits here. Scanning cash bills automatically deducts from this pool.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                        lineHeight = 18.sp
                    )
                }
                
                if (cash.aged > 0) {
                    Text(
                        "Note: ${formatCurrency(cash.aged)} disappeared without logging and was flagged as Discretionary.",
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.warning
                    )
                }
                
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LinearProgressIndicator(
                        progress = { cash.reconciledShare.toFloat() },
                        modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = colors.border
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${formatCurrency(cash.allocated)} Logged", style = MaterialTheme.typography.labelSmall, color = colors.muted)
                        Text("${formatCurrency(cash.withdrawn)} Withdrawn", style = MaterialTheme.typography.labelSmall, color = colors.muted)
                    }
                }
            }
        }

        // ── Capture ───────────────────────────────────────────────────────
        GlassCard(Modifier.fillMaxWidth(), cornerRadius = RadiusLarge) {
            Text(
                "Text is read on this phone. The photo is never uploaded.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CaptureButton(
                    label = "Take photo",
                    icon = Icons.Outlined.PhotoCamera,
                    primary = true,
                    modifier = Modifier.weight(1f),
                    enabled = !scan.reading,
                    onClick = onTakePhoto,
                )
                CaptureButton(
                    label = "Choose image",
                    icon = Icons.Outlined.PhotoLibrary,
                    primary = false,
                    modifier = Modifier.weight(1f),
                    enabled = !scan.reading,
                    onClick = onPickImage,
                )
            }

            if (scan.reading) {
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(15.dp),
                        color = colors.muted,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "reading the bill…",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                }
            }

            if (scan.error != null) {
                Spacer(Modifier.height(12.dp))
                Text(scan.error, style = MaterialTheme.typography.bodySmall, color = colors.negative)
            }
        }

        // ── Editable draft ────────────────────────────────────────────────
        AnimatedVisibility(
            visible = scan.draft != null,
            enter = fadeIn() + slideInVertically { it / 4 },
        ) {
            val draft = scan.draft
            if (draft != null) {
                GlassCard(Modifier.fillMaxWidth(), cornerRadius = RadiusLarge) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Check before saving",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                        ConfidenceChip(draft.confidence, label = "read")
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (draft.amountLabel != null) {
                            "Found a line labelled \"${draft.amountLabel}\"."
                        } else {
                            "No total was labelled, so this is the largest figure on the bill — " +
                                "worth a second look."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )

                    Spacer(Modifier.height(16.dp))
                    Label("Amount")
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Rs.", style = MaterialTheme.typography.titleLarge, color = colors.muted)
                        Spacer(Modifier.width(8.dp))
                        EditField(
                            value = scan.amountText,
                            onChange = onAmountChange,
                            numeric = true,
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Spacer(Modifier.height(14.dp))
                    Label("Merchant")
                    Spacer(Modifier.height(6.dp))
                    EditField(
                        value = scan.merchantText,
                        onChange = onMerchantChange,
                        numeric = false,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Category", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        Text(
                            draft.category,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Date", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        Text(
                            dateFormat.format(Date(draft.occurredAt)),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }

                    Spacer(Modifier.height(18.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CaptureButton(
                            label = "Save to ledger",
                            icon = null,
                            primary = true,
                            modifier = Modifier.weight(1f),
                            enabled = scan.amountText.toDoubleOrNull()?.let { it > 0 } == true,
                            onClick = onSave,
                        )
                        CaptureButton(
                            label = "Discard",
                            icon = null,
                            primary = false,
                            modifier = Modifier.weight(1f),
                            enabled = true,
                            onClick = onDiscard,
                        )
                    }
                }
            }
        }

        // ── What OCR has contributed ──────────────────────────────────────
        GlassCard(Modifier.fillMaxWidth()) {
            SectionTitle("Scanned bills")
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "In your ledger",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
                Text(
                    manualCount.toString(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "Scanned bills sit alongside your SMS transactions and count toward " +
                    "the same totals and categories.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }
    }
}

@Composable
private fun EditField(
    value: String,
    onChange: (String) -> Unit,
    numeric: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = GlideTheme.colors
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(colors.secondary.copy(alpha = 0.6f))
            .padding(horizontal = 14.dp, vertical = 13.dp)
    ) {
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (numeric) KeyboardType.Number else KeyboardType.Text,
            ),
            textStyle = MaterialTheme.typography.titleMedium.copy(
                color = MaterialTheme.colorScheme.onBackground,
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.onBackground),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun CaptureButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    primary: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val colors = GlideTheme.colors
    Box(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    !enabled -> colors.secondary.copy(alpha = 0.5f)
                    primary -> MaterialTheme.colorScheme.primary
                    else -> colors.secondary
                }
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = if (primary && enabled) {
                        MaterialTheme.colorScheme.onPrimary
                    } else colors.muted,
                    modifier = Modifier.size(17.dp),
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = when {
                    !enabled -> colors.muted
                    primary -> MaterialTheme.colorScheme.onPrimary
                    else -> MaterialTheme.colorScheme.onBackground
                },
            )
        }
    }
}
