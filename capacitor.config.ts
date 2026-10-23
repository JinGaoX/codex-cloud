import type { CapacitorConfig } from '@capacitor/cli';

/** All application code ships inside the app. Never set a remote server.url. */
const config: CapacitorConfig = {
  appId: 'org.libretv.personal',
  appName: 'LibreTV',
  webDir: 'native-dist',
  backgroundColor: '#0b101a',
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // Preserve normal fetch/AbortSignal and media behavior. No global HTTP patch.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
