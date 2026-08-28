package app.glide.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.TrendingDown
import androidx.compose.material.icons.outlined.TrendingUp
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.glide.data.SmsAnalysis
import app.glide.ui.components.*
import app.glide.ui.theme.GlideTheme
import app.glide.ui.theme.RadiusLarge
import kotlin.math.abs

private data class LocalInsight(
    val title: String,
    val body: String,
    val reasoning: String,
    val icon: ImageVector,
    val tint: Color,
    val kind: String,
)

/**
 * On-device insights.
 *
 * These are computed from the phone's own analysis rather than fetched, so the
 * screen still says something useful with no backend connection. The reasoning
 * line is always shown -- same contract as the web AgentCard.
 */
@Composable
fun InsightsScreen(analysis: SmsAnalysis, bufferFloor: Double) {
    val colors = GlideTheme.colors
    val insights = buildInsights(analysis, bufferFloor, colors)

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(Modifier.padding(start = 4.dp, bottom = 4.dp)) {
                Text(
                    "Insights",
                    style = MaterialTheme.typography.displayMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    "Computed on-device from your last ${analysis.windowDays} days.",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            }
        }

        if (insights.isEmpty()) {
            item {
                GlassCard(Modifier.fillMaxWidth(), cornerRadius = RadiusLarge) {
                    EmptyState(
                        title = "Nothing needs your attention",
                        body = "No risk or opportunity stood out in this window.",
                    )
                }
            }
        }

        items(insights) { insight ->
            GlassCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.Top) {
                    Box(
                        Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(insight.tint.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(insight.icon, null, tint = insight.tint, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(13.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                insight.title,
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onBackground,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                            Spacer(Modifier.width(8.dp))
                            Pill(insight.kind.uppercase(), insight.tint)
                        }
                        Spacer(Modifier.height(5.dp))
                        Text(insight.body, style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                        Spacer(Modifier.height(9.dp))
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(colors.secondary.copy(alpha = 0.55f))
                                .padding(horizontal = 10.dp, vertical = 7.dp)
                        ) {
                            Text(
                                insight.reasoning,
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.muted,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun buildInsights(
    analysis: SmsAnalysis,
    bufferFloor: Double,
    colors: app.glide.ui.theme.GlideColors,
): List<LocalInsight> {
    if (analysis.parsed == 0) return emptyList()
    val insights = ArrayList<LocalInsight>()

    // --- outspending income ------------------------------------------------
    if (analysis.net < 0) {
        insights.add(
            LocalInsight(
                title = "You spent more than you received",
                body = "Over ${analysis.windowDays} days, ${formatCurrency(analysis.totalOut)} went out " +
                    "against ${formatCurrency(analysis.totalIn)} in — a gap of ${formatCurrency(abs(analysis.net))}.",
                reasoning = "total debits ${formatCurrency(analysis.totalOut)} − total credits " +
                    "${formatCurrency(analysis.totalIn)} = ${formatCurrency(analysis.net)}",
                icon = Icons.Outlined.TrendingDown,
                tint = colors.negative,
                kind = "risk",
            )
        )
    } else if (analysis.net > bufferFloor) {
        insights.add(
            LocalInsight(
                title = "${formatCurrency(analysis.net - bufferFloor)} above your floor",
                body = "You finished the period ${formatCurrency(analysis.net)} ahead. Beyond your " +
                    "${formatCurrency(bufferFloor)} buffer, that surplus could go to a goal.",
                reasoning = "net ${formatCurrency(analysis.net)} − floor ${formatCurrency(bufferFloor)}",
                icon = Icons.Outlined.TrendingUp,
                tint = colors.positive,
                kind = "opportunity",
            )
        )
    }

    // --- category concentration -------------------------------------------
    analysis.categories.firstOrNull { !it.essential && it.share >= 0.30 }?.let { category ->
        insights.add(
            LocalInsight(
                title = "${category.category} is ${(category.share * 100).toInt()}% of your spending",
                body = "${formatCurrency(category.amount)} across ${category.count} transactions. " +
                    "Trimming a quarter frees about ${formatCurrency(category.amount * 0.25)}.",
                reasoning = "${category.category} ${formatCurrency(category.amount)} of " +
                    "${formatCurrency(analysis.totalOut)} total debits",
                icon = Icons.Outlined.WarningAmber,
                tint = colors.warning,
                kind = "risk",
            )
        )
    }

    // --- imminent obligations ---------------------------------------------
    analysis.obligations.firstOrNull { it.daysUntil in 0..5 }?.let { obligation ->
        insights.add(
            LocalInsight(
                title = "${obligation.name} due in ${obligation.daysUntil} day" +
                    if (obligation.daysUntil == 1) "" else "s",
                body = "About ${formatCurrency(obligation.expectedAmount)}, based on " +
                    "${obligation.occurrences} previous payments roughly every ${obligation.cadenceDays} days.",
                reasoning = "discovered from repeats at ${(obligation.confidence * 100).toInt()}% confidence",
                icon = Icons.Outlined.CalendarMonth,
                tint = colors.informational,
                kind = "information",
            )
        )
    }

    // --- burn rate ---------------------------------------------------------
    if (analysis.income.p50 > 0) {
        val monthlyBurn = analysis.dailyRunRate * 30
        if (monthlyBurn > analysis.income.p50 * 1.05) {
            insights.add(
                LocalInsight(
                    title = "Spending faster than you earn",
                    body = "Your ${formatCurrency(analysis.dailyRunRate)}/day pace works out to " +
                        "${formatCurrency(monthlyBurn)} a month, against typical income of " +
                        "${formatCurrency(analysis.income.p50)}.",
                    reasoning = "run-rate ${formatCurrency(analysis.dailyRunRate)}/day × 30 vs income p50",
                    icon = Icons.Outlined.TrendingDown,
                    tint = colors.warning,
                    kind = "risk",
                )
            )
        }
    }

    // --- capture quality ---------------------------------------------------
    if (analysis.lowConfidenceCount > 0) {
        insights.add(
            LocalInsight(
                title = "${analysis.lowConfidenceCount} transaction" +
                    (if (analysis.lowConfidenceCount == 1) "" else "s") + " parsed with low confidence",
                body = "These were extracted from messages that did not carry every signal Glide " +
                    "looks for, so treat their amounts as approximate.",
                reasoning = "average confidence ${(analysis.averageConfidence * 100).toInt()}% across " +
                    "${analysis.parsed} parsed messages",
                icon = Icons.Outlined.WarningAmber,
                tint = colors.muted,
                kind = "information",
            )
        )
    }

    return insights
}
