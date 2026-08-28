package app.glide.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.glide.R
import app.glide.ui.theme.GlideTheme
import app.glide.ui.theme.RadiusMedium
import java.text.NumberFormat
import java.util.Locale

/** Rs.12,345 — matching the web client's formatCurrency exactly. */
fun formatCurrency(value: Double, compact: Boolean = false): String {
    if (compact && kotlin.math.abs(value) >= 1000) {
        val thousands = value / 1000.0
        return "Rs." + if (kotlin.math.abs(value) >= 10000) {
            "${thousands.toInt()}K"
        } else {
            String.format(Locale.US, "%.1fK", thousands)
        }
    }
    val format = NumberFormat.getNumberInstance(Locale("en", "IN"))
    format.maximumFractionDigits = 0
    return "Rs.${format.format(value)}"
}

/**
 * The frosted panel used everywhere.
 *
 * Compose has no backdrop-filter, so the web build's blur is approximated with
 * a translucent white gradient over the dark ground plus a hairline border --
 * which is what actually reads as "glass" at these sizes.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: androidx.compose.ui.unit.Dp = RadiusMedium,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = GlideTheme.colors
    val shape = RoundedCornerShape(cornerRadius)

    Column(
        modifier = modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        colors.glass.copy(alpha = colors.glass.alpha * 1.8f),
                        colors.glass,
                    )
                )
            )
            .border(1.dp, colors.glassBorder, shape)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(18.dp),
        content = content,
    )
}

@Composable
fun SectionTitle(text: String, trailing: String? = null, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
        if (trailing != null) {
            Text(trailing, style = MaterialTheme.typography.bodySmall, color = GlideTheme.colors.muted)
        }
    }
}

@Composable
fun Label(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(Locale.getDefault()),
        style = MaterialTheme.typography.labelSmall,
        color = GlideTheme.colors.muted,
        modifier = modifier,
    )
}

/** Confidence is always visible — auto-captured data never passes as fact. */
@Composable
fun ConfidenceChip(value: Double, label: String = "confidence") {
    val pct = (value * 100).toInt()
    val colors = GlideTheme.colors
    val tint = when {
        pct >= 85 -> colors.positive
        pct >= 60 -> colors.warning
        else -> colors.muted
    }
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = 7.dp, vertical = 2.dp)
    ) {
        Text("$pct% $label", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = tint)
    }
}

@Composable
fun Pill(text: String, tint: Color = GlideTheme.colors.muted) {
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(text, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = tint)
    }
}

@Composable
fun GlideLogo(size: androidx.compose.ui.unit.Dp = 28.dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.logo_mark),
        contentDescription = "Glide",
        modifier = modifier.size(size),
    )
}

@Composable
fun GlideLockup(width: androidx.compose.ui.unit.Dp = 150.dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.logo_lockup),
        contentDescription = "Glide",
        modifier = modifier.width(width),
    )
}

/** A labelled bar, used for category breakdowns. */
@Composable
fun BarRow(
    label: String,
    value: String,
    fraction: Float,
    tint: Color = MaterialTheme.colorScheme.onBackground,
    caption: String? = null,
) {
    val colors = GlideTheme.colors
    val animated by animateFloatAsState(fraction.coerceIn(0f, 1f), label = "bar")

    Column(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Text(
                value + (caption?.let { " · $it" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }
        Spacer(Modifier.height(5.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(colors.secondary)
        ) {
            Box(
                Modifier
                    .fillMaxWidth(animated)
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(tint)
            )
        }
    }
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        GlideLogo(size = 34.dp)
        Spacer(Modifier.height(14.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(6.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = GlideTheme.colors.muted,
            modifier = Modifier.padding(horizontal = 24.dp),
        )
    }
}
