/**
 * کلاینت identity-svc (پورت ۳۰۰۱) — ورود، توکن و نشست کاربر.
 * مطابق docs/ARCHITECTURE-SAAS.md: JWT/OAuth2 + RBAC + جداسازی tenant.
 */
import type { Role } from '../types'
import { api, setToken, setRefreshToken } from './client'

export interface AuthUser {
  id: string
  fullName: string
  role: Role
  /** برای سوپرادمین null است — کاربر سطح پلتفرم به هیچ مجتمعی تعلق ندارد */
  tenantId: string | null
  /** نام ساختمان (برای سربرگ پنل‌ها) */
  tenantName?: string
  /** رمز هنوز همان رمز اولیه (شماره واحد) است؛ باید از تنظیمات عوض شود */
  mustChangePassword?: boolean
  /** فقط برای کارکنان (role=staff): بخش و دسترسی‌های مؤثر — تعیین می‌کند کدام پنل‌ها باز شود */
  department?: string | null
  permissions?: string[]
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

/** ورود با ایمیل یا نام کاربری — هر کاربر متعلق به یک tenant (مجتمع) با subdomain مشخص است */
export async function login(email: string, password: string, tenantSubdomain: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/identity/auth/login', { email, password, tenantSubdomain })
  setToken(res.accessToken)
  setRefreshToken(res.refreshToken)
  return res
}

export async function refreshSession(refreshToken: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/identity/auth/refresh', { refreshToken })
  setToken(res.accessToken)
  setRefreshToken(res.refreshToken)
  return res
}

export function logout() {
  setToken(null)
  setRefreshToken(null)
  // پاسخ‌های GET کش‌شده‌ی API (service worker، ۲۴ ساعت) حاوی داده‌ی کاربر قبلی‌اند؛
  // روی دستگاه مشترک (مثلاً تبلت لابی) نباید برای کاربر بعدی — حتی آفلاین — قابل مشاهده بمانند.
  if (typeof caches !== 'undefined') {
    caches.delete('api-get-cache').catch(() => undefined)
  }
}

/** تغییر رمز توسط خود کاربر؛ توکن‌های تازه ذخیره می‌شوند تا از دستگاه فعلی بیرون نیفتد */
export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post<{ ok: boolean; accessToken: string; refreshToken: string }>('/identity/auth/change-password', { currentPassword, newPassword })
  setToken(res.accessToken)
  setRefreshToken(res.refreshToken)
}

export function getMe() {
  return api.get<AuthUser>('/identity/auth/me')
}
