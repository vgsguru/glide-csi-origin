package app.glide.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.glide.ui.components.GlassCard
import app.glide.ui.components.GlideLockup
import app.glide.ui.theme.GlideTheme

/**
 * The permission rationale.
 *
 * Asking for READ_SMS is a big ask, so this screen explains in plain language
 * what is read, what is done with it, and what never happens — before the
 * system dialog appears.
 */
@Composable
fun PermissionScreen(onGrant: () -> Unit) {
    val colors = GlideTheme.colors

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(56.dp))
        GlideLockup(width = 160.dp)
        Spacer(Modifier.height(32.dp))

        Text(
            "Read your bank SMS?",
            style = MaterialTheme.typography.displayMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "Glide rebuilds your last month of spending from the alerts your bank " +
                "already sends you — so you never have to type a transaction.",
            style = MaterialTheme.typography.bodyLarge,
            color = colors.muted,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(28.dp))

        Reason(
            icon = Icons.Outlined.PhoneAndroid,
            title = "Parsed on your phone",
            body = "Messages are read and categorised on-device. The dashboard works with no internet at all.",
        )
        Spacer(Modifier.height(10.dp))
        Reason(
            icon = Icons.Outlined.Insights,
            title = "Only transaction alerts are used",
            body = "OTPs, promotions and reminders are detected and discarded — they never enter your ledger.",
        )
        Spacer(Modifier.height(10.dp))
        Reason(
            icon = Icons.Outlined.Lock,
            title = "Nothing is uploaded silently",
            body = "Your messages leave the phone only when you tap Sync, and then only to your own Glide backend.",
        )

        Spacer(Modifier.height(32.dp))

        Button(
            onClick = onGrant,
            modifier = Modifier.fillMaxWidth().height(54.dp),
            shape = RoundedCornerShape(999.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
        ) {
            Text("Allow SMS access", style = MaterialTheme.typography.labelLarge)
        }

        Spacer(Modifier.height(14.dp))
        Text(
            "You can revoke this at any time in Android Settings.",
            style = MaterialTheme.typography.bodySmall,
            color = colors.muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun Reason(icon: ImageVector, title: String, body: String) {
    val colors = GlideTheme.colors
    GlassCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.secondary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.height(3.dp))
                Text(body, style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
        }
    }
}
