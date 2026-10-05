/**
 * Web Push سمت کلاینت (VAPID).
 *  • کلید عمومی از notification-svc گرفته می‌شود (GET /notification/push/key) — نیازی به env در build نیست.
 *  • اشتراک هر دستگاه با POST /notification/push/subscribe ثبت می‌شود؛ سرور با نقش/دسترسی‌های توکن،
 *    گیرنده را تعیین می‌کند (ساکن، مدیر، مسئول مشاعات، …).
 *  • دریافت و کلیک اعلان در public/push-sw.js (داخل service worker اصلی PWA) انجام می‌شود.
 */
import { api } from './api/client'

const N = '/notification'

function b64ToBytes(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** آیفون/آیپد: Web Push فقط برای اپِ «افزوده‌شده به صفحه‌ی اصلی» کار می‌کند (iOS ۱۶.۴+) */
export function isIosNeedingInstall() {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  return ios && !standalone
}

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'unavailable'

async function registration() {
  return navigator.serviceWorker.ready
}

/** وضعیت این دستگاه برای نمایش در تنظیمات */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return isIosNeedingInstall() ? 'needs-install' : 'unsupported'
  if (isIosNeedingInstall()) return 'needs-install'
  if (Notification.permission === 'denied') return 'blocked'
  try {
    const sub = await (await registration()).pushManager.getSubscription()
    if (sub && Notification.permission === 'granted') return 'on'
  } catch {
    return 'unavailable'
  }
  return 'off'
}

async function subscribeOnServer(sub: PushSubscription) {
  const json = sub.toJSON()
  await api.post(`${N}/push/subscribe`, { endpoint: sub.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 200) })
}

/** درخواست مجوز + اشتراک + ثبت در سرور. در صورت ناموفق بودن دلیل را به‌صورت متن فارسی throw می‌کند. */
export async function enablePush(): Promise<void> {
  if (isIosNeedingInstall()) throw new Error('در آیفون ابتدا همین را به صفحه‌ی اصلی اضافه کنید (Share ← Add to Home Screen) و از آنجا باز کنید.')
  if (!isPushSupported()) throw new Error('این مرورگر از اعلان پشتیبانی نمی‌کند.')
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('اجازه‌ی اعلان داده نشد. از تنظیمات مرورگر یا گوشی می‌توانید آن را فعال کنید.')
  const key = await api.get<{ publicKey: string; enabled: boolean }>(`${N}/push/key`)
  if (!key.enabled || !key.publicKey) throw new Error('سرویس اعلان فعلاً در دسترس نیست.')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  // کلید سرور عوض شده باشد، اشتراک قبلی دیگر معتبر نیست
  if (sub) {
    const cur = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
    const want = b64ToBytes(key.publicKey)
    if (!cur || cur.length !== want.length || cur.some((v, i) => v !== want[i])) {
      await sub.unsubscribe().catch(() => undefined)
      sub = null
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key.publicKey) })
  await subscribeOnServer(sub)
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return
  await api.post(`${N}/push/unsubscribe`, { endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

/**
 * هر بار که اپ با کاربر واردشده باز می‌شود: اگر مجوز داده شده، اشتراک را تازه می‌کنیم تا نقش/دسترسی‌های
 * فعلی (مثلاً مسئول مشاعات شدن) و endpoint جدید در سرور ثبت باشد. بی‌صدا شکست می‌خورد.
 */
export async function syncPushSubscription(): Promise<void> {
  try {
    if (!isPushSupported() || Notification.permission !== 'granted') return
    const sub = await (await registration()).pushManager.getSubscription()
    if (sub) await subscribeOnServer(sub)
  } catch {
    /* بی‌صدا */
  }
}

export async function sendTestPush(): Promise<number> {
  const r = await api.post<{ sent: number }>(`${N}/push/test`)
  return r.sent
}
