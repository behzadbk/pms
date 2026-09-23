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
  return api.post<Building>('/identity/platform/buildings', input)
}

export function updateBuilding(id: string, changes: Partial<CreateBuildingInput> & { status?: BuildingStatus }) {
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
