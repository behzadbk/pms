import { getRefreshToken, getToken, setRefreshToken, setToken } from './api/client'

/**
 * «ورود به‌جای مدیر» (پشتیبانی). توکن سوپرادمین قبل از جایگزینی در sessionStorage همین تب نگه داشته می‌شود و با
 * «خروج» برمی‌گردد. توکن مدیر ۳۰ دقیقه‌ای و بدون refresh است؛ banner بعد از انقضا خودکار خارج می‌کند.
 * ثبت لاگ فعالیت سمت سرور است (هنگام صدور توکن)، نه اینجا.
 */
const KEY = 'livo.impersonation.v1'

export interface ImpersonationState {
  by: string
  tenantName: string
  until: number
  backup: { token: string | null; refresh: string | null }
}

export function readImpersonation(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ImpersonationState) : null
  } catch {
    return null
  }
}

export function startImpersonation(accessToken: string, info: { by: string; tenantName: string; expiresInSeconds: number }) {
  const state: ImpersonationState = {
    by: info.by,
    tenantName: info.tenantName,
    until: Date.now() + info.expiresInSeconds * 1000,
    backup: { token: getToken(), refresh: getRefreshToken() },
  }
  sessionStorage.setItem(KEY, JSON.stringify(state))
  setToken(accessToken)
  setRefreshToken(null)
  // بارگذاری کامل: AuthContext با توکن تازه از /auth/me پروفایل مدیر ساختمان را می‌گیرد
  window.location.assign('/')
}

/** توکن‌های سوپرادمین را برمی‌گرداند و به پنل پلتفرم می‌رود */
export function stopImpersonation() {
  const st = readImpersonation()
  sessionStorage.removeItem(KEY)
  setToken(st?.backup.token ?? null)
  setRefreshToken(st?.backup.refresh ?? null)
  window.location.assign('/super-admin/buildings')
}
