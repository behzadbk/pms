/**
 * استور مشترک پنل‌ها (مدیر / ساکن / حسابداری / نگهبانی / پرسنل)
 * ─────────────────────────────────────────────────────────────
 * تا وقتی API واقعی ماژول‌های رزرو، اعلانات، تیکت، دارایی‌ها و فاکتورها در بک‌اند ساخته
 * نشده، همه‌ی فرم‌های پنل‌ها روی همین استور کار می‌کنند تا هر دکمه واقعاً عمل کند:
 *   - داده در localStorage همین مرورگر ذخیره می‌شود (رفرش صفحه آن را پاک نمی‌کند)
 *   - تغییر در یک تب (مثلاً مدیر اعلان منتشر می‌کند) آنی در تب دیگر (پنل ساکن) دیده می‌شود
 *   - اکشن‌ها (addX / updateX) دقیقاً همان قراردادی را دارند که بعداً به fetch واقعی وصل می‌شود
 *
 * برای برگرداندن داده‌ی نمونه: resetDemoStore()
 */
import { useSyncExternalStore } from 'react'
import type { Amenity, AmenitySession, BookingRule, Charge, FnbOrder, MenuItem, OrderStatus, Reservation, Role, Ticket } from './types'
import {
  amenitiesList,
  amenitySessions,
  bookingRules,
  charges as seedCharges,
  reservations as seedReservations,
  tickets as seedTickets,
  menuItems as seedMenuItems,
  kitchenQueue as seedKitchenQueue,
  fnbVenues,
} from './mockData'

/* ═══════════════════════════ انواع ═══════════════════════════ */

export interface ReservationRec extends Reservation {
  amenityId: string
  source: 'app' | 'manual'
  contactName?: string
  contactPhone?: string
  note?: string
  rejectReason?: string
  decidedAt?: string
  createdAt: string
}

/** مخاطب اعلان/نظرسنجی — نقش‌ها + بخش‌های تعریف‌شده (بلوک‌ها) + واحد مشخص */
export type AudienceKey = string

export const audienceGroups: { key: AudienceKey; label: string; group: 'نقش' | 'بخش' }[] = [
  { key: 'all_residents', label: 'همه‌ی ساکنین', group: 'نقش' },
  { key: 'owners', label: 'فقط مالکین', group: 'نقش' },
  { key: 'tenants', label: 'فقط مستأجرین', group: 'نقش' },
  { key: 'staff', label: 'پرسنل / استف', group: 'نقش' },
  { key: 'guard', label: 'نگهبانی', group: 'نقش' },
  { key: 'accountant', label: 'حسابداری', group: 'نقش' },
  { key: 'block:A', label: 'بلوک A', group: 'بخش' },
  { key: 'block:B', label: 'بلوک B', group: 'بخش' },
  { key: 'block:C', label: 'بلوک C', group: 'بخش' },
]

export function audienceLabel(key: AudienceKey) {
  if (key.startsWith('unit:')) return key.slice(5)
  return audienceGroups.find((a) => a.key === key)?.label ?? key
}

/**
 * کاربر فعلی (در حالت دمو بر اساس نقش) در کدام مخاطب‌ها قرار می‌گیرد.
 * بعداً از پروفایل واقعی (واحد، بلوک، مالک/مستأجر) در /auth/me پر می‌شود.
 */
export function viewerAudiences(role: Role, perms: string[] = []): AudienceKey[] {
  switch (role) {
    case 'resident':
      return ['all_residents', 'owners', 'block:A', 'unit:واحد ۱۲']
    case 'admin':
      return ['admin']
    case 'staff':
      // کارمند علاوه بر «پرسنل»، اعلان‌های مخصوص دسترسی‌هایش را هم می‌گیرد (مثلاً perm:amenity_desk)
      return ['staff', ...perms.map((p) => `perm:${p}`)]
    default:
      return [role]
  }
}

export const DEMO_RESIDENT_UNIT = 'واحد ۱۲'

export interface PollOption {
  id: string
  label: string
  votes: number
}
export interface PollQuestion {
  id: string
  text: string
  multi: boolean
  options: PollOption[]
}

export interface AnnouncementRec {
  id: string
  kind: 'announcement' | 'poll'
  title: string
  body: string
  emergency: boolean
  audience: AudienceKey[]
  createdAt: string
  closesAt?: string
  weighted?: boolean
  questions: PollQuestion[]
  /** voterKey → true ؛ برای جلوگیری از رأی تکراری */
  voters: Record<string, true>
}

