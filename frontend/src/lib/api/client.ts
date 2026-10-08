/**
 * لایه پایه‌ی ارتباط با بک‌اند — یک fetch wrapper مشترک برای همه‌ی میکروسرویس‌ها.
 *
 * طبق docs/ARCHITECTURE-SAAS.md همه‌ی سرویس‌ها پشت یک Ingress با پیشوند مشترک
 * `/api/<service>/...` قرار دارند (نمونه: `/api/fnb/orders`, `/api/audit/logs`).
 * در محیط dev می‌توان با VITE_API_BASE_URL این مسیر را به‌صورت مطلق override کرد
 * (مثلاً برای اجرای مستقیم یک سرویس روی پورت محلی‌اش، بدون Ingress). به‌صورت پیش‌فرض
 * مقدار نسبی `/api` است که با vite.config.ts -> server.proxy روی dev سرور به پورت
 * محلی هر میکروسرویس هدایت می‌شود (بدون نیاز به Nginx/Ingress محلی).
 *
 * Correlation (بخش ۱.۳ سند V2): هر درخواست هدرهای X-Session-Id (پایدار در طول
 * نشست مرورگر) و X-Trace-Id (یکتا برای هر اکشن) حمل می‌کند — همان چیزی که
 * audit-svc برای «بازسازی زنجیره رویداد» استفاده می‌کند.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'

const TOKEN_KEY = 'pms_token'
const REFRESH_TOKEN_KEY = 'pms_refresh_token'
const SESSION_KEY = 'pms_session_id'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage ممکن است در حالت خصوصی/PWA محدود باشد — نادیده گرفتن بی‌خطر است
  }
}

/** refreshToken — برای صدور accessToken جدید بدون ورود دوباره (POST /identity/auth/refresh) */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
    else localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // نادیده گرفتن بی‌خطر — مشابه setToken
  }
}

/** session_id پایدار در طول یک نشست مرورگر — کلید بازسازی زنجیره رویداد در audit-svc */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/** رویدادی که وقتی نشست قابل تمدید نیست (refresh token نامعتبر/منقضی) پخش می‌شود؛ AuthContext با آن به صفحه‌ی ورود برمی‌گردد */
export const SESSION_EXPIRED_EVENT = 'pms:session-expired'

/** مسیرهایی که خودشان توکن می‌سازند؛ 401 آن‌ها «اطلاعات ورود اشتباه» است، نه انقضای نشست */
const AUTH_PATHS = ['/identity/auth/login', '/identity/auth/refresh', '/identity/auth/platform-login', '/identity/auth/family-code']

let refreshing: Promise<boolean> | null = null

/**
 * accessToken فقط ۱۵ دقیقه اعتبار دارد (بک‌اند)، اما برنامه روزها باز می‌ماند (تبلت آشپزخانه، موبایل نگهبان).
 * با اولین 401 یک‌بار (single-flight: همه‌ی درخواست‌های هم‌زمان منتظر همان تمدید می‌مانند) با refresh token توکن تازه
 * می‌گیریم و درخواست را تکرار می‌کنیم. اگر تمدید ممکن نبود نشست پاک و رویداد انقضا پخش می‌شود.
 */
function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing
  const refreshToken = getRefreshToken()
  if (!refreshToken) return Promise.resolve(false)
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/identity/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Session-Id': getSessionId() },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) {
        // فقط رد صریح سرور، نشست را باطل می‌کند؛ قطعی شبکه/۵۰۰ موقتی است و توکن‌ها حفظ می‌شوند
        if (res.status === 401 || res.status === 400 || res.status === 403) {
          setToken(null)
          setRefreshToken(null)
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
        }
        return false
      }
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string }
      if (!data.accessToken) return false
      setToken(data.accessToken)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  body?: unknown
  idempotencyKey?: string
}

async function request<T>(path: string, method: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, idempotencyKey, ...rest } = options
  // Trace-Id یک «اکشن» است؛ تکرار بعد از تمدید توکن همان اکشن است و باید همان شناسه را داشته باشد
  const traceId = crypto.randomUUID()

  const send = async (token: string | null): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      Accept: 'application/json',
      'X-Session-Id': getSessionId(),
      'X-Trace-Id': traceId,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // کلید ایدمپوتنسی برای عملیات پولی/سفارش: یک کلید برای هر «قصد» کاربر ساخته می‌شود و اگر درخواست به‌خاطر قطعی شبکه
      // دوباره ارسال شد همان کلید می‌رود؛ سرور (مثلاً initiate پرداخت) با آن جلوی ثبت دوباره را می‌گیرد.
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      // آخرین spread: هدرهای فراخواننده بر پیش‌فرض‌های بالا (حتی Authorization) غالب می‌شوند.
      ...(headers as Record<string, string> | undefined),
    }
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...rest,
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      throw new ApiError('اتصال به سرور برقرار نشد — اتصال اینترنت را بررسی کنید', 0, err)
    }
  }

  const sentToken = getToken()
  let res = await send(sentToken)
  const callerSetAuth = !!headers && 'Authorization' in (headers as Record<string, string>)
  if (res.status === 401 && sentToken && !callerSetAuth && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    // اگر درخواست دیگری هم‌زمان توکن را تمدید کرده، توکن فعلی از توکن ارسالی متفاوت است و نیازی به تمدید دوباره نیست
    const renewed = getToken() !== sentToken || (await refreshAccessToken())
    if (renewed) res = await send(getToken())
  }

  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await res.json().catch(() => undefined) : await res.text().catch(() => undefined)

  if (!res.ok) {
    // پیام خطا از بدنه‌ی JSON سرور می‌آید. ValidationPipe نست «آرایه‌ای از پیام‌ها» برمی‌گرداند که String() با ویرگول به
    // هم می‌چسباند. کل پاسخ در ApiError.body می‌ماند تا کد ماشینی (مثل code: 'debtor_restricted') قابل بررسی باشد.
    const message = (isJson && data && typeof data === 'object' && 'message' in data)
      ? String((data as { message?: unknown }).message)
      : res.statusText || 'خطای غیرمنتظره از سرور'
    throw new ApiError(message, res.status, data)
  }

  return data as T
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) => request<T>(path, 'GET', options),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>(path, 'POST', { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>(path, 'PATCH', { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>(path, 'PUT', { ...options, body }),
  delete: <T>(path: string, options?: ApiRequestOptions) => request<T>(path, 'DELETE', options),
}
