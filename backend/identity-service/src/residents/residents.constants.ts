/**
 * ثابت‌ها و منطق خالص ماژول ساکنین/خانوار/حالت والدین (بدون دیتابیس — تست واحد دارد).
 * مرجع: design_handoff_hamino_v5/RESIDENTS.md و فایل طراحی «Hamino - New Modules v2».
 */

export const MODULE_KEYS = ['food', 'amenity', 'guest', 'ticket', 'parcel', 'notice'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]
/** 0 پنهان · 1 با تأیید من · 2 آزاد */
export type ModuleLevel = 0 | 1 | 2
export type ModuleMap = Record<ModuleKey, ModuleLevel>

export type PresetKey = 'u7' | 'c12' | 't17'
export interface Preset {
  modules: ModuleMap
  monthly_cap: number
  quiet: boolean
  weekly_report: boolean
  exit_lock: boolean
}

/** جدول «Presets» در RESIDENTS.md — سقف به تومان */
export const PRESETS: Record<PresetKey, Preset> = {
  u7: {
    modules: { food: 0, amenity: 0, guest: 0, ticket: 0, parcel: 0, notice: 0 },
    monthly_cap: 0,
    quiet: true,
    weekly_report: true,
    exit_lock: true,
  },
  c12: {
    modules: { food: 1, amenity: 1, guest: 0, ticket: 1, parcel: 2, notice: 2 },
    monthly_cap: 500_000,
    quiet: true,
    weekly_report: true,
    exit_lock: true,
  },
  t17: {
    modules: { food: 2, amenity: 1, guest: 1, ticket: 2, parcel: 2, notice: 2 },
    monthly_cap: 1_500_000,
    quiet: false,
    weekly_report: true,
    exit_lock: false,
  },
}

export const DEFAULT_QUIET_HOURS = { from: '22:00', to: '07:00' }

/** سال شمسی جاری (تقریب کافی برای محاسبه‌ی سن: نوروز ≈ ۲۱ مارس) */
export function currentJalaliYear(now = new Date()): number {
  const g = now.getUTCFullYear()
  const beforeNowruz = now.getUTCMonth() < 2 || (now.getUTCMonth() === 2 && now.getUTCDate() < 21)
  return g - 621 - (beforeNowruz ? 1 : 0)
}

export function ageFromBirthYear(birthYear: number | null | undefined, now = new Date()): number | null {
  if (!birthYear) return null
  return Math.max(0, currentJalaliYear(now) - birthYear)
}

/** پیش‌تنظیم بر اساس سن: زیر ۷ / ۷ تا ۱۲ / ۱۳ تا ۱۷ */
export function presetForAge(age: number | null): PresetKey {
  if (age === null) return 'c12'
  if (age < 7) return 'u7'
  if (age <= 12) return 'c12'
  return 't17'
}

/**
 * آیا ویرایش والد همان پیش‌تنظیم است؟ اگر هر ردیفی عوض شود پیش‌تنظیم «سفارشی» می‌شود.
 */
export function matchPreset(p: { modules: ModuleMap; monthly_cap: number; quiet: boolean; weekly_report: boolean; exit_lock: boolean }): PresetKey | 'custom' {
  for (const key of Object.keys(PRESETS) as PresetKey[]) {
    const x = PRESETS[key]
    const same =
      MODULE_KEYS.every((k) => x.modules[k] === p.modules[k]) &&
      x.monthly_cap === p.monthly_cap &&
      x.quiet === p.quiet &&
      x.weekly_report === p.weekly_report &&
      x.exit_lock === p.exit_lock
    if (same) return key
  }
  return 'custom'
}

/** ماتریس دسترسی نقش‌ها (بخش «ماتریس» فایل طراحی) — سطح هر بخش برای نقش‌های غیرکودک */
export type Access = 'hidden' | 'approval' | 'free' | 'view'
export const APP_MODULES = ['finance', 'food', 'amenity', 'guest', 'ticket', 'parcel', 'notice', 'assembly', 'household', 'emergency'] as const
export type AppModule = (typeof APP_MODULES)[number]
export type PermissionMap = Record<AppModule, Access>

const ALL_FREE: PermissionMap = {
  finance: 'free', food: 'free', amenity: 'free', guest: 'free', ticket: 'free',
  parcel: 'free', notice: 'free', assembly: 'free', household: 'free', emergency: 'free',
}

