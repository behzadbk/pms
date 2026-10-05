/**
 * کلاینت ماژول ساکنین، خانوار، حالت والدین (identity-svc) و رزرو مشاعات نسخه‌ی ۲ (facility-svc).
 * قرارداد: design_handoff_hamino_v5/RESIDENTS.md — بدنه‌ها snake_case، تاریخ‌ها ISO میلادی.
 */
import { api, getToken, getSessionId, ApiError, setToken, setRefreshToken } from './client'

export type Tone = 'pri' | 'ok' | 'warn' | 'bad' | 'acc' | 'mute'
export interface Badge { t: string; tone: Tone }
export type UnitCategory = 'owner' | 'tenant' | 'pending' | 'vacant'
export type Residency = 'owner' | 'tenant' | 'owner_absent'
export type MemberRole = 'head' | 'adult' | 'child' | 'caregiver' | 'senior' | 'owner_absent'

export interface UnitListItem {
  id: string
  no: string
  floor: number | null
  category: UnitCategory
  occupancy: 'vacant' | 'owner' | 'tenant'
  name: string | null
  meta: string
  member_count: number
  badges: Badge[]
}
export interface UnitsResponse {
  building: { id: string; name: string }
  counts: Record<'all' | UnitCategory, number>
  units: UnitListItem[]
}

export interface UnitMember {
  id: string
  user_id: string
  name: string
  phone: string | null
  national_id: string | null
  role: MemberRole
  role_label: string
  residency: Residency
  status: 'invited' | 'pending_approval' | 'pending_head' | 'active' | 'ended'
  pays_charge: boolean
  start_date: string
  end_date: string | null
  age: number | null
  settings: Record<string, unknown>
}
export interface UnitFile {
  id: string
  no: string
  floor: number | null
  area: number | null
  parking_count: number
  storage_no: string | null
  occupancy: 'vacant' | 'owner' | 'tenant'
  owner: { id: string; name: string; phone: string | null; absent: boolean } | null
  head: { membership_id: string; name: string; residency: Residency; start_date: string; end_date: string | null; pays_charge: boolean } | null
  resident_count: number
  scheduled_move_out: { id: string; date: string; status: string } | null
  members: UnitMember[]
  vehicles: { plate: string }[]
}

export interface AddResidentBody {
  name: string
  phone: string
  national_id?: string
  residency: Residency
  start_date?: string
  end_date?: string
  pays_charge?: boolean
  send_sms?: boolean
}

export interface JoinRequest {
  id: string
  name: string
  phone: string | null
  unit_id: string
  unit_no: string
  residency: Residency
  channel: string
  status: 'pending_approval' | 'pending_head'
  created_at: string
  kind: 'ok' | 'move' | 'head'
  note: string | null
  head_name: string | null
  current_unit_no: string | null
}

export interface ImportResult {
  file: string
  total: number
  created: number
  errors: { row: number; reason: string; text: string }[]
}

export interface MoveOutBlockers {
  debt: { amount: number; charges: number }
  parcels: number
  reservations: number
}

export interface Credit { cap: number; spent: number; remaining: number }

export interface HouseholdMember {
  id: string
  user_id: string
  name: string
  initial: string
  phone: string | null
  has_phone: boolean
  role: MemberRole
  title: string | null
  role_label: string
  status: 'invited' | 'active'
  is_me: boolean
  age: number | null
  end_date: string | null
  preset: string | null
  monthly_cap: number | null
  credit: Credit | null
  invite_expires_at: string | null
  settings: Record<string, unknown>
  access_label: string
  sub: string
}
export interface Household {
  unit: { id: string; no: string; floor: number | null }
  me: { membership_id: string; role: MemberRole; is_head: boolean }
  members: HouseholdMember[]
  pending: JoinRequest[]
}

export type ModuleKey = 'food' | 'amenity' | 'guest' | 'ticket' | 'parcel' | 'notice'
export type Level = 0 | 1 | 2
export interface ParentControl {
  membership_id: string
  name: string
  age: number | null
  preset: 'u7' | 'c12' | 't17' | 'custom'
  modules: Record<ModuleKey, Level>
  monthly_cap: number
  quiet_hours: { from: string; to: string } | null
  weekly_report: boolean
  exit_lock: boolean
  lobby_alert: boolean
  has_exit_pin: boolean
  credit: Credit
  turns_adult_soon: boolean
}

