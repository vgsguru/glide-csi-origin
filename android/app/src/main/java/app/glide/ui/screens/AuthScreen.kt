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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.glide.AuthState
import app.glide.ui.components.GlassCard
import app.glide.ui.components.GlideLockup
import app.glide.ui.theme.GlideTheme

/**
 * Sign in before anything else.
 *
 * The app previously opened straight onto a ledger with no idea whose it was.
 * An account gives the data an owner, makes sign-out mean something, and lets
 * the same person pick up their history on another device.
 */
@Composable
fun AuthScreen(
    auth: AuthState,
    onSignIn: (String, String) -> Unit,
    onSignUp: (String, String, String) -> Unit,
    onContinueWithoutAccount: () -> Unit,
) {
    val colors = GlideTheme.colors
    var isSignUp by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(56.dp))
        GlideLockup(width = 170.dp)
        Spacer(Modifier.height(28.dp))

        Text(
            if (isSignUp) "Create your account" else "Welcome back",
            style = MaterialTheme.typography.displayMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "A copilot that understands variable income.",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.muted,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(28.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            if (isSignUp) {
                Field("Your name", name, { name = it })
                Spacer(Modifier.height(10.dp))
            }
            Field("you@example.com", email, { email = it }, keyboard = KeyboardType.Email)
            Spacer(Modifier.height(10.dp))
            Field("Password", password, { password = it }, secret = true)

            if (auth.error != null) {
                Spacer(Modifier.height(12.dp))
                Text(auth.error, style = MaterialTheme.typography.bodySmall, color = colors.negative)
            }

            Spacer(Modifier.height(16.dp))
            PrimaryAction(
                label = if (auth.busy) {
                    if (isSignUp) "Creating…" else "Signing in…"
                } else {
                    if (isSignUp) "Create account" else "Sign in"
                },
                enabled = !auth.busy && email.contains('@') && password.length >= 6,
            ) {
                if (isSignUp) onSignUp(email.trim(), password, name.trim())
                else onSignIn(email.trim(), password)
            }

            Spacer(Modifier.height(14.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    if (isSignUp) "Already registered? " else "No account yet? ",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
                Text(
                    if (isSignUp) "Sign in" else "Sign up",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.clickable { isSignUp = !isSignUp },
                )
            }
        }

        Spacer(Modifier.height(18.dp))
        Text(
            "Continue without an account",
            style = MaterialTheme.typography.bodySmall,
            color = colors.muted,
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .clickable(onClick = onContinueWithoutAccount)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        )
        Text(
            "Your messages stay on this phone either way.",
            style = MaterialTheme.typography.labelSmall,
            color = colors.muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun Field(
    placeholder: String,
    value: String,
    onChange: (String) -> Unit,
    secret: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text,
) {
    val colors = GlideTheme.colors
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.secondary.copy(alpha = 0.6f))
            .padding(horizontal = 14.dp, vertical = 14.dp)
    ) {
        if (value.isEmpty()) {
            Text(placeholder, style = MaterialTheme.typography.bodyMedium, color = colors.muted)
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onBackground),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.onBackground),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun PrimaryAction(label: String, enabled: Boolean, onClick: () -> Unit) {
    val colors = GlideTheme.colors
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(999.dp))
            .background(if (enabled) MaterialTheme.colorScheme.primary else colors.secondary)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (enabled) MaterialTheme.colorScheme.onPrimary else colors.muted,
        )
    }
}
