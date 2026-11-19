import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kanso.workspace',
  appName: 'Kanso',
  webDir: 'dist',
  server: {
    // Serves the local bundle over https://localhost so YouTube IFrame API (origin & postMessage)
    // and IndexedDB / Web Crypto APIs behave consistently inside Android WebView.
    androidScheme: 'https',
    allowNavigation: [
      'www.youtube.com',
      '*.youtube.com',
      'www.youtube-nocookie.com',
      'youtu.be',
      '*.googlevideo.com',
      'noembed.com',
      'api.github.com',
    ],
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    backgroundColor: '#faf8f5',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
