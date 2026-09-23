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
 * notification-service (۳۰۰۶) عمداً اینجا نیست — endpoint عمومی ندارد (فقط مصرف‌کننده صف داخلی).
 */
const serviceProxy = {
  identity: 3001,
  property: 3002,
  facility: 3003,
  finance: 3004,
  guard: 3005,
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

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // داخل اپ موبایل (Capacitor، --mode mobile) فایل‌ها از قبل داخل اپ هستند —
    // service worker لازم نیست و فقط باعث کش‌شدن نسخه‌ی قدیمی بعد از آپدیت اپ می‌شود.
    mode !== 'mobile' && VitePWA({
      registerType: 'autoUpdate',
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
        runtimeCaching: [
          {
            // درخواست‌های GET به API — تازه‌ترین داده وقتی آنلاین، fallback به کش وقتی آفلاین
            urlPattern: ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }, // ۲۴ ساعت
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
