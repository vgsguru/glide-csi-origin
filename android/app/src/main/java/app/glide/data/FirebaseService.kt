package app.glide.data

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.logEvent
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await

/**
 * Firebase integration for the "manage-buddy" project.
 *
 * Three jobs:
 *  - Identity. The app used to sign in as a hard-coded demo account; now each
 *    install gets a real Firebase user (anonymous by default, upgradeable to
 *    email/password) so the ledger belongs to somebody.
 *  - Cloud mirror. The segregated analysis is written to Firestore so the same
 *    figures survive a reinstall and can be read from another device.
 *  - Analytics. Coarse product events only — never a merchant, an amount, or
 *    any message body.
 *
 * Everything here degrades to a no-op if Firebase is unavailable. The SMS
 * pipeline and the on-device dashboard must keep working offline.
 */
class FirebaseService(context: Context) {

    private val available: Boolean = try {
        FirebaseApp.initializeApp(context.applicationContext) != null ||
            FirebaseApp.getApps(context.applicationContext).isNotEmpty()
    } catch (e: Exception) {
        Log.w(TAG, "Firebase unavailable: ${e.message}")
        false
    }

    private val auth: FirebaseAuth? = if (available) runCatching { FirebaseAuth.getInstance() }.getOrNull() else null
    private val firestore: FirebaseFirestore? =
        if (available) runCatching { FirebaseFirestore.getInstance() }.getOrNull() else null
    private val analytics: FirebaseAnalytics? =
        if (available) runCatching { FirebaseAnalytics.getInstance(context.applicationContext) }.getOrNull() else null

    val isAvailable: Boolean get() = available && auth != null

    val currentUser: FirebaseUser? get() = auth?.currentUser
    val uid: String? get() = currentUser?.uid

    /** A stable identity for this install, created on first launch. */
    suspend fun ensureSignedIn(): Result<String> {
        val auth = this.auth ?: return Result.failure(IllegalStateException("Firebase not configured"))
        return try {
            val existing = auth.currentUser
            if (existing != null) return Result.success(existing.uid)
            val result = auth.signInAnonymously().await()
            val uid = result.user?.uid ?: return Result.failure(IllegalStateException("No uid returned"))
            Log.i(TAG, "signed in anonymously as $uid")
            Result.success(uid)
        } catch (e: Exception) {
            // The most common cause is Anonymous sign-in being disabled in the
            // Firebase console, so say that rather than surfacing a raw code.
            Log.w(TAG, "anonymous sign-in failed: ${e.message}")
            Result.failure(e)
        }
    }

    /** Upgrade the anonymous identity to a real account, keeping the same uid. */
    suspend fun linkEmail(email: String, password: String): Result<String> {
        val auth = this.auth ?: return Result.failure(IllegalStateException("Firebase not configured"))
        return try {
            val credential = com.google.firebase.auth.EmailAuthProvider.getCredential(email, password)
            val current = auth.currentUser
            val result = if (current != null && current.isAnonymous) {
                current.linkWithCredential(credential).await()
            } else {
                auth.signInWithEmailAndPassword(email, password).await()
            }
            Result.success(result.user?.uid ?: "")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun signInEmail(email: String, password: String): Result<String> {
        val auth = this.auth ?: return Result.failure(IllegalStateException("Firebase not configured"))
        return try {
            val result = auth.signInWithEmailAndPassword(email, password).await()
            Result.success(result.user?.uid ?: "")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun signOut() {
        runCatching { auth?.signOut() }
    }

    /**
     * Mirror the analysis summary to Firestore.
     *
     * Deliberately a summary, not the raw ledger: no message bodies and no
     * per-merchant rows leave the device. Reading the inbox is a big ask, so
     * the cloud copy stays as small as it can while still being useful.
     */
    suspend fun syncSummary(analysis: SmsAnalysis): Result<Unit> {
        val db = firestore ?: return Result.failure(IllegalStateException("Firestore not configured"))
        val uid = this.uid ?: return Result.failure(IllegalStateException("Not signed in"))
        return try {
            val summary = mapOf(
                "windowDays" to analysis.windowDays,
                "messagesScanned" to analysis.messagesScanned,
                "parsed" to analysis.parsed,
                "rejected" to analysis.rejected,
                "totalIn" to analysis.totalIn,
                "totalOut" to analysis.totalOut,
                "net" to analysis.net,
                "discretionary" to analysis.discretionary,
                "essential" to analysis.essential,
                "dailyRunRate" to analysis.dailyRunRate,
                "averageConfidence" to analysis.averageConfidence,
                "incomeP10" to analysis.income.p10,
                "incomeP50" to analysis.income.p50,
                "incomeP90" to analysis.income.p90,
                "incomeBasis" to analysis.income.basis,
                "categories" to analysis.categories.map {
                    mapOf(
                        "category" to it.category,
                        "amount" to it.amount,
                        "count" to it.count,
                        "share" to it.share,
                        "essential" to it.essential,
                    )
                },
                "obligations" to analysis.obligations.map {
                    mapOf(
                        "name" to it.name,
                        "category" to it.category,
                        "expectedAmount" to it.expectedAmount,
                        "cadenceDays" to it.cadenceDays,
                        "occurrences" to it.occurrences,
                        "confidence" to it.confidence,
                        "nextDue" to it.nextDue,
                    )
                },
                "updatedAt" to System.currentTimeMillis(),
            )
            db.collection("users").document(uid)
                .set(mapOf("summary" to summary), SetOptions.merge())
                .await()
            Log.i(TAG, "summary synced to Firestore for $uid")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.w(TAG, "Firestore sync failed: ${e.message}")
            Result.failure(e)
        }
    }

    /** Coarse product events only — no financial values, ever. */
    fun logEvent(name: String, params: Map<String, Any> = emptyMap()) {
        val analytics = this.analytics ?: return
        runCatching {
            analytics.logEvent(name) {
                params.forEach { (key, value) ->
                    when (value) {
                        is Int -> param(key, value.toLong())
                        is Long -> param(key, value)
                        is Double -> param(key, value)
                        else -> param(key, value.toString())
                    }
                }
            }
        }
    }

    companion object {
        private const val TAG = "GlideFirebase"
    }
}
