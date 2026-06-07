package app.tauri.android_print

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream

@InvokeArg
class PrintArgs {
    var uri: String? = null
    var pdfBase64: String? = null
    var fileName: String? = null
}

/**
 * Tauri Plugin for Android printing using the system Print Framework.
 */
@TauriPlugin
class PrintPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "PrintPlugin"
    }

    @Command
    fun discoverPrinters(invoke: Invoke) {
        Log.d(TAG, "discoverPrinters called")
        val result = JSObject()
        result.put("printers", org.json.JSONArray())
        invoke.resolve(result)
    }

    @Command
    fun stopDiscovery(invoke: Invoke) {
        Log.d(TAG, "stopDiscovery called")
        invoke.resolve()
    }

    @Command
    fun printPdf(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(PrintArgs::class.java)
            val pdfBase64 = args.pdfBase64

            if (pdfBase64.isNullOrEmpty()) {
                invoke.reject("Missing PDF data")
                return
            }

            Log.d(TAG, "Printing PDF via Android Print Framework")

            val pdfBytes = Base64.decode(pdfBase64, Base64.DEFAULT)
            Log.d(TAG, "PDF size: ${pdfBytes.size} bytes")

            activity.runOnUiThread {
                try {
                    printPdfBytes(pdfBytes, "KalGabay Labels")
                    val result = JSObject()
                    result.put("success", true)
                    result.put("message", "Print dialog opened")
                    invoke.resolve(result)
                } catch (e: Exception) {
                    Log.e(TAG, "Print error: ${e.message}", e)
                    invoke.reject("Print failed: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error: ${e.message}", e)
            invoke.reject("Invalid arguments: ${e.message}")
        }
    }

    private fun printPdfBytes(pdfBytes: ByteArray, jobName: String) {
        val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager

        val printAdapter = object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes,
                cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback,
                extras: Bundle?
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback.onLayoutCancelled()
                    return
                }

                val info = PrintDocumentInfo.Builder(jobName)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build()

                callback.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out PageRange>?,
                destination: ParcelFileDescriptor,
                cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback
            ) {
                try {
                    if (cancellationSignal?.isCanceled == true) {
                        callback.onWriteCancelled()
                        return
                    }

                    FileOutputStream(destination.fileDescriptor).use { output ->
                        output.write(pdfBytes)
                    }

                    callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                    Log.d(TAG, "PDF written to print spooler")
                } catch (e: Exception) {
                    Log.e(TAG, "Write error: ${e.message}", e)
                    callback.onWriteFailed(e.message)
                }
            }
        }

        val attributes = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setResolution(PrintAttributes.Resolution("default", "Default", 300, 300))
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
            .build()

        printManager.print(jobName, printAdapter, attributes)
        Log.d(TAG, "Print dialog launched")
    }

    @Command
    fun openPdf(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(PrintArgs::class.java)
            val pdfBase64 = args.pdfBase64
            val fileName = args.fileName ?: "document.pdf"

            if (pdfBase64.isNullOrEmpty()) {
                invoke.reject("Missing PDF data")
                return
            }

            Log.d(TAG, "Opening PDF: $fileName")

            val pdfBytes = Base64.decode(pdfBase64, Base64.DEFAULT)
            Log.d(TAG, "PDF size: ${pdfBytes.size} bytes")

            activity.runOnUiThread {
                try {
                    val uri: Uri?

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        // Android 10+ - use MediaStore
                        val contentValues = ContentValues().apply {
                            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                            put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
                            put(MediaStore.Downloads.IS_PENDING, 1)
                        }

                        uri = activity.contentResolver.insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                            contentValues
                        )

                        uri?.let {
                            activity.contentResolver.openOutputStream(it)?.use { output ->
                                output.write(pdfBytes)
                            }

                            // Mark as complete
                            contentValues.clear()
                            contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
                            activity.contentResolver.update(it, contentValues, null, null)
                        }

                        Log.d(TAG, "Saved PDF to Downloads via MediaStore: $uri")
                    } else {
                        // Android 9 and below - save to Downloads directory
                        val downloadsDir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS
                        )
                        val pdfFile = File(downloadsDir, fileName)
                        FileOutputStream(pdfFile).use { it.write(pdfBytes) }
                        uri = Uri.fromFile(pdfFile)
                        Log.d(TAG, "Saved PDF to: ${pdfFile.absolutePath}")
                    }

                    // Open the PDF
                    if (uri != null) {
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/pdf")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }

                        // Check if there's an app to handle PDFs
                        if (intent.resolveActivity(activity.packageManager) != null) {
                            activity.startActivity(intent)
                            Log.d(TAG, "Started PDF viewer activity")
                        } else {
                            // No PDF viewer - try with chooser
                            val chooser = Intent.createChooser(intent, "פתח PDF עם...")
                            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            activity.startActivity(chooser)
                            Log.d(TAG, "Started chooser for PDF")
                        }

                        val result = JSObject()
                        result.put("success", true)
                        result.put("uri", uri.toString())
                        result.put("message", "PDF נשמר בתיקיית Downloads")
                        invoke.resolve(result)
                    } else {
                        invoke.reject("Failed to save PDF")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Open PDF error: ${e.message}", e)
                    invoke.reject("Failed to open PDF: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error: ${e.message}", e)
            invoke.reject("Invalid arguments: ${e.message}")
        }
    }
}
