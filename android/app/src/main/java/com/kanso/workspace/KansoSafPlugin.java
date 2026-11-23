package com.kanso.workspace;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "KansoSaf")
public class KansoSafPlugin extends Plugin {

    private static final int REQ_POST_NOTIFICATIONS = 4208;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private boolean hasRequestedNotificationPermission = false;

    @Override
    public void load() {
        super.load();
        final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
        KansoMediaPlaybackService.setControlListener(action ->
            mainHandler.post(() -> {
                JSObject payload = new JSObject();
                payload.put("action", action);
                notifyListeners("mediaControlAction", payload);
            })
        );
    }

    @Override
    protected void handleOnDestroy() {
        KansoMediaPlaybackService.setControlListener(null);
        super.handleOnDestroy();
    }

    private static boolean isSupportedBookName(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".epub")
            || lower.endsWith(".pdf")
            || lower.endsWith(".mobi")
            || lower.endsWith(".prc")
            || lower.endsWith(".azw");
    }

    private static boolean isSupportedAudioName(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp3")
            || lower.endsWith(".m4a")
            || lower.endsWith(".wav")
            || lower.endsWith(".ogg")
            || lower.endsWith(".flac")
            || lower.endsWith(".opus")
            || lower.endsWith(".aac");
    }

    private void persistReadPermission(Uri uri) {
        if (uri == null) return;
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException ignored) {
            // Some providers grant transient read access only; ignore safely
        }
    }

    private JSObject inspectDocumentUri(Uri uri) {
        ContentResolver cr = getContext().getContentResolver();
        String name = null;
        long size = 0L;
        String mimeType = cr.getType(uri);

        try (Cursor cursor = cr.query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIdx >= 0 && !cursor.isNull(nameIdx)) {
                    name = cursor.getString(nameIdx);
                }
                if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                    size = cursor.getLong(sizeIdx);
                }
            }
        } catch (Exception ignored) {
            // Fallback to URI path segment below
        }

        if (name == null || name.trim().isEmpty()) {
            String seg = uri.getLastPathSegment();
            if (seg != null) {
                int slash = seg.lastIndexOf('/');
                name = slash >= 0 ? seg.substring(slash + 1) : seg;
            } else {
                name = "ebook";
            }
        }

        JSObject item = new JSObject();
        item.put("uri", uri.toString());
        item.put("name", name);
        item.put("size", size);
        item.put("mimeType", mimeType != null ? mimeType : "application/octet-stream");
        return item;
    }

    @PluginMethod
    public void pickDocuments(PluginCall call) {
        boolean allowMultiple = call.getBoolean("allowMultiple", true);
        String mediaType = call.getString("mediaType", "ebook");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if ("audio".equals(mediaType)) {
            intent.setType("audio/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "audio/*",
                "application/ogg",
                "application/octet-stream"
            });
        } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/epub+zip",
                "application/pdf",
                "application/x-mobipocket-ebook",
                "application/vnd.amazon.mobi8-ebook",
                "application/octet-stream"
            });
        }
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "handlePickDocumentsResult");
    }

    @ActivityCallback
    private void handlePickDocumentsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject res = new JSObject();
            res.put("cancelled", true);
            res.put("files", new JSArray());
            call.resolve(res);
            return;
        }

        Intent data = result.getData();
        JSArray files = new JSArray();

        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) {
                    persistReadPermission(uri);
                    files.put(inspectDocumentUri(uri));
                }
            }
        } else if (data.getData() != null) {
            Uri uri = data.getData();
            persistReadPermission(uri);
            files.put(inspectDocumentUri(uri));
        }

        JSObject res = new JSObject();
        res.put("cancelled", false);
        res.put("files", files);
        call.resolve(res);
    }

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "handlePickDirectoryResult");
    }

    @ActivityCallback
    private void handlePickDirectoryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject res = new JSObject();
            res.put("cancelled", true);
            call.resolve(res);
            return;
        }

        Uri treeUri = result.getData().getData();
        persistReadPermission(treeUri);

        String displayName = "Device Folder";
        try {
            String docId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
            try (Cursor cursor = getContext().getContentResolver().query(
                docUri,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    int idx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                    if (idx >= 0 && !cursor.isNull(idx)) {
                        displayName = cursor.getString(idx);
                    }
                }
            }
        } catch (Exception ignored) {
            String seg = treeUri.getLastPathSegment();
            if (seg != null && !seg.isEmpty()) {
                int colon = seg.lastIndexOf(':');
                displayName = colon >= 0 && colon + 1 < seg.length() ? seg.substring(colon + 1) : seg;
            }
        }

        JSObject res = new JSObject();
        res.put("cancelled", false);
        res.put("uri", treeUri.toString());
        res.put("name", displayName);
        call.resolve(res);
    }

    @PluginMethod
    public void scanDirectory(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String mediaType = call.getString("mediaType", "ebook");
        final boolean isAudioScan = "audio".equals(mediaType);
        if (treeUriStr == null || treeUriStr.trim().isEmpty()) {
            call.reject("Missing treeUri parameter");
            return;
        }

        executor.execute(() -> {
            try {
                Uri treeUri = Uri.parse(treeUriStr);
                ContentResolver cr = getContext().getContentResolver();
                String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);

                JSArray files = new JSArray();
                ArrayDeque<String> queue = new ArrayDeque<>();
                Set<String> visitedDocIds = new HashSet<>();
                queue.add(rootDocId);

                final int maxFiles = 500;
                int foundCount = 0;

                while (!queue.isEmpty() && foundCount < maxFiles) {
                    String parentDocId = queue.poll();
                    if (parentDocId == null || !visitedDocIds.add(parentDocId)) {
                        continue;
                    }

                    Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
                    try (Cursor cursor = cr.query(
                        childrenUri,
                        new String[] {
                            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                            DocumentsContract.Document.COLUMN_MIME_TYPE,
                            DocumentsContract.Document.COLUMN_SIZE
                        },
                        null,
                        null,
                        null
                    )) {
                        if (cursor == null) continue;
                        int idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
                        int nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                        int mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE);
                        int sizeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);

                        while (cursor.moveToNext() && foundCount < maxFiles) {
                            String childId = idCol >= 0 ? cursor.getString(idCol) : null;
                            String name = nameCol >= 0 ? cursor.getString(nameCol) : null;
                            String mime = mimeCol >= 0 ? cursor.getString(mimeCol) : null;
                            long size = sizeCol >= 0 && !cursor.isNull(sizeCol) ? cursor.getLong(sizeCol) : 0L;

                            if (childId == null) continue;
                            if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                                if (name == null || !name.startsWith(".")) {
                                    queue.add(childId);
                                }
                            } else if (isAudioScan ? isSupportedAudioName(name) : isSupportedBookName(name)) {
                                Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childId);
                                JSObject item = new JSObject();
                                item.put("uri", docUri.toString());
                                item.put("name", name);
                                item.put("size", size);
                                item.put("mimeType", mime != null ? mime : "application/octet-stream");
                                files.put(item);
                                foundCount++;
                            }
                        }
                    } catch (SecurityException se) {
                        call.reject("Folder permission revoked. Please re-link this folder.", se);
                        return;
                    }
                }

                JSObject res = new JSObject();
                res.put("files", files);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Failed to scan folder: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void checkUris(PluginCall call) {
        JSArray uriArray = call.getArray("uris");
        if (uriArray == null) {
            JSObject res = new JSObject();
            res.put("statuses", new JSObject());
            call.resolve(res);
            return;
        }

        executor.execute(() -> {
            ContentResolver cr = getContext().getContentResolver();
            JSObject statuses = new JSObject();
            for (int i = 0; i < uriArray.length(); i++) {
                String uriStr = uriArray.optString(i, null);
                if (uriStr == null || uriStr.isEmpty()) continue;
                boolean readable = false;
                try (InputStream is = cr.openInputStream(Uri.parse(uriStr))) {
                    readable = is != null;
                } catch (Exception ignored) {
                    readable = false;
                }
                statuses.put(uriStr, readable);
            }
            JSObject res = new JSObject();
            res.put("statuses", statuses);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void readDocument(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("Missing uri parameter");
            return;
        }
        long offset = call.getInt("offset", 0);
        int requestedLength = call.getInt("length", -1);

        executor.execute(() -> {
            try {
                Uri uri = Uri.parse(uriStr);
                ContentResolver cr = getContext().getContentResolver();
                long totalSize = 0L;
                try (Cursor cursor = cr.query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                            totalSize = cursor.getLong(sizeIdx);
                        }
                    }
                } catch (Exception ignored) {
                    // Size optional
                }

                try (InputStream is = cr.openInputStream(uri)) {
                    if (is == null) {
                        call.reject("Unable to open device file stream");
                        return;
                    }

                    long remainingSkip = Math.max(0L, offset);
                    while (remainingSkip > 0) {
                        long skipped = is.skip(remainingSkip);
                        if (skipped <= 0) {
                            if (is.read() == -1) break;
                            remainingSkip -= 1;
                        } else {
                            remainingSkip -= skipped;
                        }
                    }

                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[65536];
                    int totalRead = 0;
                    while (true) {
                        int maxToRead = buf.length;
                        if (requestedLength >= 0) {
                            int remaining = requestedLength - totalRead;
                            if (remaining <= 0) break;
                            maxToRead = Math.min(maxToRead, remaining);
                        }
                        int read = is.read(buf, 0, maxToRead);
                        if (read == -1) break;
                        out.write(buf, 0, read);
                        totalRead += read;
                    }

                    byte[] bytes = out.toByteArray();
                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    JSObject res = new JSObject();
                    res.put("base64", base64);
                    res.put("byteLength", bytes.length);
                    res.put("totalSize", totalSize > 0 ? totalSize : (offset + bytes.length));
                    call.resolve(res);
                }
            } catch (Exception e) {
                call.reject("Could not read device file: " + e.getMessage(), e);
            }
        });
    }

    private static String sha256HexShort(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < Math.min(16, digest.length); i++) {
                sb.append(String.format(Locale.ROOT, "%02x", digest[i] & 0xff));
            }
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }

    private static String sanitizeAudioExt(String extHint, String displayName) {
        String candidate = extHint != null ? extHint.trim().toLowerCase(Locale.ROOT) : "";
        if (candidate.isEmpty() && displayName != null) {
            int dot = displayName.lastIndexOf('.');
            if (dot >= 0 && dot < displayName.length() - 1) {
                candidate = displayName.substring(dot + 1).trim().toLowerCase(Locale.ROOT);
            }
        }
        candidate = candidate.replaceAll("[^a-z0-9]", "");
        switch (candidate) {
            case "mp3":
            case "m4a":
            case "mp4":
            case "wav":
            case "ogg":
            case "oga":
            case "flac":
            case "opus":
            case "aac":
                return candidate;
            default:
                return "audio";
        }
    }

    private synchronized void evictAudioCacheIfNeeded(File cacheDir, File keepFile, long maxBytes) {
        File[] files = cacheDir.listFiles();
        if (files == null || files.length == 0) return;
        long total = 0L;
        for (File f : files) {
            if (f.isFile()) {
                total += f.length();
            }
        }
        if (total <= maxBytes) return;

        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File f : files) {
            if (total <= maxBytes) break;
            if (!f.isFile() || f.equals(keepFile)) continue;
            long len = f.length();
            if (f.delete()) {
                total -= len;
            }
        }
    }

    @PluginMethod
    public void prepareAudioFile(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("Missing uri parameter");
            return;
        }
        String extHint = call.getString("extension", "");
        long requestedMax = call.getInt("maxCacheBytes", 256 * 1024 * 1024);
        final long maxCacheBytes = Math.max(32L * 1024L * 1024L, requestedMax);

        executor.execute(() -> {
            try {
                Uri uri = Uri.parse(uriStr);
                ContentResolver cr = getContext().getContentResolver();

                String displayName = null;
                long reportedSize = -1L;
                long reportedMtime = 0L;
                String[] projection = new String[] {
                    OpenableColumns.DISPLAY_NAME,
                    OpenableColumns.SIZE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED
                };
                try (Cursor cursor = cr.query(uri, projection, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                        int mtimeIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
                        if (nameIdx >= 0 && !cursor.isNull(nameIdx)) {
                            displayName = cursor.getString(nameIdx);
                        }
                        if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                            reportedSize = cursor.getLong(sizeIdx);
                        }
                        if (mtimeIdx >= 0 && !cursor.isNull(mtimeIdx)) {
                            reportedMtime = cursor.getLong(mtimeIdx);
                        }
                    }
                } catch (Exception ignored) {
                    // Metadata columns are optional across SAF providers
                }

                String ext = sanitizeAudioExt(extHint, displayName);
                String uriHash = sha256HexShort(uriStr);
                File cacheDir = new File(getContext().getCacheDir(), "kanso_audio_cache");
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs();
                }

                String stamp = reportedMtime + "_" + Math.max(0L, reportedSize);
                File targetFile = new File(cacheDir, uriHash + "_" + stamp + "." + ext);

                if (
                    targetFile.exists() &&
                    targetFile.length() > 0 &&
                    (reportedSize <= 0L || targetFile.length() == reportedSize)
                ) {
                    targetFile.setLastModified(System.currentTimeMillis());
                    JSObject hit = new JSObject();
                    hit.put("filePath", targetFile.getAbsolutePath());
                    hit.put("size", targetFile.length());
                    hit.put("cacheHit", true);
                    call.resolve(hit);
                    return;
                }

                // Clean up older versions for this URI before streaming fresh copy
                final String stalePrefix = uriHash + "_";
                final String targetFileName = targetFile.getName();
                File[] stale = cacheDir.listFiles((dir, name) -> name.startsWith(stalePrefix) && !name.equals(targetFileName));
                if (stale != null) {
                    for (File oldFile : stale) {
                        oldFile.delete();
                    }
                }

                File tmpFile = new File(cacheDir, uriHash + "_" + stamp + "." + ext + ".tmp");
                long copied = 0L;
                try (InputStream is = cr.openInputStream(uri)) {
                    if (is == null) {
                        call.reject("Unable to open device audio stream");
                        return;
                    }
                    try (FileOutputStream fos = new FileOutputStream(tmpFile)) {
                        byte[] buf = new byte[65536];
                        int read;
                        while ((read = is.read(buf)) != -1) {
                            fos.write(buf, 0, read);
                            copied += read;
                        }
                        fos.getFD().sync();
                    }
                } catch (Exception streamErr) {
                    if (tmpFile.exists()) tmpFile.delete();
                    throw streamErr;
                }

                if (copied <= 0L) {
                    if (tmpFile.exists()) tmpFile.delete();
                    call.reject("Device audio stream was empty");
                    return;
                }

                if (targetFile.exists()) {
                    targetFile.delete();
                }
                if (!tmpFile.renameTo(targetFile)) {
                    // Fallback copy/replace if rename across states failed
                    targetFile = tmpFile;
                }
                targetFile.setLastModified(System.currentTimeMillis());
                evictAudioCacheIfNeeded(cacheDir, targetFile, maxCacheBytes);

                JSObject res = new JSObject();
                res.put("filePath", targetFile.getAbsolutePath());
                res.put("size", targetFile.length());
                res.put("cacheHit", false);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Could not prepare native audio cache: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void releaseUri(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr != null && !uriStr.trim().isEmpty()) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(
                    Uri.parse(uriStr),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (Exception ignored) {
                // Ignore if already revoked or tree-derived
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setSystemChrome(PluginCall call) {
        String colorHex = call.getString("color", "#FFFFFF");
        boolean isDark = Boolean.TRUE.equals(call.getBoolean("isDark", false));
        android.app.Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        int parsedColor;
        try {
            parsedColor = android.graphics.Color.parseColor(colorHex);
        } catch (IllegalArgumentException e) {
            parsedColor = android.graphics.Color.WHITE;
        }
        final int finalColor = parsedColor;
        activity.getSharedPreferences(MainActivity.CHROME_PREFS_NAME, android.content.Context.MODE_PRIVATE)
            .edit()
            .putInt(MainActivity.CHROME_COLOR_KEY, finalColor)
            .putBoolean(MainActivity.CHROME_DARK_KEY, isDark)
            .apply();
        activity.runOnUiThread(() -> MainActivity.applySystemChrome(activity, finalColor, isDark));
        call.resolve();
    }

    @PluginMethod
    public void setBackgroundMediaState(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        boolean keepServiceAlive = Boolean.TRUE.equals(call.getBoolean("keepServiceAlive", false));
        boolean showTrackControls = Boolean.TRUE.equals(call.getBoolean("showTrackControls", false));
        String title = call.getString("title", "Kanso Media");
        String subtitle = call.getString("subtitle", playing ? "Playing in background" : "Paused");

        Context ctx = getContext();
        Activity activity = getActivity();
        MainActivity.backgroundAudioActive = playing;

        if (playing || keepServiceAlive) {
            if (playing && activity != null && this.bridge != null && this.bridge.getWebView() != null) {
                final android.webkit.WebView webView = this.bridge.getWebView();
                activity.runOnUiThread(() -> {
                    webView.onResume();
                    webView.resumeTimers();
                    webView.dispatchWindowVisibilityChanged(android.view.View.VISIBLE);
                });
            }
            try {
                Intent serviceIntent = new Intent(ctx, KansoMediaPlaybackService.class);
                serviceIntent.setAction(KansoMediaPlaybackService.ACTION_START_OR_UPDATE);
                serviceIntent.putExtra(KansoMediaPlaybackService.EXTRA_TITLE, title);
                serviceIntent.putExtra(KansoMediaPlaybackService.EXTRA_SUBTITLE, subtitle);
                serviceIntent.putExtra(KansoMediaPlaybackService.EXTRA_PLAYING, playing);
                serviceIntent.putExtra(KansoMediaPlaybackService.EXTRA_SHOW_TRACK_CONTROLS, showTrackControls);
                ContextCompat.startForegroundService(ctx, serviceIntent);
            } catch (Exception ignored) {
                // Guard against OS foreground-start restrictions if app is already closing
            }
            if (
                playing &&
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                activity != null &&
                !hasRequestedNotificationPermission &&
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                hasRequestedNotificationPermission = true;
                ActivityCompat.requestPermissions(
                    activity,
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    REQ_POST_NOTIFICATIONS
                );
            }
        } else {
            try {
                ctx.stopService(new Intent(ctx, KansoMediaPlaybackService.class));
            } catch (Exception ignored) {
                // Safe no-op if already stopped
            }
        }

        call.resolve();
    }
}