export interface NotificationRec {
  id: string
  kind: 'announcement' | 'poll' | 'reservation' | 'ticket' | 'finance'
  title: string
  body: string
  audience: AudienceKey[]
  link?: string
  createdAt: string
  readBy: string[]
}

export type AssetCategory = 'elevator' | 'lighting' | 'plumbing' | 'hvac' | 'fire' | 'electrical' | 'door' | 'other'

export const assetCategoryInfo: Record<AssetCategory, { label: string; keywords: string[] }> = {
  elevator: { label: 'آسانسور', keywords: ['آسانسور', 'اسانسور', 'بالابر', 'کابین'] },
  lighting: { label: 'روشنایی', keywords: ['چراغ', 'لامپ', 'مهتابی', 'روشنایی', 'پرژکتور', 'ال‌ای‌دی', 'led'] },
  plumbing: { label: 'لوله‌کشی و آب', keywords: ['نشتی', 'لوله', 'آب', 'فاضلاب', 'شیر', 'چکه', 'پمپ'] },
  hvac: { label: 'موتورخانه و تهویه', keywords: ['موتورخانه', 'پکیج', 'شوفاژ', 'چیلر', 'کولر', 'گرمایش', 'تهویه', 'رادیاتور'] },
  fire: { label: 'اطفا حریق', keywords: ['کپسول', 'آتش', 'حریق', 'اسپرینکلر', 'دتکتور'] },
  electrical: { label: 'برق', keywords: ['برق', 'فیوز', 'کنتور', 'پریز', 'سیم', 'تابلو برق'] },
  door: { label: 'درب و ورودی', keywords: ['درب', 'راهبند', 'جک', 'قفل', 'آیفون'] },
  other: { label: 'سایر', keywords: [] },
}

export interface AssetRec {
  id: string
  name: string
  category: AssetCategory
  location: string
  /** سرویس دوره‌ای پیشنهادی (روز) — برای هشدار «سررسید سرویس» */
  serviceIntervalDays?: number
}

export interface ServiceRecord {
  id: string
  assetId: string
  date: string // ISO
  type: 'repair' | 'replace' | 'service' | 'inspection'
  description: string
  performer: string
  cost: number
  ticketId?: string
}

export const serviceTypeLabel: Record<ServiceRecord['type'], string> = {
  repair: 'تعمیر',
  replace: 'تعویض',
  service: 'سرویس دوره‌ای',
  inspection: 'بازدید',
}

export type TicketKind = 'fault' | 'criticism' | 'suggestion' | 'direct'

export const ticketKindInfo: Record<TicketKind, { label: string; category: string }> = {
  fault: { label: 'گزارش خرابی', category: 'گزارش خرابی' },
  criticism: { label: 'انتقاد', category: 'انتقاد' },
  suggestion: { label: 'پیشنهاد', category: 'پیشنهاد' },
  direct: { label: 'پیام مستقیم به مدیر', category: 'پیام به مدیر' },
}

export interface TicketRec extends Ticket {
  kind?: TicketKind
  /** محل خرابی — مثلاً «طبقه ۳ · واحد ۱۲» یا «پارکینگ طبقه -۱» */
  location?: string
  body: string
  reporter: string
  assetId?: string
  createdIso: string
  timeline: { at: string; text: string }[]
}

export interface InvoiceItem {
  title: string
  qty: number
  unitPrice: number
}

export interface InvoiceRec {
  id: string
  number: string
  vendor: string
  category: string
  description: string
  items: InvoiceItem[]
  amount: number
  issuedAt: string // ISO
  status: 'paid' | 'pending'
  method: string
  registeredBy: string
  attachmentName?: string
  paidAt?: string
}

export const expenseCategories = [
  'حقوق و دستمزد پرسنل',
  'قبض برق و آب مشاعات',
  'نظافت و مواد مصرفی',
  'تعمیر و نگهداری',
  'بیمه و متفرقه',
]

export interface ChargeRec extends Charge {
  paidAt?: string
  payMethod?: string
}

export interface DemoState {
  version: number
  amenities: Amenity[]
  rules: Record<string, BookingRule>
  sessions: AmenitySession[]
  reservations: ReservationRec[]
  announcements: AnnouncementRec[]
  notifications: NotificationRec[]
  tickets: TicketRec[]
  assets: AssetRec[]
  services: ServiceRecord[]
  invoices: InvoiceRec[]
  charges: ChargeRec[]
  menu: MenuItem[]
  orders: FnbOrder[]
}

