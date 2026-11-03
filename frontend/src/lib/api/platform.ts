/**
 * کلاینت پنل سوپرادمین — روی همان identity-svc (پورت ۳۰۰۱) سوار است.
 * مسیرها: /identity/auth/platform-login و /identity/platform/*
 *
 * همه‌ی Endpointهای /platform پشت نقش super_admin هستند (RolesGuard در بک‌اند)،
 * پس فراخوانی آن‌ها با توکن یک مدیر ساختمان عادی خطای ۴۰۳ می‌دهد.
 */
import { api, setToken, setRefreshToken } from './client'
import type { AuthUser } from './identity'
import type { BuildingTier, FeatureKey } from '../tiers'

export interface PlatformLoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export type BillingStatus = 'settled' | 'due' | 'overdue'
export type BuildingStatus = 'active' | 'trial' | 'suspended' | 'cancelled'

export interface Building {
  id: string
  name: string
  subdomain: string
  status: BuildingStatus
  tier: BuildingTier
  tierLabel: string
  unitCount: number
  floorCount: number | null
  address: string | null
  managerName: string | null
  managerPhone: string | null
  monthlyFee: number
  outstandingAmount: number
  billingStatus: BillingStatus
  lastPaymentAt: string | null
  nextDueAt: string | null
  createdAt: string
  suspendedAt?: string | null
  suspendReason?: string | null
  trialEndsAt?: string | null
}

export interface BuildingsSummary {
  totalBuildings: number
  activeBuildings: number
  trialBuildings: number
  suspendedBuildings: number
  totalUnits: number
  mrr: number
  totalOutstanding: number
  overdueCount: number
  byTier: Record<BuildingTier, number>
}

export interface BuildingsResponse {
  buildings: Building[]
  summary: BuildingsSummary
}

export interface CreateBuildingInput {
  name: string
  subdomain: string
  tier: BuildingTier
  unitCount: number
  floorCount?: number
  address?: string
  managerName?: string
  managerPhone?: string
  monthlyFee?: number
  status?: 'active' | 'trial'
  /** حساب مدیر اولیه‌ی مجتمع — بدون آن مشتری راهی برای ورود به پنل خودش ندارد */
  adminEmail?: string
  /** اختیاری — اگر خالی باشد بک‌اند رمز موقت تصادفی می‌سازد و فقط یک‌بار برمی‌گرداند */
  adminPassword?: string
  adminFullName?: string
}

export interface TierResponse {
  id: BuildingTier
  label: string
  summary: string
  fitFor: string
  features: FeatureKey[]
  pricePerUnit: number
}

/** ورود سوپرادمین — بدون subdomain، چون این کاربر به هیچ مجتمعی تعلق ندارد */
export async function platformLogin(username: string, password: string, otp?: string): Promise<PlatformLoginResponse> {
  const res = await api.post<PlatformLoginResponse>('/identity/auth/platform-login', { username, password, ...(otp ? { otp } : {}) })
  setToken(res.accessToken)
  setRefreshToken(res.refreshToken)
  return res
}

export function listBuildings() {
  return api.get<BuildingsResponse>('/identity/platform/buildings')
}

export function getBuilding(id: string) {
  return api.get<Building>(`/identity/platform/buildings/${id}`)
}

export function createBuilding(input: CreateBuildingInput) {
  return api.post<CreatedBuilding>('/identity/platform/buildings', input)
}

export function updateBuilding(id: string, changes: Partial<Omit<CreateBuildingInput, 'status'>> & { status?: BuildingStatus }) {
  return api.patch<Building>(`/identity/platform/buildings/${id}`, changes)
}

/** ثبت تسویه‌ی اشتراک یک ساختمان */
export function settleBuilding(id: string) {
  return api.patch<Building>(`/identity/platform/buildings/${id}/settle`, {})
}

/** ماتریس سطوح از بک‌اند (منبع حقیقت) — در صورت خطا از نسخه‌ی محلی lib/tiers استفاده می‌شود */
export function listTiers() {
  return api.get<TierResponse[]>('/identity/platform/tiers')
}

/** نمایش مبلغ به تومان (قالب ثابت صفحات پلتفرم) */
export const fmtToman = (n: number) => Math.round(n).toLocaleString('fa-IR') + ' تومان'

/** پاسخ ساخت ساختمان: اعتبارنامه‌ی مدیر فقط همین یک‌بار برمی‌گردد */
export type CreatedBuilding = Building & {
  adminCredentials?: { email: string; password: string; mustChangePassword: true; note: string }
}

export interface PlatformTenant {
  id: string
  name: string
  subdomain: string
  status: BuildingStatus
  tier: BuildingTier
  plan: string
  /** سقف واحد در قرارداد */
  unitLimit: number
  /** واحدهای واقعاً ثبت‌شده */
  unitCount: number
  residentCount: number
  adminCount: number
  staffCount: number
  monthlyFee: number
  outstandingAmount: number
  billingStatus: BillingStatus
  joinedAt: string
}

export interface PlatformSummary {
  period: string
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  totalMrr: number
  totalUnitsManaged: number
  totalResidents: number
  totalOutstanding: number
  overdueTenants: number
  invoices: { thisPeriod: number; pending: number; paid: number; failed: number; paidAmountLast30Days: number }
  recentTenants: PlatformTenant[]
}

export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'void'

export interface PlatformInvoice {
  id: string
  tenantId: string
  tenantName: string
  period: string
  amount: number
  status: InvoiceStatus
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  note: string | null
}

