# Kanso — Ultimate Personal Productivity Workspace

An offline-first personal productivity workspace uniting **Focus**, **Timeline**, **Habits**, **Notes**, **Events**, **Lists**, an offline **Library & Ebook Reader** (EPUB / PDF / MOBI), and a multi-stream **YouTube Streamer & Vault** — with 5 Light/Dark themes and manual GitHub Gist sync.

Pre-configured with **Capacitor** (`com.kanso.workspace`) so you can wrap and deploy Kanso directly to your Android phone via Android Studio.

---

## Local Web Development

```bash
npm install
npm run dev       # Starts Vite dev server on http://localhost:3000
npm run build     # Builds production bundle to dist/
npm run lint      # Runs TypeScript type-checking (tsc --noEmit)
```

---

## Building & Porting Kanso to Android (Capacitor + Android Studio)

Capacitor packages (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/status-bar`), `capacitor.config.ts`, dynamic theme-synced Android StatusBar handling, and notch/gesture safe-area insets are already wired into this repository.

### Prerequisites

- **Node.js** 20+ and **npm**
- **Android Studio** (latest stable, with Android SDK & JDK 17/21 installed)
- An Android phone with **Developer Options → USB Debugging** enabled (or an Android Emulator)

---

### Step 1 — First-Time Android Project Setup

Run these commands once from the project root on your local machine:

```bash
# 1. Install dependencies
npm install

# 2. Build the production web assets into dist/
npm run build

# 3. Generate the native android/ project folder
npx cap add android

# 4. Apply Kanso's Android WebView, YouTube embed, background audio,
#    and portrait/landscape rotation preservation config
npm run cap:configure-android

# 5. Sync web assets & plugins into the native Android project
npx cap sync android
```

> **Shortcut:** Steps 3 & 4 can also be run together via `npm run cap:add:android`.

---

### Step 2 — Open & Run in Android Studio

```bash
npx cap open android
# (or: npm run cap:open)
```

Inside **Android Studio**:

1. Wait for Gradle Sync to finish automatically.
2. Connect your Android phone via USB (or start an AVD emulator).
3. Select your device in the top toolbar and click **Run ▶** to install and launch **Kanso**.

To build an installable APK for your phone:

- In Android Studio, go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**, then copy the generated APK from `android/app/build/outputs/apk/debug/` onto your device.

---

### Step 3 — Everyday Update Workflow

Whenever you edit web code and want to push the changes to your Android build:

```bash
npm run build && npx cap sync
```

_(Or use the shortcut `npm run cap:sync`, then hit **Run ▶** in Android Studio.)_

---

## What `npm run cap:configure-android` Configures

For full transparency (or if you prefer applying edits manually), `scripts/configure-android.mjs` applies two targeted upgrades inside `android/app/src/main/`:

### 1. `AndroidManifest.xml`

- Ensures `INTERNET` and `WAKE_LOCK` permissions are declared.
- Enables `android:hardwareAccelerated="true"` for smooth YouTube embeds and PDF rendering.
- Configures `MainActivity` with:
  ```xml
  android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
  ```
  so rotating between **portrait and landscape** never reloads the WebView or interrupts playing streams.

### 2. `MainActivity.java`

Configures the Android WebView for smooth multi-stream YouTube embeds and background playback:

- `setMediaPlaybackRequiresUserGesture(false)`
- `setDomStorageEnabled(true)` & `setJavaScriptEnabled(true)`
- `setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE)`
- Keeps WebView timers/media resumed in `onPause()` so Streamer audio continues smoothly when switching screens.

---

## Android Device Tips

- **Status Bar & Cutouts**: Kanso automatically syncs the native Android status bar background color and icon contrast across all 10 palettes (Paper, Neon, Cyberpunk, Nordic, Emerald × Light/Dark) and applies `viewport-fit=cover` safe-area padding for camera notches and bottom gesture bars.
- **Uninterrupted Background Audio (Streamer)**: Aggressive OEM battery savers (Samsung, Xiaomi, OnePlus, Pixel) may suspend background WebView audio after several minutes with the screen off. On your phone, open **Settings → Apps → Kanso → Battery** and select **Unrestricted** so subliminals and frequencies keep playing reliably in the background.
- **GitHub Gist Sync**: Because `capacitor.config.ts` serves Kanso from `https://localhost` (`androidScheme: 'https'`) and allows `api.github.com`, your personal access token and manual Gist Push/Pull work identically on Android and desktop.
