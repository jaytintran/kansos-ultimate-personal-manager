package com.kanso.workspace;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
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
import java.lang.ref.WeakReference;

public class KansoMediaPlaybackService extends Service {

    public static final String CHANNEL_ID = "kanso_streamer_media";
    public static final int NOTIFICATION_ID = 4207;

    public static final String ACTION_START_OR_UPDATE = "com.kanso.workspace.MEDIA_START_OR_UPDATE";
    public static final String ACTION_STOP_SERVICE = "com.kanso.workspace.MEDIA_STOP_SERVICE";
    public static final String ACTION_NOTIFY_PLAY = "com.kanso.workspace.MEDIA_NOTIFY_PLAY";
    public static final String ACTION_NOTIFY_PAUSE = "com.kanso.workspace.MEDIA_NOTIFY_PAUSE";
    public static final String ACTION_NOTIFY_NEXT = "com.kanso.workspace.MEDIA_NOTIFY_NEXT";
    public static final String ACTION_NOTIFY_PREV = "com.kanso.workspace.MEDIA_NOTIFY_PREV";
    public static final String ACTION_NOTIFY_STOP = "com.kanso.workspace.MEDIA_NOTIFY_STOP";
    public static final String ACTION_NOTIFY_DISMISS = "com.kanso.workspace.MEDIA_NOTIFY_DISMISS";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";
    public static final String EXTRA_PLAYING = "playing";
    public static final String EXTRA_SHOW_TRACK_CONTROLS = "showTrackControls";
    public static final String EXTRA_SOURCE = "source";

    public interface ControlListener {
        void onMediaControl(String action, String source);
    }

    private static volatile ControlListener controlListener;
    private static volatile WeakReference<KansoMediaPlaybackService> activeService = new WeakReference<>(null);
    private static volatile String lastSource = "";

    public static void setControlListener(ControlListener listener) {
        controlListener = listener;
    }

    public static String getActiveSource() {
        return lastSource != null ? lastSource : "";
    }

    private static void dispatchMediaControl(String action) {
        ControlListener listener = controlListener;
        if (listener != null) {
            listener.onMediaControl(action, getActiveSource());
        }
    }

    public static class MediaActionReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            KansoMediaPlaybackService svc = activeService.get();

            if (ACTION_NOTIFY_PAUSE.equals(action)) {
                if (svc != null) {
                    svc.handlePauseCommand(true);
                } else {
                    MainActivity.backgroundAudioActive = false;
                    dispatchMediaControl("pause");
                }
                return;
            }

