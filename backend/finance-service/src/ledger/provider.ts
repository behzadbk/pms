/**
 * لایه‌ی اتصال «فقط‌خواندنی» به نرم‌افزار حسابداری مجموعه.
 *
 * «همین» نرم‌افزار حسابداری نیست: دفتر کل، حقوق‌ودستمزد و اسناد در نرم‌افزار حسابداری خودِ مجموعه می‌مانند و این لایه
 * فقط می‌خواند و به یک شکل یکدست (همین فایل) تبدیل می‌کند تا پروفایل مالی واحد/کارمند در پنل نمایش داده شود.
 * هیچ‌چیزی از این داده‌ها در دیتابیس ما ذخیره یا از اینجا به نرم‌افزار حسابداری نوشته نمی‌شود.
 *
 * منبع‌ها دو تا هستند و مستقل از هم عوض می‌شوند:
 *  - UnitLedgerSource  : حساب هر واحد (شارژ، شارژ متغیر، جریمه، پرداخت‌ها)
 *  - StaffLedgerSource : حساب هر کارمند (فیش حقوقی، پرداخت‌ها، پاداش/جریمه)
 * برای وصل کردن یک نرم‌افزار واقعی (هلو، سپیدار، حسابفا، …) فقط یک کلاس جدید که یکی از این دو interface را پیاده کند
 * و در ledger.module.ts ثبت شود کافی است؛ کنترلر و فرانت دست نمی‌خورند.
 */

export type EntryKind = 'charge' | 'variable' | 'penalty' | 'payment' | 'adjustment'

/** یک ردیف دفتر. debit = بدهکار شدن واحد/کارمند، credit = تسویه/پرداخت (مبالغ تومان) */
export interface LedgerEntry {
  date: string | null // YYYY-MM-DD میلادی
  period: string | null // شمسی YYYY-MM
  kind: EntryKind
  title: string
  debit: number
  credit: number
  ref?: string | null
}

export interface SourceStatus {
  /** نام فنی منبع: internal | demo | none | نام درایور آینده */
  source: string
  /** آیا واقعاً داده‌ای از نرم‌افزار حسابداری/منبع می‌آید؟ */
  connected: boolean
  label: string
}

export interface UnitRow {
  unit_id: string
  unit_number: string
  floor: number | null
  area: number | null
  balance: number
  overdue_count: number
  last_payment_at: string | null
}

export interface UnitProfile {
  source: string
  unit: { unit_id: string; unit_number: string; floor: number | null; area: number | null }
  summary: {
    total_fixed: number
    total_variable: number
    total_penalty: number
    total_paid: number
    /** مثبت = بدهکار */
    balance: number
    overdue_count: number
    last_payment_at: string | null
  }
  /** جمع هر دوره، جدیدترین اول */
  periods: { period: string; fixed: number; variable: number; penalty: number; total: number; paid: number; status: 'pending' | 'paid' | 'overdue'; due_date: string | null }[]
  entries: LedgerEntry[]
}

export interface StaffRow {
  id: string
  full_name: string
  department: string | null
  is_active: boolean
}

export interface StaffProfile {
  source: string
  /** false = منبعی برای حقوق وصل نشده؛ فرانت پیام «اتصال برقرار نیست» نشان می‌دهد */
  available: boolean
  staff: StaffRow
  summary: { total_net: number; total_paid: number; balance: number; total_bonus: number; total_penalty: number; last_payment_at: string | null }
  payslips: { period: string; base: number; overtime: number; bonus: number; deductions: number; net: number; paid: boolean }[]
  entries: LedgerEntry[]
}

export interface UnitLedgerSource {
  status(): SourceStatus
  listUnits(client: Q): Promise<UnitRow[]>
  unitProfile(client: Q, unitId: string): Promise<UnitProfile | null>
}

export interface StaffLedgerSource {
  status(): SourceStatus
  staffProfile(staff: StaffRow, period?: string): Promise<StaffProfile>
}

/** حداقل رابط pg client که منبع‌ها لازم دارند */
export interface Q {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export const UNIT_SOURCE = Symbol('UNIT_LEDGER_SOURCE')
export const STAFF_SOURCE = Symbol('STAFF_LEDGER_SOURCE')
