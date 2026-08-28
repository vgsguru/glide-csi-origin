package app.glide.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The Android half of the shared design system.
 *
 * These values are the direct counterparts of the CSS custom properties in
 * web/src/index.css -- same near-black ground, same white-alpha glass, same
 * radii -- so the two clients read as one product.
 */

// --- Dark (default, matches the web app's default) -------------------------
val DarkBackground = Color(0xFF141414)   // oklch(0.08 0 0)
val DarkForeground = Color(0xFFFAFAFA)   // oklch(0.98 0 0)
val DarkSecondary = Color(0xFF2E2E2E)
val DarkMuted = Color(0xFFA6A6A6)
val DarkBorder = Color(0x1AFFFFFF)       // white 10%
val DarkGlass = Color(0x0FFFFFFF)        // white 6%
val DarkGlassBorder = Color(0x1FFFFFFF)  // white 12%

// --- Light -----------------------------------------------------------------
val LightBackground = Color(0xFFFCFCFC)
val LightForeground = Color(0xFF1C1C1C)
val LightSecondary = Color(0xFFF0F0F0)
val LightMuted = Color(0xFF6B6B6B)
val LightBorder = Color(0x14000000)
val LightGlass = Color(0x8AFFFFFF)
val LightGlassBorder = Color(0x59FFFFFF)

// --- Semantic accents (identical hues to the web build) --------------------
val Positive = Color(0xFF4ADE80)
val Negative = Color(0xFFF87171)
val Warning = Color(0xFFFBBF24)
val Informational = Color(0xFF60A5FA)
val Accentuated = Color(0xFFC084FC)

/** Palette values Material3's ColorScheme has no slot for. */
data class GlideColors(
    val glass: Color,
    val glassBorder: Color,
    val muted: Color,
    val border: Color,
    val secondary: Color,
    val positive: Color = Positive,
    val negative: Color = Negative,
    val warning: Color = Warning,
    val informational: Color = Informational,
    val isDark: Boolean = true,
)

val LocalGlideColors = staticCompositionLocalOf {
    GlideColors(DarkGlass, DarkGlassBorder, DarkMuted, DarkBorder, DarkSecondary)
}

object GlideTheme {
    val colors: GlideColors
        @Composable get() = LocalGlideColors.current
}

// Corner radii mirroring Tailwind's rounded-2xl / 3xl / 4xl.
val RadiusSmall = 16.dp
val RadiusMedium = 24.dp
val RadiusLarge = 32.dp

private val DarkScheme = darkColorScheme(
    background = DarkBackground,
    onBackground = DarkForeground,
    surface = DarkBackground,
    onSurface = DarkForeground,
    primary = DarkForeground,
    onPrimary = DarkBackground,
    secondary = DarkSecondary,
    onSecondary = DarkForeground,
    error = Negative,
    outline = DarkBorder,
)

private val LightScheme = lightColorScheme(
    background = LightBackground,
    onBackground = LightForeground,
    surface = LightBackground,
    onSurface = LightForeground,
    primary = LightForeground,
    onPrimary = LightBackground,
    secondary = LightSecondary,
    onSecondary = LightForeground,
    error = Negative,
    outline = LightBorder,
)

/**
 * Space Grotesk / Inter are not bundled, so the display face is approximated
 * with the platform sans at the same weights and the same negative tracking
 * the web build uses -- which is what actually carries the brand's feel.
 */
private val Display = FontFamily.SansSerif
private val Body = FontFamily.SansSerif

private val GlideTypography = Typography(
    displayLarge = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 44.sp, letterSpacing = (-1.4).sp),
    displayMedium = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 34.sp, letterSpacing = (-1.0).sp),
    headlineLarge = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 28.sp, letterSpacing = (-0.7).sp),
    headlineMedium = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 22.sp, letterSpacing = (-0.5).sp),
    titleLarge = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 18.sp, letterSpacing = (-0.3).sp),
    titleMedium = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    bodyLarge = TextStyle(fontFamily = Body, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = Body, fontWeight = FontWeight.Normal, fontSize = 13.5.sp, lineHeight = 19.sp),
    bodySmall = TextStyle(fontFamily = Body, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = Body, fontWeight = FontWeight.Medium, fontSize = 13.sp),
    labelMedium = TextStyle(fontFamily = Body, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.6.sp),
    labelSmall = TextStyle(fontFamily = Body, fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 0.8.sp),
)

@Composable
fun GlideAppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val glide = if (darkTheme) {
        GlideColors(DarkGlass, DarkGlassBorder, DarkMuted, DarkBorder, DarkSecondary, isDark = true)
    } else {
        GlideColors(LightGlass, LightGlassBorder, LightMuted, LightBorder, LightSecondary, isDark = false)
    }

    CompositionLocalProvider(LocalGlideColors provides glide) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            typography = GlideTypography,
            content = content,
        )
    }
}
