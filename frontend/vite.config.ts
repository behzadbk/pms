import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * پیشوندهای /api/<service> که در Production از طریق infra/k8s/base/ingress.yaml
 * به هر میکروسرویس route می‌شوند (rewrite-target: /$2 — یعنی پیشوند حذف و بقیه‌ی
 * مسیر عیناً به سرویس مقصد فرستاده می‌شود). همین نگاشت را اینجا برای dev سرور تکرار
 * می‌کنیم تا بدون نیاز به Nginx/Ingress محلی، `npm run dev` مستقیماً به سرویس‌هایی که
 * روی پورت‌های خودشان (`npm run start:dev` در backend/<service>) در حال اجرا هستند وصل شود.
 * notification-service (۳۰۰۶): اشتراک Web Push (/api/notification/push/*).
 */
const serviceProxy = {
  identity: 3001,
  property: 3002,
  facility: 3003,
  finance: 3004,
  guard: 3005,
  notification: 3006,
  audit: 3007,
  fnb: 3008,
} as const

const apiProxy = Object.fromEntries(
  Object.entries(serviceProxy).map(([service, port]) => [
    `/api/${service}`,
    {
      target: `http://localhost:${port}`,
      changeOrigin: true,
      ws: true, // تقویم زنده (facility) و پنل ترافیک/نگهبانی زنده (guard) از WebSocket استفاده می‌کنند
      rewrite: (path: string) => path.replace(new RegExp(`^/api/${service}`), ''),
    },
  ]),
)

const buildId = `${new Date().toISOString().slice(0, 16).replace('T', ' ')}${process.env.VITE_BUILD_SHA ? ' · ' + String(process.env.VITE_BUILD_SHA).slice(0, 7) : ''}`

export default defineConfig(({ mode }) => ({
  define: { __BUILD_ID__: JSON.stringify(buildId), __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  plugins: [
    react(),
    tailwindcss(),
    // داخل اپ موبایل (Capacitor، --mode mobile) فایل‌ها از قبل داخل اپ هستند —
    // service worker لازم نیست و فقط باعث کش‌شدن نسخه‌ی قدیمی بعد از آپدیت اپ می‌شود.
    mode !== 'mobile' && VitePWA({
      registerType: 'autoUpdate',
      // ثبت و به‌روزرسانی سرویس‌ورکر را خودمان در main.tsx انجام می‌دهیم (ریلود خودکار بعد از نسخه‌ی جدید)
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'همین — سامانه مدیریت ساختمان',
        short_name: 'همین',
        description: 'سامانه جامع مدیریت مجتمع مسکونی: شارژ و پرداخت، رزرو مشاعات، نگهبانی و شفافیت مالی',
        lang: 'fa',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f5f7',
        theme_color: '#16324f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // اسناد و assetهای استاتیک ساخته‌شده توسط Vite (فایل‌نام hash‌دار) — CacheFirst پیش‌فرض Workbox برای precache
        globPatterns: ['**/*.{js,css,html,woff2,woff,png,svg}'],
        // مهم: NavigationRoute فایل fallback را برای *همه‌ی* ناوبری‌ها سرو می‌کند، نه فقط در حالت آفلاین.
        // مقدار قبلی '/offline.html' باعث می‌شد بعد از نصب service worker، هر رفرش یا باز کردن
        // اپ نصب‌شده (حتی با اینترنت وصل) صفحه‌ی «آفلاین هستید» نشان دهد. پوسته‌ی SPA درست است.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // دریافت و کلیک اعلان‌های Web Push (public/push-sw.js)
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          // پاسخ‌های API عمداً کش نمی‌شوند: سیستم آنلاین است و منو/موجودی/سفارش/شارژ باید همیشه
          // از سرور بیاید؛ کش با timeout کوتاه روی اینترنت کند داده‌ی ۲۴ ساعت قدیمی نشان می‌داد.
          {
            // فونت‌های self-hosted و آیکون‌ها — بدون تغییر مکرر، CacheFirst
            urlPattern: ({ request }) => request.destination === 'font' || request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets-cache',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }, // ۳۰ روز
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { proxy: apiProxy },
  // همان proxy برای `vite preview` تا build واقعی (PWA) هم بدون Nginx محلی قابل تست باشد
  preview: { proxy: apiProxy },
}))
