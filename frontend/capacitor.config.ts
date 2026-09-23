import type { CapacitorConfig } from '@capacitor/cli'

/**
 * اپ موبایل (Android / iOS) — همان فرانت‌اند React داخل Capacitor.
 * فایل‌های وب از dist/ داخل خود اپ بسته‌بندی می‌شوند (نه بارگذاری از سرور)،
 * و فقط درخواست‌های API به سرور (VITE_API_BASE_URL در .env.mobile) می‌روند.
 *
 * ساخت: npm run mobile:build   (vite build --mode mobile && cap sync)
 */
const config: CapacitorConfig = {
  appId: 'ir.barouco.pms',
  appName: 'همین',
  webDir: 'dist',
  android: {
    // فقط HTTPS — سرور تولیدی باید گواهی SSL معتبر داشته باشد
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#16324f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#16324f',
      overlaysWebView: false,
    },
  },
}

export default config
