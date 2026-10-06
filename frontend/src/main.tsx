import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initNativeShell } from './lib/native'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void initNativeShell()

// PWA/گوشی: منوی زمینه‌ی مرورگر (نگه‌داشتن روی لینک/تصویر/متن) باز نشود؛ فقط در فیلدهای متنی بماند.
if (window.matchMedia('(hover: none) and (pointer: coarse), (display-mode: standalone)').matches) {
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null
    if (t?.closest('input, textarea, [contenteditable="true"], [data-selectable]')) return
    e.preventDefault()
  })
}

// PWA: نسخه‌ی جدید بعد از دیپلوی باید بدون «یک بار دیگر باز کن» به کاربر برسد.
// sw.js با skipWaiting/clientsClaim فوراً فعال می‌شود؛ اینجا (۱) هر بار که اپ دوباره دیده می‌شود و هر ۱۵ دقیقه
// دنبال نسخه‌ی جدید می‌گردیم و (۲) وقتی ورکر جدید کنترل را گرفت صفحه یک‌بار خودکار ریلود می‌شود.
// (اپ موبایل Capacitor با --mode mobile سرویس‌ورکر ندارد.)
if (import.meta.env.PROD && import.meta.env.MODE !== 'mobile' && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        const check = () => void reg.update().catch(() => undefined)
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
        window.addEventListener('online', check)
        window.setInterval(check, 15 * 60 * 1000)
      })
      .catch(() => undefined)
  })
}