export const getSummary = () => api.get<PlatformSummary>('/identity/platform/summary')
export const listTenants = () => api.get<{ tenants: PlatformTenant[] }>('/identity/platform/tenants')
export const listInvoices = (q: { tenantId?: string; status?: string; period?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString()
  return api.get<{ invoices: PlatformInvoice[] }>(`/identity/platform/invoices${qs ? `?${qs}` : ''}`)
}
export const createInvoice = (body: { tenantId: string; period?: string; amount?: number; note?: string }) =>
  api.post<PlatformInvoice>('/identity/platform/invoices', body)
export const generateInvoices = (period?: string) =>
  api.post<{ period: string; created: number }>('/identity/platform/invoices/generate', { period })
export const setInvoiceStatus = (id: string, status: InvoiceStatus) =>
  api.patch<{ ok: boolean }>(`/identity/platform/invoices/${id}/status`, { status })
/** خروجی کامل داده‌ی یک ساختمان (JSON) برای پشتیبان‌گیری/انتقال */
export const exportBuilding = (id: string) => api.get<Record<string, unknown>>(`/identity/platform/buildings/${id}/export`)

/* ───────────── عملیات پلتفرم: چرخه‌ی عمر، ورود به‌جای مدیر، یادداشت، لاگ، سلامت، تنظیمات، تیم، ۲FA ───────────── */

export type PlatformRole = 'owner' | 'support' | 'sales'

export const suspendBuilding = (id: string, reason: string) =>
  api.post<{ id: string; status: BuildingStatus; suspendReason: string | null }>(`/identity/platform/buildings/${id}/suspend`, { reason })
export const reactivateBuilding = (id: string, reason?: string) =>
  api.post<{ id: string; status: BuildingStatus }>(`/identity/platform/buildings/${id}/reactivate`, { reason })
export const cancelBuilding = (id: string, reason: string) =>
  api.post<{ id: string; status: BuildingStatus }>(`/identity/platform/buildings/${id}/cancel`, { reason })

export interface ImpersonationResult {
  accessToken: string
  expiresInSeconds: number
  tenantName: string
  user: AuthUser
}
export const impersonateBuilding = (id: string) => api.post<ImpersonationResult>(`/identity/platform/buildings/${id}/impersonate`, {})

export type NoteKind = 'note' | 'call' | 'visit' | 'sales'
export interface BuildingNote { id: string; kind: NoteKind; body: string; author: string; createdAt: string }
export const listNotes = (id: string) => api.get<{ notes: BuildingNote[] }>(`/identity/platform/buildings/${id}/notes`)
export const addNote = (id: string, kind: NoteKind, body: string) => api.post<BuildingNote>(`/identity/platform/buildings/${id}/notes`, { kind, body })
export const deleteNote = (id: string, noteId: string) => api.delete<{ ok: boolean }>(`/identity/platform/buildings/${id}/notes/${noteId}`)

export interface AuditEntry {
  id: number
  at: string
  admin: string
  action: string
  buildingId: string | null
  buildingName: string | null
  target: string | null
  detail: Record<string, unknown>
  ip: string | null
}
export const listAudit = (q: { buildingId?: string; admin?: string; action?: string; limit?: number; before?: number } = {}) => {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
  return api.get<{ entries: AuditEntry[] }>(`/identity/platform/audit${qs ? `?${qs}` : ''}`)
}

export interface ServiceHealth { name: string; status: 'up' | 'down'; latencyMs: number | null; error?: string }
export interface HealthReport {
  checkedAt: string
  tookMs: number
  overall: 'ok' | 'degraded' | 'critical'
  services: ServiceHealth[]
  database: {
    reachable: boolean
    pingMs: number | null
    sizeBytes: number
    connections: number
    maxConnections: number
    lockedLogins: number
    failedInvoices: number
    overdueBuildings: number
  }
}
export const getHealth = () => api.get<HealthReport>('/identity/platform/health')

export interface PlatformSettings {
  graceDays: number
  autoSuspend: boolean
  trialDays: number
  autoSuspendTrial: boolean
  pricePerUnit: Record<BuildingTier, number>
}
export const getSettings = () => api.get<PlatformSettings>('/identity/platform/settings')
export const updateSettings = (patch: Partial<Omit<PlatformSettings, 'pricePerUnit'>> & { pricePerUnit?: Partial<Record<BuildingTier, number>> }) =>
  api.put<PlatformSettings>('/identity/platform/settings', patch)
export const runScheduler = () =>
  api.post<{ ran: boolean; newlyOverdue: number; suspendedForDebt: number; suspendedTrialEnded: number }>('/identity/platform/scheduler/run', {})

export interface PlatformAdminInfo {
  id: string
  username: string
  fullName: string
  role: PlatformRole
  isActive: boolean
  totpEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
}
export const listAdmins = () => api.get<{ admins: PlatformAdminInfo[] }>('/identity/platform/admins')
export const createAdmin = (b: { username: string; fullName: string; role: PlatformRole; password?: string }) =>
  api.post<PlatformAdminInfo & { credentials: { username: string; password: string; note: string } }>('/identity/platform/admins', b)
export const updateAdmin = (id: string, b: { role?: PlatformRole; isActive?: boolean; fullName?: string }) =>
  api.patch<PlatformAdminInfo>(`/identity/platform/admins/${id}`, b)
export const resetAdminPassword = (id: string) =>
  api.post<{ username: string; password: string; note: string }>(`/identity/platform/admins/${id}/reset-password`, {})
export const resetAdmin2fa = (id: string) => api.post<{ ok: boolean }>(`/identity/platform/admins/${id}/reset-2fa`, {})

export const setup2fa = () => api.post<{ secret: string; otpauthUrl: string }>('/identity/platform/me/2fa/setup', {})
export const enable2fa = (code: string) => api.post<{ ok: boolean }>('/identity/platform/me/2fa/enable', { code })
export const disable2fa = (password: string, code: string) => api.post<{ ok: boolean }>('/identity/platform/me/2fa/disable', { password, code })
