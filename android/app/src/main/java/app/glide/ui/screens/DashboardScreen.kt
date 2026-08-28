package app.glide.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.glide.data.SmsAnalysis
import app.glide.ui.components.*
import app.glide.ui.theme.GlideTheme
import app.glide.ui.theme.RadiusLarge
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

/**
 * The Android home screen: one month of SMS, segregated.
 *
 * Everything here is computed on-device from the inbox, so it is populated
 * before the backend is ever contacted.
 */
@Composable
fun DashboardScreen(
    analysis: SmsAnalysis,
    scanning: Boolean,
    bufferFloor: Double,
    onRescan: () -> Unit,
) {
    val colors = GlideTheme.colors
    val safeToSpend = max(analysis.net - bufferFloor, 0.0)
    val dateFormat = remember { SimpleDateFormat("d MMM", Locale.getDefault()) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // ── Header ────────────────────────────────────────────────────────
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        GlideLogo(size = 22.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Last ${analysis.windowDays} days",
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.muted,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Financial State",
                        style = MaterialTheme.typography.displayMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "${analysis.parsed} transactions from ${analysis.messagesScanned} messages",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                }
                IconButton(onClick = onRescan, enabled = !scanning) {
                    if (scanning) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    } else {
                        Icon(Icons.Outlined.Refresh, "Rescan inbox", tint = MaterialTheme.colorScheme.onBackground)
                    }
                }
            }
        }

        if (analysis.parsed == 0) {
            item {
                GlassCard(Modifier.fillMaxWidth(), cornerRadius = RadiusLarge) {
                    EmptyState(
                        title = if (scanning) "Reading your inbox…" else "No bank alerts found",
                        body = if (scanning) {
                            "Parsing the last ${analysis.windowDays} days."
                        } else {
                            "Glide scanned ${analysis.messagesScanned} messages but found no bank or " +
                                "UPI transaction alerts in this window."
                        },
                    )
                }
            }
            return@LazyColumn
        }

        // ── Net position hero ─────────────────────────────────────────────
        item {
            GlassCard(Modifier.fillMaxWidth(), cornerRadius = RadiusLarge) {
                Label("Net this period")
                Spacer(Modifier.height(10.dp))
                Text(
                    formatCurrency(analysis.net),
                    style = MaterialTheme.typography.displayLarge,
                    color = if (analysis.net >= 0) MaterialTheme.colorScheme.onBackground else colors.negative,
                )
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FlowStat("In", analysis.totalIn, colors.positive, Modifier.weight(1f))
                    FlowStat("Out", analysis.totalOut, colors.negative, Modifier.weight(1f))
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Above your ${formatCurrency(bufferFloor)} floor, that leaves " +
                        "${formatCurrency(safeToSpend)} of room.",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            }
        }

        // ── Income band ───────────────────────────────────────────────────
        item {
            GlassCard(Modifier.fillMaxWidth()) {
                Label("Income, as a range")
                Spacer(Modifier.height(8.dp))
                Text(
                    "${formatCurrency(analysis.income.p10, true)} – ${formatCurrency(analysis.income.p90, true)}",
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "Typical ${formatCurrency(analysis.income.p50)} · ${analysis.income.stability}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(colors.secondary)
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(0.62f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f))
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Basis: ${analysis.income.basis}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            }
        }

        // ── Category segregation ──────────────────────────────────────────
        item {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionTitle("Where it went", formatCurrency(analysis.totalOut))
                Spacer(Modifier.height(12.dp))
                val maxAmount = analysis.categories.maxOfOrNull { it.amount } ?: 1.0
                analysis.categories.take(7).forEach { category ->
                    BarRow(
                        label = category.category + if (category.essential) "  ·  essential" else "",
                        value = formatCurrency(category.amount),
                        fraction = (category.amount / maxAmount).toFloat(),
                        tint = if (category.essential) {
                            MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
                        } else {
                            MaterialTheme.colorScheme.onBackground
                        },
                        caption = "${(category.share * 100).toInt()}%",
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MiniStat("Discretionary", formatCurrency(analysis.discretionary), Modifier.weight(1f))
                    MiniStat("Essential", formatCurrency(analysis.essential), Modifier.weight(1f))
                }
            }
        }

        // ── Discovered obligations ────────────────────────────────────────
        if (analysis.obligations.isNotEmpty()) {
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionTitle("Recurring payments")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "Learned from repeats in your inbox — nothing configured.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                    Spacer(Modifier.height(12.dp))
                    analysis.obligations.take(6).forEach { obligation ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    obligation.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(3.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    ConfidenceChip(obligation.confidence)
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        "every ${obligation.cadenceDays}d · seen ${obligation.occurrences}×",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = colors.muted,
                                    )
                                }
                            }
                            Text(
                                formatCurrency(obligation.expectedAmount),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                        }
                    }
                }
            }
        }

        // ── Top merchants ─────────────────────────────────────────────────
        if (analysis.topMerchants.isNotEmpty()) {
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionTitle("Top merchants")
                    Spacer(Modifier.height(10.dp))
                    val maxAmount = analysis.topMerchants.maxOfOrNull { it.amount } ?: 1.0
                    analysis.topMerchants.take(5).forEach { merchant ->
                        BarRow(
                            label = merchant.merchant,
                            value = formatCurrency(merchant.amount),
                            fraction = (merchant.amount / maxAmount).toFloat(),
                            caption = "${merchant.count}×",
                        )
                    }
                }
            }
        }

        // ── Parse quality ─────────────────────────────────────────────────
        item {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionTitle("Capture quality")
                Spacer(Modifier.height(10.dp))
                QualityRow("Messages scanned", analysis.messagesScanned.toString())
                QualityRow("Parsed as transactions", analysis.parsed.toString())
                QualityRow("Rejected (promo, OTP, failed)", analysis.rejected.toString())
                QualityRow("Average confidence", "${(analysis.averageConfidence * 100).toInt()}%")
                QualityRow("Below 85% confidence", analysis.lowConfidenceCount.toString())
            }
        }

        // ── Transactions ──────────────────────────────────────────────────
        item {
            Text(
                "Transactions",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp),
            )
        }

        items(analysis.transactions.take(60)) { txn ->
            GlassCard(Modifier.fillMaxWidth(), cornerRadius = 18.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(34.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(
                                if (txn.isCredit) colors.positive.copy(alpha = 0.12f) else colors.secondary
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (txn.isCredit) Icons.Outlined.ArrowDownward else Icons.Outlined.ArrowUpward,
                            contentDescription = null,
                            tint = if (txn.isCredit) colors.positive else MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            txn.merchant,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "${txn.category} · ${dateFormat.format(Date(txn.occurredAt))} · ${txn.channel}",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            (if (txn.isCredit) "+" else "−") + formatCurrency(txn.amount),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (txn.isCredit) colors.positive else MaterialTheme.colorScheme.onBackground,
                        )
                        if (txn.confidence < 0.85) {
                            Spacer(Modifier.height(3.dp))
                            ConfidenceChip(txn.confidence, label = "sure")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FlowStat(label: String, amount: Double, tint: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    val colors = GlideTheme.colors
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(colors.secondary.copy(alpha = 0.5f))
            .padding(12.dp)
    ) {
        Label(label)
        Spacer(Modifier.height(4.dp))
        Text(formatCurrency(amount), style = MaterialTheme.typography.titleLarge, color = tint)
    }
}

@Composable
private fun MiniStat(label: String, value: String, modifier: Modifier = Modifier) {
    val colors = GlideTheme.colors
    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(colors.secondary.copy(alpha = 0.5f))
            .padding(11.dp)
    ) {
        Label(label)
        Spacer(Modifier.height(3.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
    }
}

@Composable
private fun QualityRow(label: String, value: String) {
    val colors = GlideTheme.colors
    Row(
        Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = colors.muted)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
    }
}