            if (ACTION_NOTIFY_STOP.equals(action) || ACTION_NOTIFY_DISMISS.equals(action)) {
                String jsAction = ACTION_NOTIFY_DISMISS.equals(action) ? "dismiss" : "stop";
                if (svc != null) {
                    svc.handleStopOrDismissCommand(jsAction);
                } else {
                    MainActivity.backgroundAudioActive = false;
                    dispatchMediaControl(jsAction);
                    NotificationManager manager =
                        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (manager != null) {
                        manager.cancel(NOTIFICATION_ID);
                    }
                    try {
                        context.stopService(new Intent(context, KansoMediaPlaybackService.class));
                    } catch (Exception ignored) {
                        // Safe no-op if already stopped
                    }
                }
            }
        }
    }

    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;
    private String lastTitle = "Kanso Media";
    private String lastSubtitle = "Playing in background";
    private String lastPlayingSubtitle = "Playing in background";
    private boolean lastPlaying = false;
    private boolean lastShowTrackControls = false;

    @Override
    public void onCreate() {
        super.onCreate();
        activeService = new WeakReference<>(this);
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

        if (ACTION_NOTIFY_PLAY.equals(action)) {
            handlePlayCommand(true);
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_PAUSE.equals(action)) {
            // Fulfill foreground-start safety if invoked as foreground service, then detach cleanly
            Notification notif = buildNotification(lastTitle, "Paused", false, lastShowTrackControls);
            startServiceForeground(notif);
            handlePauseCommand(true);
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_NEXT.equals(action)) {
            MainActivity.wakeWebViewForBackgroundPlayback();
            lastPlaying = true;
            acquireWakeLock();
            updateMediaSession(lastTitle, lastPlayingSubtitle, true);
            startServiceForeground(buildNotification(lastTitle, lastPlayingSubtitle, true, lastShowTrackControls));
            dispatchMediaControl("next");
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_PREV.equals(action)) {
            MainActivity.wakeWebViewForBackgroundPlayback();
            lastPlaying = true;
            acquireWakeLock();
            updateMediaSession(lastTitle, lastPlayingSubtitle, true);
            startServiceForeground(buildNotification(lastTitle, lastPlayingSubtitle, true, lastShowTrackControls));
            dispatchMediaControl("previous");
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_STOP.equals(action)) {
            handleStopOrDismissCommand("stop");
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_DISMISS.equals(action)) {
            handleStopOrDismissCommand("dismiss");
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String subtitle = intent != null ? intent.getStringExtra(EXTRA_SUBTITLE) : null;
        String source = intent != null ? intent.getStringExtra(EXTRA_SOURCE) : null;
        boolean playing = intent == null || intent.getBooleanExtra(EXTRA_PLAYING, true);
        boolean showTrackControls = intent != null && intent.getBooleanExtra(EXTRA_SHOW_TRACK_CONTROLS, false);

        if (title == null || title.trim().isEmpty()) {
            title = !lastTitle.isEmpty() ? lastTitle : "Kanso Media";
        }
        if (subtitle == null || subtitle.trim().isEmpty()) {
            subtitle = playing ? "Playing in background" : "Paused";
        }
        if (source != null && !source.trim().isEmpty()) {
            lastSource = source.trim();
        }
        lastTitle = title;
        lastSubtitle = subtitle;
        if (playing) {
            lastPlayingSubtitle = subtitle;
        }
        lastPlaying = playing;
        lastShowTrackControls = showTrackControls;

        updateMediaSession(title, subtitle, playing);
        Notification notification = buildNotification(title, subtitle, playing, showTrackControls);
        if (playing) {
            acquireWakeLock();
            startServiceForeground(notification);
        } else {
            releaseWakeLock();
            // Fulfill startForegroundService contract, then detach so banner persists and stays swipeable
            startServiceForeground(notification);
            detachForegroundKeepingNotification(notification);
        }

        return START_NOT_STICKY;
    }

    private void handlePlayCommand(boolean notifyJs) {
        MainActivity.wakeWebViewForBackgroundPlayback();
        if (notifyJs) {
            dispatchMediaControl("play");
        }
        lastPlaying = true;
        String resumeSubtitle =
            lastPlayingSubtitle != null && !lastPlayingSubtitle.trim().isEmpty()
                ? lastPlayingSubtitle
                : "Playing in background";
        lastSubtitle = resumeSubtitle;
        acquireWakeLock();
        updateMediaSession(lastTitle, resumeSubtitle, true);
        startServiceForeground(buildNotification(lastTitle, resumeSubtitle, true, lastShowTrackControls));
    }

    private void handlePauseCommand(boolean notifyJs) {
        if (notifyJs) {
            dispatchMediaControl("pause");
        }
        lastPlaying = false;
        MainActivity.backgroundAudioActive = false;
        releaseWakeLock();
        String pausedSubtitle = "Paused";
        lastSubtitle = pausedSubtitle;
        updateMediaSession(lastTitle, pausedSubtitle, false);
        Notification pausedNotification = buildNotification(lastTitle, pausedSubtitle, false, lastShowTrackControls);
        detachForegroundKeepingNotification(pausedNotification);
    }

    private void handleStopOrDismissCommand(String jsAction) {
        dispatchMediaControl(jsAction);
        stopPlaybackService();
    }

    private void startServiceForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void detachForegroundKeepingNotification(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_DETACH);
        } else {
            stopForeground(false);
        }
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopPlaybackService();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (activeService.get() == this) {
            activeService = new WeakReference<>(null);
        }
        lastSource = "";
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
            mediaSession = new MediaSession(this, "KansoMediaSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    handlePlayCommand(true);
                }

                @Override
                public void onPause() {
                    handlePauseCommand(true);
                }

                @Override
                public void onSkipToNext() {
                    MainActivity.wakeWebViewForBackgroundPlayback();
                    dispatchMediaControl("next");
                }

                @Override
                public void onSkipToPrevious() {
                    MainActivity.wakeWebViewForBackgroundPlayback();
                    dispatchMediaControl("previous");
                }

                @Override
                public void onStop() {
                    handleStopOrDismissCommand("stop");
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

            int state = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_STOP;
            if (lastShowTrackControls) {
                actions |= PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            }
            PlaybackState playbackState = new PlaybackState.Builder()
                .setActions(actions)
                .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1.0f : 0.0f)
                .build();
            mediaSession.setPlaybackState(playbackState);
            mediaSession.setActive(true);
        } catch (Exception ignored) {
            // Ignore session state errors
        }
    }

    private void stopPlaybackService() {
        lastPlaying = false;
        lastSource = "";
        MainActivity.backgroundAudioActive = false;
        updateMediaSession(lastTitle, "Paused", false);
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
            } catch (Exception ignored) {
                // Ignore
            }
        }
        releaseWakeLock();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
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
                    "Background Audio & Streams",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Keeps active Audio tracks and Streamer mixes playing when Kanso is in the background.");
                channel.setShowBadge(false);
                channel.setSound(null, null);
                manager.createNotificationChannel(channel);
            }
        }
    }

    private PendingIntent buildForegroundServicePendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, KansoMediaPlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return PendingIntent.getForegroundService(this, requestCode, intent, flags);
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private PendingIntent buildBroadcastActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaActionReceiver.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private Notification buildNotification(String title, String subtitle, boolean playing, boolean showTrackControls) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent prevPendingIntent = buildForegroundServicePendingIntent(ACTION_NOTIFY_PREV, 3);
        PendingIntent playPausePendingIntent = playing
            ? buildBroadcastActionPendingIntent(ACTION_NOTIFY_PAUSE, 1)
            : buildForegroundServicePendingIntent(ACTION_NOTIFY_PLAY, 1);
        PendingIntent nextPendingIntent = buildForegroundServicePendingIntent(ACTION_NOTIFY_NEXT, 4);
        PendingIntent stopPendingIntent = buildBroadcastActionPendingIntent(ACTION_NOTIFY_STOP, 2);
        PendingIntent dismissPendingIntent = buildBroadcastActionPendingIntent(ACTION_NOTIFY_DISMISS, 5);

        int iconRes = getResources().getIdentifier("ic_kanso_media", "drawable", getPackageName());
        if (iconRes == 0) {
            iconRes = android.R.drawable.ic_media_play;
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        Notification.Action playPauseAction = new Notification.Action.Builder(
            Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
            playing ? "Pause" : "Play",
            playPausePendingIntent
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
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setDeleteIntent(dismissPendingIntent)
            .setContentIntent(openPendingIntent);

        if (showTrackControls) {
            Notification.Action prevAction = new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                "Previous",
                prevPendingIntent
            ).build();
            Notification.Action nextAction = new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_next),
                "Next",
                nextPendingIntent
            ).build();

            builder
                .addAction(prevAction)
                .addAction(playPauseAction)
                .addAction(nextAction)
                .addAction(stopAction);

            if (mediaSession != null) {
                builder.setStyle(
                    new Notification.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2)
                );
            }
        } else {
            builder
                .addAction(playPauseAction)
                .addAction(stopAction);

            if (mediaSession != null) {
                builder.setStyle(
                    new Notification.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1)
                );
            }
        }

        return builder.build();
    }
}