export function roleMatrix(role: string, opts: { financeAccess?: boolean } = {}): PermissionMap {
  switch (role) {
    case 'head':
      return { ...ALL_FREE }
    case 'adult':
    case 'senior':
      return { ...ALL_FREE, finance: opts.financeAccess === false ? 'hidden' : 'free', household: 'hidden' }
    case 'caregiver':
      return {
        finance: 'hidden', food: 'hidden', amenity: 'hidden', guest: 'hidden', ticket: 'view',
        parcel: 'view', notice: 'hidden', assembly: 'hidden', household: 'hidden', emergency: 'free',
      }
    case 'owner_absent':
      return {
        finance: 'free', food: 'hidden', amenity: 'hidden', guest: 'hidden', ticket: 'view',
        parcel: 'hidden', notice: 'free', assembly: 'free', household: 'hidden', emergency: 'hidden',
      }
    default:
      return { ...ALL_FREE }
  }
}

const LEVEL_TO_ACCESS: Record<ModuleLevel, Access> = { 0: 'hidden', 1: 'approval', 2: 'free' }

/**
 * نقشه‌ی دسترسی کودک: از حالت والدین، به‌علاوه‌ی دو قاعده‌ی ثابت —
 * بخش مالی و مجمع «همیشه پنهان» (قاعده ۷) و تماس اضطراری «همیشه باز» (قاعده ۱۱).
 */
export function childPermissionMap(modules: Partial<ModuleMap>): PermissionMap {
  const lv = (k: ModuleKey): Access => LEVEL_TO_ACCESS[(modules[k] ?? 0) as ModuleLevel] ?? 'hidden'
  return {
    finance: 'hidden',
    food: lv('food'),
    amenity: lv('amenity'),
    guest: lv('guest'),
    ticket: lv('ticket'),
    parcel: lv('parcel') === 'approval' ? 'view' : lv('parcel'),
    notice: lv('notice') === 'approval' ? 'free' : lv('notice'),
    assembly: 'hidden',
    household: 'hidden',
    emergency: 'free',
  }
}

/** آیا زمان داده‌شده (ساعت:دقیقه به وقت تهران) داخل بازه‌ی سکوت است؟ بازه‌ی شبانه را درست حساب می‌کند. */
export function inQuietWindow(q: { from: string; to: string } | null | undefined, hhmm: string): boolean {
  if (!q) return false
  const { from, to } = q
  return from <= to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to
}

/** ساعت:دقیقه‌ی فعلی به وقت تهران */
export function tehranHHMM(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(now)
    .replace(/^24/, '00')
}

/**
 * تصمیم خرید کودک (قاعده ۸): اگر بخش «با تأیید» باشد یا مبلغ از مانده‌ی سقف بیشتر باشد،
 * درخواست برای والد می‌رود؛ اگر «پنهان» باشد رد می‌شود؛ وگرنه مستقیم ثبت می‌شود.
 */
export function decideChildPurchase(level: ModuleLevel, amount: number, remaining: number):
  | { kind: 'forbidden' }
  | { kind: 'request'; reason: 'approval' | 'over_cap' }
  | { kind: 'direct' } {
  if (level === 0) return { kind: 'forbidden' }
  if (level === 1) return { kind: 'request', reason: 'approval' }
  if (amount > remaining) return { kind: 'request', reason: 'over_cap' }
  return { kind: 'direct' }
}

/* ───────────── برچسب‌ها (متن‌ها عیناً از فایل طراحی) ───────────── */

export const RESIDENCY_LABEL: Record<string, string> = {
  owner: 'مالک ساکن',
  tenant: 'مستأجر',
  owner_absent: 'مالک غیرساکن',
}

export const ROLE_LABEL: Record<string, string> = {
  head: 'سرپرست خانوار',
  adult: 'بزرگسال',
  child: 'فرزند',
  caregiver: 'پرستار',
  senior: 'سالمند',
  owner_absent: 'مالک غیرساکن',
}

/** اعداد فارسی */
export function fa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

/** «۱۲۳٬۰۰۰» */
export function faMoney(n: number): string {
  return Math.round(n).toLocaleString('fa-IR')
}
