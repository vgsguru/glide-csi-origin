package app.glide.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Person
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import app.glide.Screen
import app.glide.ui.theme.GlideTheme

private data class NavItem(val screen: Screen, val label: String, val icon: ImageVector)

private val ITEMS = listOf(
    NavItem(Screen.Dashboard, "Dashboard", Icons.Outlined.GridView),
    NavItem(Screen.Chat, "Chat", Icons.Outlined.ChatBubbleOutline),
    NavItem(Screen.Scan, "Scan", Icons.Outlined.DocumentScanner),
    NavItem(Screen.Insights, "Insights", Icons.Filled.AutoAwesome),
    NavItem(Screen.Profile, "Profile", Icons.Outlined.Person),
)

/**
 * The floating glass pill, mirroring the web app's LiquidGlassNav — including
 * the spring-animated chip that slides behind the active item.
 */
@Composable
fun GlassNav(
    current: Screen,
    onSelect: (Screen) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GlideTheme.colors
    val shape = RoundedCornerShape(999.dp)

    val itemWidth = 56.dp
    val activeIndex = ITEMS.indexOfFirst { it.screen == current }.coerceAtLeast(0)
    val chipOffset by animateDpAsState(
        targetValue = itemWidth * activeIndex,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
        label = "chip",
    )

    Box(modifier = modifier.padding(bottom = 20.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .clip(shape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            colors.glass.copy(alpha = colors.glass.alpha * 2.4f),
                            colors.glass.copy(alpha = colors.glass.alpha * 1.4f),
                        )
                    )
                )
                .background(MaterialTheme.colorScheme.background.copy(alpha = 0.82f))
                .border(1.dp, colors.glassBorder, shape)
                .padding(5.dp)
        ) {
            Box {
                // Active chip slides behind the selected icon.
                Box(
                    Modifier
                        .offset(x = chipOffset)
                        .width(itemWidth)
                        .height(46.dp)
                        .clip(shape)
                        .background(
                            if (colors.isDark) Color.White.copy(alpha = 0.13f)
                            else Color.Black.copy(alpha = 0.07f)
                        )
                        .border(
                            1.dp,
                            if (colors.isDark) Color.White.copy(alpha = 0.18f) else Color.Black.copy(alpha = 0.08f),
                            shape,
                        )
                )

                Row {
                    ITEMS.forEach { item ->
                        val active = item.screen == current
                        Box(
                            Modifier
                                .width(itemWidth)
                                .height(46.dp)
                                .clip(shape)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                ) { onSelect(item.screen) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                item.icon,
                                contentDescription = item.label,
                                tint = if (active) {
                                    MaterialTheme.colorScheme.onBackground
                                } else {
                                    MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
                                },
                                modifier = Modifier.size(21.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
