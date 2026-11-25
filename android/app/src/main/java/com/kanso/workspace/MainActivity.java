package com.kanso.workspace;

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
import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    public static final String CHROME_PREFS_NAME = "kanso_chrome_prefs";
    public static final String CHROME_COLOR_KEY = "chrome_bg_color";
    public static final String CHROME_DARK_KEY = "chrome_is_dark";
    public static volatile boolean backgroundAudioActive = false;
    private static volatile WeakReference<MainActivity> activeInstance = new WeakReference<>(null);
    private boolean lastImeVisible = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KansoSafPlugin.class);
        super.onCreate(savedInstanceState);
        activeInstance = new WeakReference<>(this);

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
                boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime()) && ime.bottom > 0;
                if (imeVisible != lastImeVisible) {
                    lastImeVisible = imeVisible;
                    dispatchImeChangeToWebView(imeVisible);
                }
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return new WindowInsetsCompat.Builder(windowInsets)
                    .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .setVisible(WindowInsetsCompat.Type.ime(), false)
                    .build();
            });
            ViewCompat.requestApplyInsets(contentView);
        }

        configureWebViewForMedia();
    }

    private void dispatchImeChangeToWebView(boolean open) {
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }
        final WebView webView = this.bridge.getWebView();
        final String js = "window.dispatchEvent(new CustomEvent('kanso:ime-change', { detail: { open: " + open + " } }));";
        webView.post(() -> webView.evaluateJavascript(js, null));
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
        if (activeInstance.get() == this) {
            activeInstance = new WeakReference<>(null);
        }
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

    public static void wakeWebViewForBackgroundPlayback() {
        backgroundAudioActive = true;
        MainActivity activity = activeInstance.get();
        if (activity == null) {
            return;
        }
        activity.runOnUiThread(activity::keepWebViewAliveIfPlaying);
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
