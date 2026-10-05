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
export async function platformLogin(username: string, password: string): Promise<PlatformLoginResponse> {
  const res = await api.post<PlatformLoginResponse>('/identity/auth/platform-login', { username, password })
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