/* ═══════════════════════════ داده‌ی اولیه ═══════════════════════════ */

const STORAGE_KEY = 'hamin.demo-store'
const VERSION = 2

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

export function faDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fa-IR')
}

export function faDateTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('fa-IR')} · ${d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`
}

export function daysBetween(fromIso: string, to = new Date()) {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000)
}

const ticketBodies: Record<string, { body: string; reporter: string; assetId?: string; ago: number }> = {
  t1: { body: 'از دیروز کف پارکینگ طبقه -۱ کنار ستون ۱۲ آب جمع شده؛ به نظر می‌رسد از لوله‌ی سقف نشت می‌کند.', reporter: 'نگهبانی شیفت شب', ago: 2 },
  t2: { body: 'موقع حرکت بین طبقه ۴ و ۵ صدای ساییدگی شدید می‌دهد و کابین کمی تکان می‌خورد. چند نفر از ساکنین هم گزارش داده‌اند.', reporter: 'واحد ۱۸', ago: 0 },
  t3: { body: 'پیشنهاد می‌کنم برای امنیت بیشتر، در راهروی طبقه دوم دوربین نصب شود.', reporter: 'واحد ۷', ago: 7 },
  t4: { body: 'لامپ راه‌پله طبقه ۳ سوخته و شب‌ها راه‌پله کاملاً تاریک است.', reporter: 'واحد ۱۲', ago: 3 },
}

function seed(): DemoState {
  const assets: AssetRec[] = [
    { id: 'as-elev-a', name: 'آسانسور A', category: 'elevator', location: 'لابی بلوک A', serviceIntervalDays: 30 },
    { id: 'as-elev-b', name: 'آسانسور B', category: 'elevator', location: 'لابی بلوک B', serviceIntervalDays: 30 },
    { id: 'as-boiler', name: 'موتورخانه مرکزی', category: 'hvac', location: 'زیرزمین', serviceIntervalDays: 90 },
    { id: 'as-pipe-p1', name: 'لوله‌کشی مشاعات پارکینگ -۱', category: 'plumbing', location: 'پارکینگ طبقه -۱' },
    { id: 'as-fire', name: 'سیستم اطفا حریق', category: 'fire', location: 'کل ساختمان', serviceIntervalDays: 365 },
    { id: 'as-light-st3', name: 'روشنایی راه‌پله طبقه ۳', category: 'lighting', location: 'راه‌پله طبقه ۳' },
  ]

  const services: ServiceRecord[] = [
    { id: uid('sv'), assetId: 'as-elev-b', date: daysAgo(34), type: 'service', description: 'سرویس ماهانه، روغن‌کاری ریل و بررسی ترمز', performer: 'شرکت آسانسور پارس', cost: 3_500_000 },
    { id: uid('sv'), assetId: 'as-elev-b', date: daysAgo(96), type: 'repair', description: 'تعویض کفشک‌های راهنمای کابین', performer: 'شرکت آسانسور پارس', cost: 8_200_000 },
    { id: uid('sv'), assetId: 'as-elev-a', date: daysAgo(12), type: 'service', description: 'سرویس ماهانه', performer: 'شرکت آسانسور پارس', cost: 3_500_000 },
    { id: uid('sv'), assetId: 'as-boiler', date: daysAgo(60), type: 'service', description: 'سرویس دیگ و مشعل پیش از فصل سرما', performer: 'تأسیسات نوین', cost: 6_000_000 },
    { id: uid('sv'), assetId: 'as-light-st3', date: daysAgo(145), type: 'replace', description: 'تعویض لامپ LED ۱۸ وات', performer: 'ن. صادقی (پرسنل فنی)', cost: 180_000 },
    { id: uid('sv'), assetId: 'as-fire', date: daysAgo(300), type: 'inspection', description: 'شارژ و بازدید سالانه کپسول‌ها', performer: 'ایمن‌گستر', cost: 4_400_000 },
  ]

  const tickets: TicketRec[] = seedTickets.map((t) => {
    const extra = ticketBodies[t.id]
    return {
      ...t,
      body: extra?.body ?? '',
      reporter: extra?.reporter ?? t.unit,
      createdIso: daysAgo(extra?.ago ?? 1),
      timeline: [{ at: daysAgo(extra?.ago ?? 1), text: 'تیکت ثبت شد' }],
    }
  })

  const reservations: ReservationRec[] = seedReservations.map((r) => ({
    ...r,
    amenityId: amenitiesList.find((a) => a.name === r.amenity)?.id ?? amenitiesList[0].id,
    source: 'app',
    createdAt: daysAgo(1),
  }))

  const announcements: AnnouncementRec[] = [
    {
      id: 'an1', kind: 'announcement', title: 'قطعی آب — چهارشنبه', emergency: true,
      body: 'به دلیل تعمیرات لوله‌کشی، از ساعت ۹ تا ۱۳ آب ساختمان قطع خواهد بود.',
      audience: ['all_residents', 'staff', 'guard'], createdAt: daysAgo(0), questions: [], voters: {},
    },
    {
      id: 'an2', kind: 'announcement', title: 'شستشوی نمای ساختمان', emergency: false,
      body: 'تیم نظافت از روز شنبه کار شستشوی نما را آغاز می‌کند.',
      audience: ['all_residents'], createdAt: daysAgo(1), questions: [], voters: {},
    },
    {
      id: 'pl1', kind: 'poll', title: 'تعویض دستگاه پارکینگ هوشمند', emergency: false,
      body: 'لطفاً نظر خود را درباره‌ی تعویض راهبند و سیستم پلاک‌خوان پارکینگ اعلام کنید.',
      audience: ['owners'], createdAt: daysAgo(3), closesAt: daysAgo(-7), weighted: true, voters: {},
      questions: [
        {
          id: 'q1', text: 'با تعویض دستگاه موافقید؟', multi: false,
          options: [
            { id: 'o1', label: 'موافقم', votes: 16 },
            { id: 'o2', label: 'مخالفم', votes: 5 },
            { id: 'o3', label: 'نظری ندارم', votes: 3 },
          ],
        },
      ],
    },
  ]

  const invoices: InvoiceRec[] = [
    {
      id: 'inv-1', number: 'F-1405-021', vendor: 'شرکت خدماتی پاکان', category: 'نظافت و مواد مصرفی',
      description: 'نظافت راه‌پله‌ها و لابی — شهریور', items: [{ title: 'نظافت راه‌پله', qty: 4, unitPrice: 650_000 }, { title: 'مواد شوینده', qty: 1, unitPrice: 600_000 }],
      amount: 3_200_000, issuedAt: daysAgo(6), status: 'paid', method: 'واریز بانکی', registeredBy: 'ف. نادری', paidAt: daysAgo(5),
    },
    {
      id: 'inv-2', number: 'B-88213', vendor: 'شرکت توزیع برق', category: 'قبض برق و آب مشاعات',
      description: 'قبض برق مشاعات دوره‌ی مرداد', items: [{ title: 'قبض برق مشاعات', qty: 1, unitPrice: 4_100_000 }],
      amount: 4_100_000, issuedAt: daysAgo(10), status: 'paid', method: 'واریز بانکی', registeredBy: 'ف. نادری', paidAt: daysAgo(9),
    },
    {
      id: 'inv-3', number: 'P-0092', vendor: 'شرکت آسانسور پارس', category: 'تعمیر و نگهداری',
      description: 'سرویس ماهانه آسانسورهای A و B', items: [{ title: 'سرویس ماهانه آسانسور', qty: 2, unitPrice: 3_500_000 }],
      amount: 7_000_000, issuedAt: daysAgo(12), status: 'pending', method: 'چک', registeredBy: 'ف. نادری',
    },
    {
      id: 'inv-4', number: 'S-1405-05', vendor: 'حقوق پرسنل', category: 'حقوق و دستمزد پرسنل',
      description: 'دستمزد سرایدار — مرداد', items: [{ title: 'حقوق ماهانه سرایدار', qty: 1, unitPrice: 12_500_000 }],
      amount: 12_500_000, issuedAt: daysAgo(24), status: 'paid', method: 'نقدی', registeredBy: 'ف. نادری', paidAt: daysAgo(24),
    },
  ]

  return {
    version: VERSION,
    amenities: amenitiesList.map((a) => ({ ...a })),
    rules: JSON.parse(JSON.stringify(bookingRules)),
    sessions: amenitySessions.map((s) => ({ ...s })),
    reservations,
    announcements,
    notifications: [
      {
        id: 'nt-seed-1', kind: 'announcement', title: 'قطعی آب — چهارشنبه', body: 'از ساعت ۹ تا ۱۳ آب ساختمان قطع خواهد بود.',
        audience: ['all_residents', 'staff', 'guard'], createdAt: daysAgo(0), readBy: [], link: '/resident/announcements',
      },
    ],
    tickets,
    assets,
    services,
    invoices,
    charges: seedCharges.map((c) => ({ ...c, paidAt: c.status === 'paid' ? daysAgo(15) : undefined, payMethod: c.status === 'paid' ? 'درگاه آنلاین' : undefined })),
    menu: seedMenuItems.map((m) => ({ ...m })),
    orders: seedKitchenQueue.map((o) => ({ ...o })),
  }
}

/* ═══════════════════════════ هسته‌ی استور ═══════════════════════════ */

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState
      if (parsed.version === VERSION) return parsed
      // نسخه‌ی قدیمی‌تر: داده‌ی ساخته‌شده توسط کاربر حفظ می‌شود و فقط بخش‌های جدید اضافه می‌شوند
      if (parsed.version < VERSION) return { ...seed(), ...parsed, version: VERSION }
    }
  } catch {
    /* localStorage در دسترس نیست (حالت خصوصی/iframe) — با داده‌ی اولیه ادامه می‌دهیم */
  }
  return seed()
}

let state: DemoState = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l())
}

export function setState(fn: (s: DemoState) => DemoState) {
  state = fn(state)
  persist()
  emit()
}

export function getState() {
  return state
}

if (typeof window !== 'undefined') {
  // همگام‌سازی بین تب‌ها: مدیر در یک تب اعلان می‌دهد، تب ساکن آنی به‌روز می‌شود
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    state = load()
    emit()
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** کل state را برمی‌گرداند؛ کامپوننت‌ها خودشان فیلتر/محاسبه می‌کنند (بدون selector تا حلقه‌ی رندر پیش نیاید) */
export function useStore(): DemoState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function resetDemoStore() {
  state = seed()
  persist()
  emit()
}

/* ═══════════════════════════ اکشن‌ها ═══════════════════════════ */

function pushNotification(s: DemoState, n: Omit<NotificationRec, 'id' | 'createdAt' | 'readBy'>): DemoState {
  return { ...s, notifications: [{ ...n, id: uid('nt'), createdAt: new Date().toISOString(), readBy: [] }, ...s.notifications] }
}

export function notify(n: Omit<NotificationRec, 'id' | 'createdAt' | 'readBy'>) {
  setState((s) => pushNotification(s, n))
}

/** readerKey: شناسه‌ی کاربر (یا نقش در حالت دمو) — تا خوانده‌شدن توسط یک کارمند برای بقیه حساب نشود */
export function markNotificationsRead(readerKey: string, aud: AudienceKey[]) {
  setState((s) => ({
    ...s,
    notifications: s.notifications.map((n) =>
      n.audience.some((a) => aud.includes(a)) && !n.readBy.includes(readerKey) ? { ...n, readBy: [...n.readBy, readerKey] } : n,
    ),
  }))
}

/* ---- مشاعات و قوانین رزرو ---- */

export const defaultRule = (amenityId: string): BookingRule => ({
  amenityId,
  maxBookingsPerUnitPerPeriod: 4,
  periodType: 'month',
  minAdvanceHours: 12,
  maxAdvanceDays: 7,
  minSlotMinutes: 60,
  maxSlotMinutes: 120,
  cancellationWindowHours: 6,
  depositAmount: 0,
  depositRefundPolicy: 'full_if_cancelled_in_window',
})

export function saveAmenity(amenity: Amenity, rule: BookingRule, sessions: AmenitySession[]) {
  setState((s) => {
    const exists = s.amenities.some((a) => a.id === amenity.id)
    return {
      ...s,
      amenities: exists ? s.amenities.map((a) => (a.id === amenity.id ? amenity : a)) : [...s.amenities, amenity],
      rules: { ...s.rules, [amenity.id]: { ...rule, amenityId: amenity.id } },
      sessions: [...s.sessions.filter((x) => x.amenityId !== amenity.id), ...sessions.map((x) => ({ ...x, amenityId: amenity.id }))],
    }
  })
}

export function deleteAmenity(id: string) {
  setState((s) => {
    const rules = { ...s.rules }
    delete rules[id]
    return {
      ...s,
      amenities: s.amenities.filter((a) => a.id !== id),
      rules,
      sessions: s.sessions.filter((x) => x.amenityId !== id),
    }
  })
}

/* ---- رزرو ---- */

export function addReservation(r: Omit<ReservationRec, 'id' | 'createdAt'>) {
  setState((s) => {
    let next: DemoState = { ...s, reservations: [{ ...r, id: uid('rs'), createdAt: new Date().toISOString() }, ...s.reservations] }
    if (r.source === 'manual') {
      next = pushNotification(next, {
        kind: 'reservation',
        title: `رزرو «${r.amenity}» برای شما ثبت شد`,
        body: `طبق هماهنگی تلفنی، ${r.amenity} در تاریخ ${r.date} ساعت ${r.time} برای ${r.unit} رزرو شد.`,
        audience: [`unit:${r.unit}`],
        link: '/resident/reservations',
      })
    } else if (r.status === 'pending') {
      next = pushNotification(next, {
        kind: 'reservation',
        title: `درخواست رزرو جدید — ${r.amenity}`,
        body: `${r.unit} برای ${r.date} ساعت ${r.time} درخواست رزرو داده است.`,
        audience: ['admin', 'perm:amenity_desk'],
        link: '/reservations',
      })
    }
    return next
  })
}

export function decideReservation(id: string, decision: 'confirmed' | 'rejected', reason?: string) {
  setState((s) => {
    const r = s.reservations.find((x) => x.id === id)
    if (!r) return s
    const next: DemoState = {
      ...s,
      reservations: s.reservations.map((x) =>
        x.id === id ? { ...x, status: decision, rejectReason: decision === 'rejected' ? reason : undefined, decidedAt: new Date().toISOString() } : x,
      ),
    }
    return pushNotification(next, {
      kind: 'reservation',
      title: decision === 'confirmed' ? `رزرو «${r.amenity}» تایید شد` : `رزرو «${r.amenity}» تایید نشد`,
      body:
        decision === 'confirmed'
          ? `رزرو شما برای ${r.date} ساعت ${r.time} توسط مدیریت تایید شد.`
          : `رزرو شما برای ${r.date} ساعت ${r.time} تایید نشد. دلیل: ${reason}`,
      audience: [`unit:${r.unit}`],
      link: '/resident/reservations',
    })
  })
}

/* ---- اعلانات و نظرسنجی ---- */

export function publishAnnouncement(a: Omit<AnnouncementRec, 'id' | 'createdAt' | 'voters'>) {
  setState((s) => {
    const rec: AnnouncementRec = { ...a, id: uid(a.kind === 'poll' ? 'pl' : 'an'), createdAt: new Date().toISOString(), voters: {} }
    const next = { ...s, announcements: [rec, ...s.announcements] }
    return pushNotification(next, {
      kind: a.kind,
      title: a.kind === 'poll' ? `نظرسنجی جدید: ${a.title}` : a.emergency ? `⚠ ${a.title}` : a.title,
      body: a.body || (a.kind === 'poll' ? 'برای شرکت در نظرسنجی وارد بخش اعلانات شوید.' : ''),
      audience: a.audience,
      link: '/announcements',
    })
  })
}

export function deleteAnnouncement(id: string) {
  setState((s) => ({ ...s, announcements: s.announcements.filter((a) => a.id !== id) }))
}

export function submitVote(pollId: string, voterKey: string, answers: Record<string, string[]>) {
  setState((s) => ({
    ...s,
    announcements: s.announcements.map((a) => {
      if (a.id !== pollId || a.voters[voterKey]) return a
      return {
        ...a,
        voters: { ...a.voters, [voterKey]: true },
        questions: a.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ((answers[q.id] ?? []).includes(o.id) ? { ...o, votes: o.votes + 1 } : o)),
        })),
      }
    }),
  }))
}

/* ---- تیکت، دارایی و سابقه‌ی سرویس ---- */

export function addTicket(t: Pick<TicketRec, 'subject' | 'body' | 'unit' | 'category' | 'priority' | 'reporter' | 'kind' | 'location'>) {
  setState((s) => {
    const now = new Date().toISOString()
    const rec: TicketRec = { ...t, id: uid('tk'), status: 'open', createdAt: 'همین حالا', createdIso: now, timeline: [{ at: now, text: 'تیکت ثبت شد' }] }
    return pushNotification({ ...s, tickets: [rec, ...s.tickets] }, {
      kind: 'ticket',
      title: t.kind === 'direct' ? `پیام جدید از ${t.unit}: ${t.subject}` : `تیکت جدید: ${t.subject}`,
      body: [t.unit, t.category, t.location].filter(Boolean).join(' · '),
      audience: t.kind === 'fault' ? ['admin', 'perm:maintenance'] : ['admin'],
      link: '/tickets',
    })
  })
}

export function updateTicket(id: string, patch: Partial<TicketRec>, timelineText?: string) {
  setState((s) => {
    const t = s.tickets.find((x) => x.id === id)
    if (!t) return s
    const now = new Date().toISOString()
    let next: DemoState = {
      ...s,
      tickets: s.tickets.map((x) =>
        x.id === id ? { ...x, ...patch, timeline: timelineText ? [...x.timeline, { at: now, text: timelineText }] : x.timeline } : x,
      ),
    }
    if (patch.status && patch.status !== t.status && t.unit.startsWith('واحد')) {
      next = pushNotification(next, {
        kind: 'ticket',
        title: `وضعیت تیکت «${t.subject}» تغییر کرد`,
        body: timelineText ?? '',
        audience: [`unit:${t.unit}`],
        link: '/resident/tickets',
      })
    }
    return next
  })
}

export function addAsset(a: Omit<AssetRec, 'id'>): string {
  const id = uid('as')
  setState((s) => ({ ...s, assets: [...s.assets, { ...a, id }] }))
  return id
}

export function addServiceRecord(r: Omit<ServiceRecord, 'id'>) {
  setState((s) => ({ ...s, services: [{ ...r, id: uid('sv') }, ...s.services] }))
}

/** تشخیص نوع خرابی از روی متن تیکت (کلیدواژه) */
export function detectCategory(text: string): AssetCategory | null {
  const t = ` ${text.toLowerCase()} `
  let best: { cat: AssetCategory; score: number } | null = null
  for (const [cat, info] of Object.entries(assetCategoryInfo) as [AssetCategory, { keywords: string[] }][]) {
    const score = info.keywords.filter((k) => t.includes(k.toLowerCase())).length
    if (score > 0 && (!best || score > best.score)) best = { cat, score }
  }
  return best?.cat ?? null
}

const normalize = (x: string) => x.replace(/[‌\s\-–—]+/g, ' ').trim()

/**
 * پیدا کردن دارایی مرتبط با تیکت: اول دارایی دستی‌انتخاب‌شده، بعد بر اساس دسته + شباهت نام/محل.
 * خروجی: دارایی دقیق (اگر پیدا شد) + همه‌ی دارایی‌های هم‌دسته برای انتخاب دستی.
 */
export function matchAsset(ticket: TicketRec, assets: AssetRec[]) {
  // متن اصلی (موضوع + توضیح) معیار اصلی است؛ محل فقط برای شکستن تساوی —
  // وگرنه «بلوک A» در محل پیش‌فرض ساکن، «آسانسور B» را با «آسانسور A» اشتباه می‌گرفت.
  const text = normalize(`${ticket.subject} ${ticket.body}`)
  const loc = normalize(ticket.location ?? '')
  const detected = detectCategory(text) ?? (loc ? detectCategory(loc) : null)
  const category = ticket.assetId ? assets.find((a) => a.id === ticket.assetId)?.category ?? detected : detected
  const candidates = category ? assets.filter((a) => a.category === category) : []
  if (ticket.assetId) return { category, asset: assets.find((a) => a.id === ticket.assetId) ?? null, candidates }

  const hits = (hay: string, words: string[]) => words.filter((w) => hay.includes(w)).length
  let asset: AssetRec | null = null
  let bestScore = 0
  for (const a of candidates) {
    // حرف تکی (مثل «B» در آسانسور B) جدا بررسی می‌شود تا با حروف دیگر اشتباه نشود
    const letter = a.name.match(/\s([A-Za-z])$/)?.[1]
    const words = normalize(`${a.name} ${a.location}`)
      .split(' ')
      .filter((w) => w.length > 1)
    const letterHit = letter ? new RegExp(`(^|\\s)${letter}(\\s|$)`).test(text) : false
    const total = hits(text, words) + (letterHit ? 2 : 0) - (letter && !letterHit ? 2 : 0) + 0.5 * hits(loc, words)
    if (total > bestScore) {
      bestScore = total
      asset = a
    }
  }
  if (asset && bestScore < 2 && candidates.length > 1) asset = null
  if (!asset && candidates.length === 1) asset = candidates[0]
  return { category, asset, candidates }
}

/* ---- مالی: فاکتور و شارژ (حسابداری) ---- */

export function addInvoice(inv: Omit<InvoiceRec, 'id'>) {
  setState((s) => {
    const next = { ...s, invoices: [{ ...inv, id: uid('inv') }, ...s.invoices] }
    return pushNotification(next, {
      kind: 'finance',
      title: `فاکتور جدید ثبت شد — ${inv.vendor}`,
      body: `${inv.description} · ${inv.amount.toLocaleString('fa-IR')} تومان`,
      audience: ['admin'],
      link: '/admin/finance',
    })
  })
}

export function updateInvoice(id: string, patch: Partial<InvoiceRec>) {
  setState((s) => ({ ...s, invoices: s.invoices.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
}

export function deleteInvoice(id: string) {
  setState((s) => ({ ...s, invoices: s.invoices.filter((x) => x.id !== id) }))
}

export function updateCharge(id: string, patch: Partial<ChargeRec>) {
  setState((s) => ({ ...s, charges: s.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
}

export function issueCharges(period: string, dueDate: string, rows: { unit: string; base: number }[]) {
  setState((s) => {
    const fresh: ChargeRec[] = rows.map((r) => ({
      id: uid('ch'), unit: r.unit, period, base: r.base, lateFee: 0, total: r.base, dueDate, status: 'pending',
    }))
    const next = { ...s, charges: [...fresh, ...s.charges.filter((c) => c.period !== period)] }
    return pushNotification(next, {
      kind: 'finance',
      title: `شارژ ${period} صادر شد`,
      body: `مهلت پرداخت: ${dueDate}`,
      audience: ['all_residents'],
      link: '/resident/charges',
    })
  })
}

/* ---- رستوران و کافی‌شاپ: منو و سفارش ---- */

export function saveMenuItem(item: MenuItem) {
  setState((s) => {
    const prev = s.menu.find((m) => m.id === item.id)
    const exists = !!prev
    let next: DemoState = { ...s, menu: exists ? s.menu.map((m) => (m.id === item.id ? item : m)) : [...s.menu, item] }
    // «غذای روز» تازه فعال شد → اعلان برای همه‌ی ساکنین
    if (item.isDailySpecial && !prev?.isDailySpecial && item.availability === 'available') {
      const venue = fnbVenues.find((v) => v.id === item.venueId)
      next = pushNotification(next, {
        kind: 'announcement',
        title: `غذای روز ${venue?.name ?? ''}: ${item.name}`,
        body: item.description || (item.price ? `${item.price.toLocaleString('fa-IR')} تومان` : 'همین حالا سفارش دهید'),
        audience: ['all_residents'],
        link: '/resident/food-order',
      })
    }
    return next
  })
}

export function deleteMenuItem(id: string) {
  setState((s) => ({ ...s, menu: s.menu.filter((m) => m.id !== id) }))
}

export function setMenuAvailability(id: string, availability: MenuItem['availability']) {
  setState((s) => ({ ...s, menu: s.menu.map((m) => (m.id === id ? { ...m, availability } : m)) }))
}

export function placeFnbOrder(o: Omit<FnbOrder, 'id' | 'orderNumber' | 'placedAt' | 'status'>): string {
  const id = uid('o')
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  setState((s) => {
    const base = o.venueId === 'v2' ? 2300 : 1050
    const num = base + s.orders.filter((x) => x.venueId === o.venueId).length
    const order: FnbOrder = { ...o, id, orderNumber: num.toLocaleString('fa-IR', { useGrouping: false }), placedAt: hhmm, status: 'placed' }
    return pushNotification({ ...s, orders: [order, ...s.orders] }, {
      kind: 'ticket',
      title: `سفارش جدید #${order.orderNumber} — ${o.destinationLabel}`,
      body: o.items.map((i) => `${i.quantity}× ${i.name}`).join('، '),
      audience: [o.venueId === 'v2' ? 'perm:cafe' : 'perm:kitchen'],
      link: o.venueId === 'v2' ? '/staff/cafe' : '/staff/kitchen',
    })
  })
  return id
}

export function setOrderStatus(id: string, status: OrderStatus) {
  setState((s) => {
    const o = s.orders.find((x) => x.id === id)
    if (!o) return s
    let next: DemoState = { ...s, orders: s.orders.map((x) => (x.id === id ? { ...x, status } : x)) }
    if (o.ownerUnit && (status === 'ready' || status === 'rejected')) {
      next = pushNotification(next, {
        kind: 'ticket',
        title: status === 'ready' ? `سفارش #${o.orderNumber} آماده است` : `سفارش #${o.orderNumber} پذیرفته نشد`,
        body: status === 'ready' ? `به‌زودی به ${o.destinationLabel} تحویل می‌شود` : 'لطفاً با کافی‌شاپ/رستوران تماس بگیرید',
        audience: [`unit:${o.ownerUnit}`],
        link: '/resident/food-order',
      })
    }
    return next
  })
}
