package com.kanso.workspace;

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
    public static final String ACTION_NOTIFY_PLAY = "com.kanso.workspace.MEDIA_NOTIFY_PLAY";
    public static final String ACTION_NOTIFY_PAUSE = "com.kanso.workspace.MEDIA_NOTIFY_PAUSE";
    public static final String ACTION_NOTIFY_NEXT = "com.kanso.workspace.MEDIA_NOTIFY_NEXT";
    public static final String ACTION_NOTIFY_PREV = "com.kanso.workspace.MEDIA_NOTIFY_PREV";
    public static final String ACTION_NOTIFY_STOP = "com.kanso.workspace.MEDIA_NOTIFY_STOP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";
    public static final String EXTRA_PLAYING = "playing";
    public static final String EXTRA_SHOW_TRACK_CONTROLS = "showTrackControls";

    public interface ControlListener {
        void onMediaControl(String action);
    }

    private static volatile ControlListener controlListener;

    public static void setControlListener(ControlListener listener) {
        controlListener = listener;
    }

    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;
    private String lastTitle = "Kanso Media";
    private String lastSubtitle = "Playing in background";
    private boolean lastShowTrackControls = false;

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

        if (ACTION_NOTIFY_PLAY.equals(action)) {
            ControlListener listener = controlListener;
            if (listener != null) {
                listener.onMediaControl("play");
            }
            MainActivity.backgroundAudioActive = true;
            acquireWakeLock();
            updateMediaSession(lastTitle, lastSubtitle, true);
            startServiceForeground(buildNotification(lastTitle, lastSubtitle, true, lastShowTrackControls));
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_PAUSE.equals(action)) {
            ControlListener listener = controlListener;
            if (listener != null) {
                listener.onMediaControl("pause");
            }
            if (lastShowTrackControls) {
                MainActivity.backgroundAudioActive = false;
                releaseWakeLock();
                updateMediaSession(lastTitle, lastSubtitle, false);
                startServiceForeground(buildNotification(lastTitle, lastSubtitle, false, true));
            } else {
                stopPlaybackService();
            }
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_NEXT.equals(action)) {
            ControlListener listener = controlListener;
            if (listener != null) {
                listener.onMediaControl("next");
            }
            return START_NOT_STICKY;
        }

        if (ACTION_NOTIFY_PREV.equals(action)) {
            ControlListener listener = controlListener;
            if (listener != null) {
                listener.onMediaControl("previous");
            }
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
        boolean playing = intent == null || intent.getBooleanExtra(EXTRA_PLAYING, true);
        boolean showTrackControls = intent != null && intent.getBooleanExtra(EXTRA_SHOW_TRACK_CONTROLS, false);

        if (title == null || title.trim().isEmpty()) {
            title = "Kanso Media";
        }
        if (subtitle == null || subtitle.trim().isEmpty()) {
            subtitle = playing ? "Playing in background" : "Paused";
        }
        lastTitle = title;
        lastSubtitle = subtitle;
        lastShowTrackControls = showTrackControls;

        if (playing) {
            acquireWakeLock();
        } else {
            releaseWakeLock();
        }
        updateMediaSession(title, subtitle, playing);
        startServiceForeground(buildNotification(title, subtitle, playing, showTrackControls));

        return START_NOT_STICKY;
    }

    private void startServiceForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
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
            mediaSession = new MediaSession(this, "KansoMediaSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    ControlListener listener = controlListener;
                    if (listener != null) {
                        listener.onMediaControl("play");
                    }
                    MainActivity.backgroundAudioActive = true;
                    acquireWakeLock();
                    updateMediaSession(lastTitle, lastSubtitle, true);
                    startServiceForeground(buildNotification(lastTitle, lastSubtitle, true, lastShowTrackControls));
                }

                @Override
                public void onPause() {
                    ControlListener listener = controlListener;
                    if (listener != null) {
                        listener.onMediaControl("pause");
                    }
                    if (lastShowTrackControls) {
                        MainActivity.backgroundAudioActive = false;
                        releaseWakeLock();
                        updateMediaSession(lastTitle, lastSubtitle, false);
                        startServiceForeground(buildNotification(lastTitle, lastSubtitle, false, true));
                    } else {
                        stopPlaybackService();
                    }
                }

                @Override
                public void onSkipToNext() {
                    ControlListener listener = controlListener;
                    if (listener != null) {
                        listener.onMediaControl("next");
                    }
                }

                @Override
                public void onSkipToPrevious() {
                    ControlListener listener = controlListener;
                    if (listener != null) {
                        listener.onMediaControl("previous");
                    }
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

            int state = playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
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
        MainActivity.backgroundAudioActive = false;
        updateMediaSession(lastTitle, "Paused", false);
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

    private Notification buildNotification(String title, String subtitle, boolean playing, boolean showTrackControls) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent prevIntent = new Intent(this, KansoMediaPlaybackService.class);
        prevIntent.setAction(ACTION_NOTIFY_PREV);
        PendingIntent prevPendingIntent = PendingIntent.getService(
            this,
            3,
            prevIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent playPauseIntent = new Intent(this, KansoMediaPlaybackService.class);
        playPauseIntent.setAction(playing ? ACTION_NOTIFY_PAUSE : ACTION_NOTIFY_PLAY);
        PendingIntent playPausePendingIntent = PendingIntent.getService(
            this,
            1,
            playPauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent nextIntent = new Intent(this, KansoMediaPlaybackService.class);
        nextIntent.setAction(ACTION_NOTIFY_NEXT);
        PendingIntent nextPendingIntent = PendingIntent.getService(
            this,
            4,
            nextIntent,
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
