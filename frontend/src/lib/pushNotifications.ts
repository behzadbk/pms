// اتصال Push Notification سمت کلاینت — بخش ۶ سند docs/ARCHITECTURE-SAAS.md
// نکته: VAPID_PUBLIC_KEY یک مقدار جایگزین (placeholder) است؛ در استقرار واقعی این کلید
// توسط notification-svc تولید و از طریق متغیر محیطی build (VITE_VAPID_PUBLIC_KEY) تزریق می‌شود.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

/**
 * پس از دریافت مجوز، در سرویس واقعی این subscription باید با یک
 * POST /notifications/subscribe به notification-svc ارسال شود تا سرور بتواند بعداً
 * از طریق Web Push به این دستگاه پیام بفرستد.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
}
