#!/usr/bin/env node
/**
 * Idempotent post-setup configurator for Kanso's Capacitor Android project.
 * Run once after `npx cap add android` (via `npm run cap:configure-android`).
 *
 * Applies:
 *  1. AndroidManifest.xml: INTERNET + WAKE_LOCK permissions, hardwareAcceleration,
 *     and portrait/landscape configChanges preservation so playing YouTube streams
 *     and active UI state survive screen rotation without reloading.
 *  2. MainActivity.java: WebView media & YouTube embed configuration
 *     (mediaPlaybackRequiresUserGesture=false, mixed content compatibility,
 *     DOM storage, and background audio preservation hooks).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const androidRoot = path.join(projectRoot, 'android');
const manifestPath = path.join(androidRoot, 'app/src/main/AndroidManifest.xml');
const mainActivityPath = path.join(
  androidRoot,
  'app/src/main/java/com/kanso/workspace/MainActivity.java'
);

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

  // Ensure hardwareAccelerated="true" on <application>
  if (!manifest.includes('android:hardwareAccelerated=')) {
    manifest = manifest.replace(
      '<application',
      '<application\n        android:hardwareAccelerated="true"'
    );
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
    console.log('[Kanso Android] Updated AndroidManifest.xml (permissions + rotation configChanges).');
  } else {
    console.log('[Kanso Android] AndroidManifest.xml is already configured.');
  }
} else {
  console.warn(`[Kanso Android] Could not find ${manifestPath}.`);
}

// 2. Patch MainActivity.java for YouTube embeds & uninterrupted background audio
const mainActivitySource = `package com.kanso.workspace;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWebViewForMedia();
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewForMedia();
    }

    @Override
    public void onPause() {
        super.onPause();
        // Keep the WebView active when backgrounded so YouTube Streamer audio
        // can continue playing without being paused immediately by WebView lifecycle hooks.
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.onResume();
            webView.resumeTimers();
        }
    }

    private void configureWebViewForMedia() {
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
    }
}
`;

fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true });
fs.writeFileSync(mainActivityPath, mainActivitySource, 'utf8');
console.log('[Kanso Android] Configured MainActivity.java for YouTube embeds & background audio.');

// 3. Install Kanso Android Launcher & Adaptive Icons
const iconsSourceDir = path.join(projectRoot, 'resources/android-icons');
const androidResDir = path.join(androidRoot, 'app/src/main/res');
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