export interface ChildRequestPayload {
  venue?: string
  venueId?: string
  items?: { id?: string; n: string; q: number; p?: number }[]
  destination?: string
  amenity?: string
  amenity_id?: string
  start?: string
  end?: string
}
export interface ChildRequest {
  id: string
  type: 'order' | 'amenity' | 'guest' | 'ticket'
  title: string
  child_name: string
  child_membership_id: string
  payload: ChildRequestPayload
  amount: number | null
  reason: 'approval' | 'over_cap' | null
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  expires_at: string
  created_at: string
  credit: Credit
  over_cap_by: number
}
export interface OwnChildRequest {
  id: string
  type: ChildRequest['type']
  payload: ChildRequestPayload
  amount: number | null
  reason: string | null
  status: ChildRequest['status']
  expires_at: string
  created_at: string
}

export type Access = 'hidden' | 'approval' | 'free' | 'view' | 'locked'
export type AppModule = 'finance' | 'food' | 'amenity' | 'guest' | 'ticket' | 'parcel' | 'notice' | 'assembly' | 'household' | 'emergency'
export interface Permissions {
  kind: 'resident' | 'child' | 'caregiver' | 'owner_absent' | 'staff' | 'platform'
  role: string | null
  name?: string
  membership_id?: string | null
  unit?: { id: string; no: string; floor: number | null } | null
  modules: Record<AppModule, Access>
  levels?: Partial<Record<ModuleKey, Level>>
  quiet: { active: boolean; hours: { from: string; to: string } | null }
  credit?: Credit
  exit_lock?: boolean
  emergency: boolean
  easy_mode?: boolean
  parent_name?: string | null
  pending_requests?: number
  preset?: string
  /** واحد بدهکار (قوانین برج): روز تأخیر، مبلغ معوق و مهلت ساختمان؛ null = بدهکار نیست */
  debtor?: { overdue_days: number; amount: number; grace_days: number } | null
  /** شناسه‌ی مشاع‌هایی که برای این واحد بسته‌اند */
  locked_amenities?: string[]
}

export interface InboxItem {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  ref_id: string | null
  created_at: string
  read: boolean
}

export interface BuildingOccupancy {
  id: string
  name: string
  status: string
  units_total: number
  units_filled: number
  occupancy_pct: number
  pending: number
  manager_name: string | null
  manager_assigned: boolean
  setting_up: boolean
}
export interface PersonHit { id: string; name: string; phone: string | null; status: string; memberships: string[] }
export interface PersonFile {
  user: { id: string; name: string; phone: string | null; national_id: string | null; status: string; age: number | null }
  memberships: { id: string; building: string; building_id: string; unit_no: string; title: string; description: string; status: string; role: string; start_date: string }[]
  audit: { t: string; action: string; at: string; building: string }[]
  duplicates: { id: string; name: string; phone: string | null; reason: 'national_id' | 'name' }[]
}

export interface Amenity {
  id: string
  name: string
  icon: string | null
  needs_approval: boolean
  requires_approval: boolean
  max_hours: number
  capacity: number | null
  rule_text: string | null
  description?: string | null
  max_advance_days?: number
  /** مشاعِ بسته برای واحد بدهکار */
  locked?: boolean
}
export interface SlotLock { code: 'debtor_restricted'; overdue_days: number; message: string }
export interface Slot { hour: number; label: string; start: string; end: string; status: 'free' | 'taken' | 'past' }
export interface ReservationRow {
  id: string
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  start_at: string
  end_at: string
  reject_reason: string | null
  source: string
  amenity: string
  amenity_id: string
  icon: string | null
  unit_no: string | null
  requester: string | null
}

/** اطلاعات ورود ساکن: نام کاربری = موبایل، رمز اولیه = شماره واحد (password فقط هنگام ساخت/بازنشانی پر است) */
export interface LoginCreds { username: string; password: string | null; created: boolean }

/** قوانین برج */
export interface RuleOption { key: string; label: string; hint?: string; id?: string; icon?: string | null }
export interface BuildingRules {
  debtor_grace_days: number
  restrictions: Record<string, boolean>
  configured: boolean
  updated_at: string | null
  modules: RuleOption[]
  amenities: RuleOption[]
  debtor_units_now: number
}
export interface UnitSpecs { unit_number?: string; floor?: number; area?: number; parking_count?: number; storage_no?: string }

