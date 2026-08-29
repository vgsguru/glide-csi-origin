package app.glide.data

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Reads text off a bill photo using ML Kit, entirely on-device.
 *
 * Chosen over a cloud vision API on purpose: it works offline, costs nothing,
 * needs no key, and the photograph of your receipt never leaves the phone --
 * the same promise the SMS pipeline already makes.
 *
 * The important part is *not* `result.text`. ML Kit groups text into blocks, so
 * on a two-column receipt the raw string can read "GRAND TOTAL / Subtotal /
 * 830.00 / 871.50" -- every label, then every figure. Reading that naively
 * pairs "grand total" with whatever number happens to follow it. So this
 * reconstructs true visual rows from each element's bounding box instead.
 */
object BillScanner {

    private const val TAG = "GlideBillScanner"

    private val recognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    /** What came back from a scan attempt. */
    sealed interface Outcome {
        data class Text(val value: String) : Outcome
        /** The image opened fine, but nothing legible was in it. */
        data object NoText : Outcome
        /** The image itself could not be read. */
        data object BadImage : Outcome
        /**
         * The recogniser is not ready. The model ships through Play Services
         * rather than inside the APK, so a device without it (or an emulator on
         * a non-Play system image) has nothing to run.
         */
        data object ModelUnavailable : Outcome
    }

    /** Recognised text, re-flowed into visual rows top-to-bottom. */
    suspend fun read(context: Context, uri: Uri): Outcome =
        suspendCancellableCoroutine { cont ->
            val image = runCatching { InputImage.fromFilePath(context, uri) }.getOrNull()
            if (image == null) {
                cont.resume(Outcome.BadImage)
                return@suspendCancellableCoroutine
            }
            recognizer.process(image)
                .addOnSuccessListener { result ->
                    if (!cont.isActive) return@addOnSuccessListener
                    val text = reflow(result).ifBlank { result.text }
                    cont.resume(if (text.isBlank()) Outcome.NoText else Outcome.Text(text))
                }
                .addOnFailureListener { error ->
                    if (!cont.isActive) return@addOnFailureListener
                    // Distinguish "the recogniser cannot run here" from "this
                    // photo was unreadable" -- telling someone to retake a
                    // perfectly good photo is worse than saying nothing.
                    val unavailable = error is MlKitException &&
                        (error.errorCode == MlKitException.UNAVAILABLE ||
                            error.errorCode == MlKitException.FAILED_PRECONDITION)
                    Log.w(TAG, "recognition failed: ${error.message}")
                    cont.resume(if (unavailable) Outcome.ModelUnavailable else Outcome.NoText)
                }
        }

    private data class Piece(val text: String, val top: Int, val left: Int, val height: Int)

    /**
     * Rebuild the page as a human reads it: collect every recognised line with
     * its position, group the ones that sit on the same horizontal band, then
     * order each band left-to-right. A label and its amount end up on one row.
     */
    private fun reflow(result: com.google.mlkit.vision.text.Text): String {
        val pieces = ArrayList<Piece>()
        for (block in result.textBlocks) {
            for (line in block.lines) {
                val box = line.boundingBox ?: continue
                val value = line.text.trim()
                if (value.isEmpty()) continue
                pieces.add(Piece(value, box.top, box.left, box.height()))
            }
        }
        if (pieces.isEmpty()) return ""

        pieces.sortBy { it.top }
        // Two pieces belong to the same row if their tops are within roughly
        // half a line height -- tolerant of skew without merging real rows.
        val tolerance = (pieces.map { it.height }.average() * 0.6).toInt().coerceAtLeast(8)

        val rows = ArrayList<MutableList<Piece>>()
        for (piece in pieces) {
            val row = rows.lastOrNull()
            if (row != null && kotlin.math.abs(piece.top - row.first().top) <= tolerance) {
                row.add(piece)
            } else {
                rows.add(mutableListOf(piece))
            }
        }

        return rows.joinToString("\n") { row ->
            row.sortedBy { it.left }.joinToString("   ") { it.text }
        }
    }
}
