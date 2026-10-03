import { api } from './client'

export interface IssuedPass { id: string; code: string; guest_name: string; valid_until: string; status: string }
export type VerifyResult = { ok: true; passId: string; guestName: string; unitId: string } | { ok: false; reason: string }

/** صدور کد مهمان برای واحد ساکن (کد ۶ رقمی را سرور می‌سازد) */
export const issuePass = (unitId: string, guestName: string, validUntil: Date) =>
  api.post<IssuedPass>(`/guard/units/${unitId}/guest-passes`, { guestName, validUntil: validUntil.toISOString(), maxUses: 1 })

export const verifyPass = (code: string) => api.get<VerifyResult>(`/guard/guest-passes/verify?code=${encodeURIComponent(code)}`)

export const checkInPass = (id: string) => api.post<unknown>(`/guard/guest-passes/${id}/check-in`)