const I = '/identity'
const F = '/facility'

/**
 * ساختمان فعال برای سوپرادمین: API ساکنین برای سوپرادمین به building_id نیاز دارد. صفحه‌های مدیر
 * بدون تغییر برای سوپرادمین هم کار می‌کنند — لایه‌ی مسیر (SuperAdminBuildingScope) این مقدار را
 * همزمان با رندر تنظیم می‌کند و همه‌ی درخواست‌های «واحد/ساکن» خودکار ?building_id= می‌گیرند.
 * برای مدیر ساختمان همیشه null است (سرور خودش tenant را از توکن می‌داند).
 */
let scopeBuilding: string | null = null
export const setBuildingScope = (id: string | null) => {
  scopeBuilding = id
}
export const getBuildingScope = () => scopeBuilding
const sc = (path: string) => (scopeBuilding ? `${path}${path.includes('?') ? '&' : '?'}building_id=${encodeURIComponent(scopeBuilding)}` : path)

const qs = (o: Record<string, string | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '')
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&') : ''
}

export const residentsApi = {
  // ── مدیر ──
  units: (buildingId: string, filter?: string, q?: string) => api.get<UnitsResponse>(`${I}/buildings/${buildingId}/units${qs({ filter, q })}`),
  unit: (id: string) => api.get<UnitFile>(sc(`${I}/units/${id}`)),
  /** ساخت دستی واحد(ها): unit_numbers می‌تواند چند شماره با فاصله/ویرگول باشد */
  createUnits: (buildingId: string, body: { unit_numbers: string; floor?: number; area?: number }) =>
    api.post<{ created: { id: string; no: string }[]; skipped: string[] }>(`${I}/buildings/${buildingId}/units/multi`, body),
  addResident: (unitId: string, body: AddResidentBody) => api.post<{ membership_id: string; role: string; status: string; credentials?: LoginCreds | null }>(sc(`${I}/units/${unitId}/residents`), body),
  updateMembership: (id: string, body: Record<string, unknown>) => api.patch<UnitFile>(sc(`${I}/memberships/${id}`), body),
  invite: (unitId: string, phone: string) => api.post<{ membership_id: string; resent: boolean }>(sc(`${I}/units/${unitId}/invite`), { phone }),
  moveOutPreview: (unitId: string, date: string) =>
    api.get<{ date: string; blockers: MoveOutBlockers; affected: { id: string; name: string; role: string }[] }>(sc(`${I}/units/${unitId}/move-out${qs({ date })}`)),
  moveOut: (unitId: string, date: string) =>
    api.post<{ status: 'scheduled' | 'done'; blockers: MoveOutBlockers; affected: { name: string }[] }>(sc(`${I}/units/${unitId}/move-out`), { date }),
  joinRequests: (buildingId: string) => api.get<JoinRequest[]>(`${I}/buildings/${buildingId}/join-requests`),
  approve: (id: string) => api.post<{ status: string; name: string; requests: JoinRequest[] }>(sc(`${I}/join-requests/${id}/approve`)),
  reject: (id: string, reason?: string) => api.post<{ requests: JoinRequest[] }>(sc(`${I}/join-requests/${id}/reject`), { reason }),
  transfer: (id: string, toUnitId?: string) => api.post<{ from_units: string[]; name: string; unit_no: string; requests: JoinRequest[] }>(sc(`${I}/join-requests/${id}/transfer`), { to_unit_id: toUnitId }),
  remindHead: (id: string) => api.post<{ head_name: string }>(sc(`${I}/join-requests/${id}/remind-head`)),
  lobbyQr: (buildingId: string) => api.get<{ token: string; url: string; building: string }>(`${I}/buildings/${buildingId}/lobby-qr`),
  importFile: (buildingId: string, file: File) => upload<ImportResult>(`${I}/buildings/${buildingId}/residents/import`, file),
  templatePath: (buildingId: string) => `${I}/buildings/${buildingId}/residents/import/template`,

  /** رمز ساکن را به شماره‌ی واحد برمی‌گرداند (نام کاربری = موبایل) */
  resetPassword: (membershipId: string) => api.post<{ username: string; password: string }>(sc(`${I}/memberships/${membershipId}/reset-password`)),

  // ── واحدها، حذف ساکن، قوانین برج ──
  createUnit: (buildingId: string, body: UnitSpecs & { unit_number: string }) => api.post<{ id: string; no: string }>(`${I}/buildings/${buildingId}/units`, body),
  bulkUnits: (buildingId: string, body: { floors: number; units_per_floor: number; start_floor?: number; area?: number }) =>
    api.post<{ created: number; skipped: number; total: number }>(`${I}/buildings/${buildingId}/units/bulk`, body),
  updateUnit: (id: string, body: UnitSpecs) => api.patch<{ id: string; no: string }>(sc(`${I}/units/${id}`), body),
  deleteUnit: (id: string) => api.delete<{ ok: boolean }>(sc(`${I}/units/${id}`)),
  /** حذف ساکن = پایان عضویت با ردپا؛ پرونده‌ی تازه‌ی واحد برمی‌گردد */
  removeResident: (membershipId: string) => api.delete<UnitFile>(sc(`${I}/memberships/${membershipId}`)),
  rules: (buildingId: string) => api.get<BuildingRules>(`${I}/buildings/${buildingId}/rules`),
  saveRules: (buildingId: string, body: { debtor_grace_days: number; restrictions: Record<string, boolean> }) =>
    api.put<BuildingRules>(`${I}/buildings/${buildingId}/rules`, body),

  // ── سوپرادمین ──
  adminResidents: (q?: string, buildingId?: string) =>
    api.get<{ buildings: BuildingOccupancy[]; people: PersonHit[] }>(`${I}/admin/residents${qs({ q, building_id: buildingId })}`),
  adminUser: (id: string) => api.get<PersonFile>(`${I}/admin/users/${id}`),
  adminAction: (id: string, action: 'logout-all' | 'block' | 'unblock') => api.post<{ ok: boolean }>(`${I}/admin/users/${id}/${action}`),
  adminMerge: (id: string, otherId: string) => api.post<{ ok: boolean; moved_memberships: number }>(`${I}/admin/users/${id}/merge`, { other_user_id: otherId }),

  // ── سرپرست خانوار ──
  household: () => api.get<Household>(`${I}/me/household`),
  addMember: (body: Record<string, unknown>) =>
    api.post<{ membership_id: string; status: string; preset: string | null; household: Household }>(`${I}/me/household/members`, body),
  resendInvite: (id: string) => api.post<{ ok: boolean; name: string }>(`${I}/me/household/members/${id}/resend-invite`),
  removeMember: (id: string) => api.delete<Household>(`${I}/me/household/members/${id}`),
  transferHead: (membershipId: string) => api.post<Household>(`${I}/me/household/transfer-head`, { membership_id: membershipId }),
  parentControl: (id: string) => api.get<ParentControl>(`${I}/me/household/members/${id}/parent-control`),
  saveParentControl: (id: string, body: Record<string, unknown>) => api.put<ParentControl>(`${I}/me/household/members/${id}/parent-control`, body),
  loginCode: (id: string) =>
    api.post<{ code: string; qr_token: string; qr_payload: string; subdomain: string; expires_at: string }>(`${I}/me/household/members/${id}/login-code`),
  decideJoin: (id: string, approve: boolean) => api.post<Household>(`${I}/me/household/join-requests/${id}/${approve ? 'approve' : 'reject'}`, {}),
  childRequests: (status = 'pending') => api.get<ChildRequest[]>(`${I}/me/child-requests${qs({ status })}`),
  decideChild: (id: string, approve: boolean, body: Record<string, unknown> = {}) =>
    api.post<{ status: string; credit: Credit; cap_raised_to: number | null }>(`${I}/child-requests/${id}/${approve ? 'approve' : 'reject'}`, body),

  // ── کودک و همه ──
  familyCode: (tenantSubdomain: string, code: { code?: string; qr_token?: string }) =>
    api
      .post<{ accessToken: string; refreshToken: string; user: { id: string; fullName: string; role: 'child'; tenantId: string } }>(`${I}/auth/family-code`, {
        tenantSubdomain,
        ...code,
      })
      .then((r) => {
        setToken(r.accessToken)
        setRefreshToken(r.refreshToken)
        return r
      }),
  permissions: () => api.get<Permissions>(`${I}/me/permissions`),
  childRequest: (body: { type: string; amount?: number; payload?: Record<string, unknown> }) =>
    api.post<{ status: 'placed' | 'allowed' | 'pending'; request?: { id: string; expires_at: string; reason: string }; credit: Credit }>(`${I}/me/child/requests`, body),
  myChildRequests: () => api.get<OwnChildRequest[]>(`${I}/me/child/requests`),
  exitUnlock: (pin: string) => api.post<{ ok: boolean }>(`${I}/me/exit-unlock`, { pin }),
  emergency: () => api.post<{ ok: boolean; guard_phone: string | null }>(`${I}/me/emergency`),
  inbox: () => api.get<{ unread: number; items: InboxItem[] }>(`${I}/me/notifications`),
  readInbox: (id: string | 'all') => api.post<{ ok: boolean }>(id === 'all' ? `${I}/me/notifications/read-all` : `${I}/me/notifications/${id}/read`),

  // ── عمومی ──
  lobbyInfo: (token: string) => api.get<{ building: string }>(`${I}/join/${token}`),
  lobbyJoin: (token: string, body: { name: string; phone: string; unit_no: string; residency: 'owner' | 'tenant' }) =>
    api.post<{ status: string; building: string; unit_no: string }>(`${I}/join/${token}`, body),
  inviteInfo: (token: string) =>
    api.get<{ valid: boolean; building: string; subdomain: string; unit_no: string; name: string; phone: string | null; expires_at: string }>(`${I}/invites/${token}`),
  acceptInvite: (token: string, body: { name?: string; password: string }) =>
    api.post<{ ok: boolean; subdomain: string; username: string }>(`${I}/invites/${token}/accept`, body),

  // ── رزرو مشاعات ──
  amenities: () => api.get<Amenity[]>(`${F}/amenities`),
  slots: (amenityId: string, date: string) => api.get<{ amenity: Amenity; date: string; closed: string | null; lock?: SlotLock | null; slots: Slot[] }>(`${F}/amenities/${amenityId}/slots${qs({ date })}`),
  book: (body: { amenity_id: string; start: string; hours?: number; unit_id?: string }) =>
    api.post<{ id: string; status: 'pending' | 'confirmed' | 'pending_parent'; amenity: string; start_at: string; end_at: string }>(`${F}/reservations`, body),
  myReservations: () => api.get<ReservationRow[]>(`${F}/me/reservations`),
  reservationQueue: (status = 'pending') => api.get<ReservationRow[]>(`${F}/reservations${qs({ status })}`),
  decideReservation: (id: string, approve: boolean, reason?: string) =>
    api.post<{ status: string }>(`${F}/reservations/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { reason }),
}

/** آپلود فایل (multipart) — fetch wrapper مشترک JSON می‌فرستد، پس این یکی جداست */
async function upload<T>(path: string, file: File): Promise<T> {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
  const fd = new FormData()
  fd.append('file', file)
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      body: fd,
      headers: { 'X-Session-Id': getSessionId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
  } catch (err) {
    throw new ApiError('اتصال به سرور برقرار نشد', 0, err)
  }
  const data = await res.json().catch(() => undefined)
  if (!res.ok) throw new ApiError((data as { message?: string } | undefined)?.message ?? 'آپلود ناموفق بود', res.status, data)
  return data as T
}

/** دانلود فایل با توکن (قالب اکسل) */
export async function downloadWithAuth(path: string, filename: string) {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
  const token = getToken()
  const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError('دانلود ناموفق بود', res.status)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/* ───────────── قالب‌بندی ───────────── */

export const fa = (n: number | string) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
export const toman = (n: number) => Math.round(n).toLocaleString('fa-IR')
/** «۲ ساعت پیش» */
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'همین حالا'
  if (s < 3600) return `${fa(Math.floor(s / 60))} دقیقه پیش`
  if (s < 86400) return `${fa(Math.floor(s / 3600))} ساعت پیش`
  if (s < 172800) return 'دیروز'
  return `${fa(Math.floor(s / 86400))} روز پیش`
}

/** پیام خطای API برای نمایش در toast */
export function errText(e: unknown, fallback = 'خطایی رخ داد') {
  if (e instanceof ApiError) {
    const m = (e.body as { message?: unknown } | undefined)?.message
    if (Array.isArray(m)) return String(m[0])
    return e.message || fallback
  }
  return fallback
}
