#!/usr/bin/env node
/**
 * Idempotent post-setup configurator for Kanso's Capacitor Android project.
 * Run once after `npx cap add android` (via `npm run cap:configure-android`).
 *
 * Applies:
 *  1. AndroidManifest.xml: INTERNET + WAKE_LOCK permissions, hardwareAcceleration,
 *     and portrait/landscape configChanges preservation so playing YouTube streams
 *     and active UI state survive screen rotation without reloading.
 *  2. KansoSafPlugin.java: Native Android Storage Access Framework (SAF) Capacitor plugin
 *     providing persisted read permissions for individual/multi-file picking, whole-folder
 *     tree scanning, URI health checks, and chunked on-demand streaming without copying files.
 *  3. MainActivity.java: Registers KansoSafPlugin and configures WebView media & YouTube
 *     embed settings (mediaPlaybackRequiresUserGesture=false, mixed content, background audio).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const androidRoot = path.join(projectRoot, 'android');
const manifestPath = path.join(androidRoot, 'app/src/main/AndroidManifest.xml');
const javaPackageDir = path.join(
  androidRoot,
  'app/src/main/java/com/kanso/workspace'
);
const mainActivityPath = path.join(javaPackageDir, 'MainActivity.java');
const safPluginPath = path.join(javaPackageDir, 'KansoSafPlugin.java');
const mediaServicePath = path.join(javaPackageDir, 'KansoMediaPlaybackService.java');
const kansoWebViewPath = path.join(javaPackageDir, 'KansoWebView.java');
const androidResDir = path.join(androidRoot, 'app/src/main/res');

if (!fs.existsSync(androidRoot)) {
  console.error(
    '[Kanso Android] No android/ folder found yet.\n' +
      'Run `npm run build && npx cap add android` first, then run `npm run cap:configure-android`.'
  );
  process.exit(1);
}

// 1. Patch AndroidManifest.xml
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  let changed = false;

  const ensurePermission = (perm) => {
    const tag = `<uses-permission android:name="${perm}" />`;
    if (!manifest.includes(perm)) {
      manifest = manifest.replace('</manifest>', `    ${tag}\n</manifest>`);
      changed = true;
    }
  };

  ensurePermission('android.permission.INTERNET');
  ensurePermission('android.permission.WAKE_LOCK');
  ensurePermission('android.permission.FOREGROUND_SERVICE');
  ensurePermission('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK');
  ensurePermission('android.permission.POST_NOTIFICATIONS');

  // Ensure hardwareAccelerated="true" on <application>
  if (!manifest.includes('android:hardwareAccelerated=')) {
    manifest = manifest.replace(
      '<application',
      '<application\n        android:hardwareAccelerated="true"'
    );
    changed = true;
  }

  // Ensure KansoMediaPlaybackService is registered inside <application>
  if (!manifest.includes('android:name=".KansoMediaPlaybackService"')) {
    const serviceTag =
      `        <service\n` +
      `            android:name=".KansoMediaPlaybackService"\n` +
      `            android:exported="false"\n` +
      `            android:foregroundServiceType="mediaPlayback" />`;
    manifest = manifest.replace('</application>', `${serviceTag}\n    </application>`);
    changed = true;
  }

  // Ensure full portrait + landscape configChanges on MainActivity so WebView never reloads on rotation
  const desiredConfigChanges =
    'orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode';
  if (/android:configChanges="[^"]*"/.test(manifest)) {
    const updated = manifest.replace(
      /android:configChanges="[^"]*"/,
      `android:configChanges="${desiredConfigChanges}"`
    );
    if (updated !== manifest) {
      manifest = updated;
      changed = true;
    }
  } else {
    manifest = manifest.replace(
      'android:name=".MainActivity"',
      `android:name=".MainActivity"\n            android:configChanges="${desiredConfigChanges}"`
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('[Kanso Android] Updated AndroidManifest.xml (permissions, mediaPlayback service & rotation configChanges).');
  } else {
    console.log('[Kanso Android] AndroidManifest.xml is already configured.');
  }
} else {
  console.warn(`[Kanso Android] Could not find ${manifestPath}.`);
}

// 1b. Write crisp monochrome vector notification icon & KansoWebView layout override
if (fs.existsSync(androidResDir)) {
  const drawableDir = path.join(androidResDir, 'drawable');
  fs.mkdirSync(drawableDir, { recursive: true });
  const mediaIconXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M12,3v10.55c-0.59,-0.34 -1.27,-0.55 -2,-0.55 -2.21,0 -4,1.79 -4,4s1.79,4 4,4 4,-1.79 4,-4V7h4V3h-6z" />
</vector>
`;
  fs.writeFileSync(path.join(drawableDir, 'ic_kanso_media.xml'), mediaIconXml, 'utf8');

  const layoutDir = path.join(androidResDir, 'layout');
  fs.mkdirSync(layoutDir, { recursive: true });
  const layoutXml = `<?xml version="1.0" encoding="utf-8"?>
<androidx.coordinatorlayout.widget.CoordinatorLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <com.kanso.workspace.KansoWebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</androidx.coordinatorlayout.widget.CoordinatorLayout>
`;
  fs.writeFileSync(path.join(layoutDir, 'capacitor_bridge_layout_main.xml'), layoutXml, 'utf8');
  console.log('[Kanso Android] Generated capacitor_bridge_layout_main.xml using KansoWebView.');
}

// 2. Write KansoWebView.java (prevents Chromium AwContents from entering WasHidden / pausing video while backgroundAudioActive is true)
const kansoWebViewSource = `package com.kanso.workspace;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

public class KansoWebView extends CapacitorWebView {

    public KansoWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (MainActivity.backgroundAudioActive && visibility != View.VISIBLE) {
            super.onWindowVisibilityChanged(View.VISIBLE);
            return;
        }
        super.onWindowVisibilityChanged(visibility);
    }

    @Override
    public void dispatchWindowVisibilityChanged(int visibility) {
        if (MainActivity.backgroundAudioActive && visibility != View.VISIBLE) {
            super.dispatchWindowVisibilityChanged(View.VISIBLE);
            return;
        }
        super.dispatchWindowVisibilityChanged(visibility);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        if (MainActivity.backgroundAudioActive && visibility != View.VISIBLE) {
            super.onVisibilityChanged(changedView, View.VISIBLE);
            return;
        }
        super.onVisibilityChanged(changedView, visibility);
    }

    @Override
    public int getWindowVisibility() {
        if (MainActivity.backgroundAudioActive) {
            return View.VISIBLE;
        }
        return super.getWindowVisibility();
    }

    @Override
    public boolean isShown() {
        if (MainActivity.backgroundAudioActive) {
            return true;
        }
        return super.isShown();
    }

    @Override
    public void onPause() {
        if (MainActivity.backgroundAudioActive) {
            return;
        }
        super.onPause();
    }

    @Override
    public void pauseTimers() {
        if (MainActivity.backgroundAudioActive) {
            return;
        }
        super.pauseTimers();
    }
}
`;

fs.mkdirSync(javaPackageDir, { recursive: true });
fs.writeFileSync(kansoWebViewPath, kansoWebViewSource, 'utf8');
console.log('[Kanso Android] Generated KansoWebView.java for background audio WebContents visibility retention.');

// 3. Write KansoMediaPlaybackService.java (Foreground mediaPlayback service + MediaSession active strictly while streaming)
const mediaServiceSource = `package com.kanso.workspace;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.annotation.Nullable;

public class KansoMediaPlaybackService extends Service {

    public static final String CHANNEL_ID = "kanso_streamer_media";
    public static final int NOTIFICATION_ID = 4207;

    public static final String ACTION_START_OR_UPDATE = "com.kanso.workspace.MEDIA_START_OR_UPDATE";
    public static final String ACTION_STOP_SERVICE = "com.kanso.workspace.MEDIA_STOP_SERVICE";
    public static final String ACTION_NOTIFY_PAUSE = "com.kanso.workspace.MEDIA_NOTIFY_PAUSE";
    public static final String ACTION_NOTIFY_STOP = "com.kanso.workspace.MEDIA_NOTIFY_STOP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";

    public interface ControlListener {
        void onMediaControl(String action);
    }

    private static volatile ControlListener controlListener;

    public static void setControlListener(ControlListener listener) {
        controlListener = listener;
    }

    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureNotificationChannel();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kanso:streamer_audio");
            wakeLock.setReferenceCounted(false);
        }
        initMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START_OR_UPDATE;

        if (ACTION_STOP_SERVICE.equals(action)) {
            stopPlaybackService();
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_PAUSE.equals(action)) {
            ControlListener listener = controlListener;
            if (listener != null) {
                listener.onMediaControl("pause");
            }
            stopPlaybackService();
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_STOP.equals(action)) {
            ControlListener listener = controlListener;
            if (listener != null) {
                listener.onMediaControl("stop");
            }
            stopPlaybackService();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String subtitle = intent != null ? intent.getStringExtra(EXTRA_SUBTITLE) : null;
        if (title == null || title.trim().isEmpty()) {
            title = "Kanso Streamer";
        }
        if (subtitle == null || subtitle.trim().isEmpty()) {
            subtitle = "Playing in background";
        }

        acquireWakeLock();
        updateMediaSession(title, subtitle, true);
        Notification notification = buildNotification(title, subtitle);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopPlaybackService();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {
                // Ignore session cleanup errors
            }
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void initMediaSession() {
        try {
            mediaSession = new MediaSession(this, "KansoStreamerSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPause() {
                    ControlListener listener = controlListener;
                    if (listener != null) {
                        listener.onMediaControl("pause");
                    }
                    stopPlaybackService();
                }

                @Override
                public void onStop() {
                    ControlListener listener = controlListener;
                    if (listener != null) {
                        listener.onMediaControl("stop");
                    }
                    stopPlaybackService();
                }
            });
            mediaSession.setActive(true);
        } catch (Exception ignored) {
            mediaSession = null;
        }
    }

    private void updateMediaSession(String title, String subtitle, boolean playing) {
        if (mediaSession == null) return;
        try {
            MediaMetadata metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .build();
            mediaSession.setMetadata(metadata);

            int state = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_STOPPED;
            PlaybackState playbackState = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP)
                .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build();
            mediaSession.setPlaybackState(playbackState);
            mediaSession.setActive(playing);
        } catch (Exception ignored) {
            // Ignore session state errors
        }
    }

    private void stopPlaybackService() {
        MainActivity.backgroundAudioActive = false;
        updateMediaSession("Kanso Streamer", "Paused", false);
        releaseWakeLock();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                wakeLock.acquire();
            } catch (Exception ignored) {
                // Ignore wake lock failures on restricted OEMs
            }
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {
                // Already released
            }
        }
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Streamer Background Audio",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Keeps active Streamer View mixes playing when Kanso is in the background.");
                channel.setShowBadge(false);
                channel.setSound(null, null);
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String title, String subtitle) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent pauseIntent = new Intent(this, KansoMediaPlaybackService.class);
        pauseIntent.setAction(ACTION_NOTIFY_PAUSE);
        PendingIntent pausePendingIntent = PendingIntent.getService(
            this,
            1,
            pauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, KansoMediaPlaybackService.class);
        stopIntent.setAction(ACTION_NOTIFY_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            2,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int iconRes = getResources().getIdentifier("ic_kanso_media", "drawable", getPackageName());
        if (iconRes == 0) {
            iconRes = android.R.drawable.ic_media_play;
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        Notification.Action pauseAction = new Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_media_pause),
            "Pause",
            pausePendingIntent
        ).build();

        Notification.Action stopAction = new Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
            "Stop",
            stopPendingIntent
        ).build();

        builder
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setContentIntent(openPendingIntent)
            .addAction(pauseAction)
            .addAction(stopAction);

        if (mediaSession != null) {
            builder.setStyle(
                new Notification.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1)
            );
        }

        return builder.build();
    }
}
`;

fs.writeFileSync(mediaServicePath, mediaServiceSource, 'utf8');
console.log('[Kanso Android] Generated KansoMediaPlaybackService.java with MediaSession & notification controls.');

// 4. Write KansoSafPlugin.java (Android Storage Access Framework + System Chrome + Media Service bridge)
const safPluginSource = `package com.kanso.workspace;

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
import java.io.InputStream;
import java.util.ArrayDeque;
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
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/epub+zip",
            "application/pdf",
            "application/x-mobipocket-ebook",
            "application/vnd.amazon.mobi8-ebook",
            "application/octet-stream"
        });
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
                            } else if (isSupportedBookName(name)) {
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
        String title = call.getString("title", "Kanso Streamer");
        String subtitle = call.getString("subtitle", "Playing in background");

        Context ctx = getContext();
        Activity activity = getActivity();
        MainActivity.backgroundAudioActive = playing;

        if (playing) {
            if (activity != null && this.bridge != null && this.bridge.getWebView() != null) {
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
                ContextCompat.startForegroundService(ctx, serviceIntent);
            } catch (Exception ignored) {
                // Guard against OS foreground-start restrictions if app is already closing
            }
            if (
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
`;

fs.writeFileSync(safPluginPath, safPluginSource, 'utf8');
console.log('[Kanso Android] Generated KansoSafPlugin.java with SAF, System Chrome & Media Service bridge.');

// 5. Patch MainActivity.java for KansoSafPlugin registration, cutout-safe solid status bar insets,
//    zero WebView stretch overscroll, YouTube embeds & playback-scoped background audio keep-alive
const mainActivitySource = `package com.kanso.workspace;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public static final String CHROME_PREFS_NAME = "kanso_chrome_prefs";
    public static final String CHROME_COLOR_KEY = "chrome_bg_color";
    public static final String CHROME_DARK_KEY = "chrome_is_dark";
    public static volatile boolean backgroundAudioActive = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KansoSafPlugin.class);
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences(CHROME_PREFS_NAME, Context.MODE_PRIVATE);
        int initialColor = prefs.getInt(CHROME_COLOR_KEY, Color.WHITE);
        boolean initialDark = prefs.getBoolean(CHROME_DARK_KEY, false);
        applySystemChrome(this, initialColor, initialDark);

        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                int bottomInset = Math.max(bars.bottom, ime.bottom);
                v.setPadding(bars.left, bars.top, bars.right, bottomInset);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(contentView);
        }

        configureWebViewForMedia();
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewForMedia();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWebViewForMedia();
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.requestApplyInsets(contentView);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) {
            keepWebViewAliveIfPlaying();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAliveIfPlaying();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAliveIfPlaying();
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) {
            backgroundAudioActive = false;
            try {
                stopService(new Intent(this, KansoMediaPlaybackService.class));
            } catch (Exception ignored) {
                // Safe cleanup
            }
        }
        super.onDestroy();
    }

    private void keepWebViewAliveIfPlaying() {
        if (!backgroundAudioActive || this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }
        final WebView webView = this.bridge.getWebView();
        webView.onResume();
        webView.resumeTimers();
        webView.dispatchWindowVisibilityChanged(View.VISIBLE);
        webView.post(() -> {
            if (backgroundAudioActive) {
                webView.onResume();
                webView.resumeTimers();
                webView.dispatchWindowVisibilityChanged(View.VISIBLE);
            }
        });
        webView.postDelayed(() -> {
            if (backgroundAudioActive) {
                webView.onResume();
                webView.resumeTimers();
                webView.dispatchWindowVisibilityChanged(View.VISIBLE);
            }
        }, 250);
    }

    public static void applySystemChrome(Activity activity, int colorInt, boolean isDark) {
        if (activity == null) return;
        Window window = activity.getWindow();
        if (window != null) {
            window.setStatusBarColor(colorInt);
            window.setNavigationBarColor(colorInt);
            View decor = window.getDecorView();
            if (decor != null) {
                decor.setBackgroundColor(colorInt);
                WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, decor);
                controller.setAppearanceLightStatusBars(!isDark);
                controller.setAppearanceLightNavigationBars(!isDark);
            }
        }
        View contentView = activity.findViewById(android.R.id.content);
        if (contentView != null) {
            contentView.setBackgroundColor(colorInt);
            ViewCompat.requestApplyInsets(contentView);
        }
    }

    private void configureWebViewForMedia() {
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }
        WebView webView = this.bridge.getWebView();
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalFadingEdgeEnabled(false);
        webView.setHorizontalFadingEdgeEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
    }
}
`;

fs.writeFileSync(mainActivityPath, mainActivitySource, 'utf8');
console.log('[Kanso Android] Configured MainActivity.java with KansoSafPlugin, KansoWebView, cutout-safe insets & background media keep-alive.');

// 6. Install Kanso Android Launcher & Adaptive Icons
const iconsSourceDir = path.join(projectRoot, 'resources/android-icons');
if (fs.existsSync(iconsSourceDir) && fs.existsSync(androidResDir)) {
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  for (const density of densities) {
    const srcDir = path.join(iconsSourceDir, `mipmap-${density}`);
    const dstDir = path.join(androidResDir, `mipmap-${density}`);
    if (!fs.existsSync(srcDir)) continue;
    fs.mkdirSync(dstDir, { recursive: true });
    for (const file of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const srcFile = path.join(srcDir, file);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(dstDir, file));
      }
    }
  }

  // Set adaptive icon background color (#B45309) in values/ic_launcher_background.xml
  const valuesDir = path.join(androidResDir, 'values');
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(
    path.join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#B45309</color>\n</resources>\n`,
    'utf8'
  );

  // Set adaptive icon XML in mipmap-anydpi-v26/ so Android 8+ uses our clean adaptive background & foreground
  const anydpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
  fs.mkdirSync(anydpiDir, { recursive: true });
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveXml, 'utf8');
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveXml, 'utf8');

  console.log('[Kanso Android] Installed Kanso launcher & adaptive icons across all mipmap densities.');
}

console.log('[Kanso Android] Done! Run `npm run cap:sync` and `npm run cap:open` to launch in Android Studio.');
