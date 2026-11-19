import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ColorMode, ThemeId } from '../types';

/**
 * Exact surface hex colors matching Kanso's 5 themes x Light/Dark modes (--bg-surface)
 * so the Android status bar blends seamlessly with Kanso's top bar.
 */
const STATUS_BAR_SURFACE_COLORS: Record<ThemeId, Record<ColorMode, string>> = {
  paper: {
    light: '#ffffff',
    dark: '#1e1b18',
  },
  neon: {
    light: '#ffffff',
    dark: '#101421',
  },
  cyberpunk: {
    light: '#ffffff',
    dark: '#15141e',
  },
  nordic: {
    light: '#ffffff',
    dark: '#222935',
  },
  emerald: {
    light: '#ffffff',
    dark: '#121f1a',
  },
};

/**
 * Synchronizes the mobile browser theme-color meta tag and native Android/iOS
 * StatusBar background & icon contrast whenever Kanso's theme or color mode changes.
 * Safe no-op for native APIs when running on the web.
 */
export async function syncNativeStatusBar(
  theme: ThemeId,
  colorMode: ColorMode
): Promise<void> {
  const bgColor = STATUS_BAR_SURFACE_COLORS[theme]?.[colorMode] ?? '#ffffff';

  // Keep <meta name="theme-color"> synced on both web and Android WebView
  if (typeof document !== 'undefined') {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = bgColor;
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: bgColor });
    // In Capacitor StatusBar: Style.Dark renders LIGHT icons (for dark backgrounds);
    // Style.Light renders DARK icons (for light backgrounds).
    await StatusBar.setStyle({
      style: colorMode === 'dark' ? Style.Dark : Style.Light,
    });
  } catch {
    // Ignore if StatusBar plugin is unavailable on the current platform
  }
}
