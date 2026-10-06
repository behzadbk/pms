import type { ImportChargeRow, ImportInvoiceRow } from './api/finance'
import { JALALI_MONTHS } from './jalali'

/**
 * ورود اطلاعات از فایل حسابداری (اکسل/CSV). ستون‌ها با عنوان فارسی یا انگلیسی شناخته می‌شوند و
 * ردیف‌های ناقص با شماره‌ی ردیف گزارش می‌شوند؛ فقط ردیف‌های سالم وارد می‌شوند.
 */
export type ImportKind = 'charges' | 'expenses'

export interface ParsedImport<T> {
  rows: T[]
  errors: { line: number; message: string }[]
}

type Cell = string | number | boolean | Date | null | undefined

const FA = '۰۱۲۳۴۵۶۷۸۹'
const AR = '٠١٢٣٤٥٦٧٨٩'
/** ارقام فارسی/عربی → انگلیسی */
export const normDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))

const norm = (s: unknown) => normDigits(String(s ?? '')).replace(/[‌‏‎]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase()

/** مبلغ: «۱٬۲۰۰٬۰۰۰» / «1,200,000» / عدد خام */
export function parseAmount(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null
  const t = normDigits(String(v ?? '')).replace(/[,٬،\s]/g, '').replace(/تومان|ریال/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** تاریخ جلالی «۱۴۰۵/۰۷/۱۰» یا میلادی ISO/Date → ISO (جلالی با تبدیل تقریبی به میلادی نگه داشته نمی‌شود؛ متن اصلی می‌ماند) */
export function parseDateCell(v: Cell): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  const t = normDigits(String(v ?? '')).trim().replace(/-/g, '/')
  if (!t) return null
  const m = t.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  if (y >= 1300 && y <= 1500) return jalaliToIso(y, mo, d)
  const dt = new Date(Date.UTC(y, mo - 1, d, 9))
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

// تبدیل جلالی→میلادی مخصوص این فایل (الگوریتم حسابیِ چرخه‌ی ۳۳ ساله). یک پیاده‌سازی دقیق‌تر و آزموده‌شده‌تر
// (jalaali-js) در lib/jalali.ts هست؛ این نسخه تکراری است و ممکن است در سال‌های دور یک روز با تقویم رسمی اختلاف داشته باشد.
function jalaliToIso(jy: number, jm: number, jd: number): string {
  // الگوریتم استاندارد جلالی → میلادی
  jy -= 979
  const jDays = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186) + jd - 1
  // از این‌جا شماره‌ی روز (jDays) به تاریخ میلادی برمی‌گردد با شکستنِ چرخه‌ها: ۴۰۰ ساله (۱۴۶٬۰۹۷ روز)، ۱۰۰ ساله (۳۶٬۵۲۴)،
  // ۴ ساله (۱۴۶۱) و ۱ ساله (۳۶۵)؛ leap مشخص می‌کند سال میلادیِ نتیجه کبیسه است تا فوریه ۲۹ روزه حساب شود.
  let g = 1600 + 400 * Math.floor((jDays + 79) / 146097)
  let days = (jDays + 79) % 146097
  let leap = true
  if (days >= 36525) {
    days--
    g += 100 * Math.floor(days / 36524)
    days %= 36524
    if (days >= 365) days++
    else leap = false
  }
  g += 4 * Math.floor(days / 1461)
  days %= 1461
  if (days >= 366) {
    leap = false
    days--
    g += Math.floor(days / 365)
    days %= 365
  }
  const md = [31, leap || (g % 4 === 0 && (g % 100 !== 0 || g % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 0
  for (; gm < 12 && days >= md[gm]; gm++) days -= md[gm]
  // ساعت ۹ UTC (حدود ۱۲:۳۰ تهران) انتخاب شده تا هنگام تبدیل به منطقه‌ی زمانی، تاریخ به روز قبل/بعد نپرد.
  return new Date(Date.UTC(g, gm, days + 1, 9)).toISOString()
}

/** CSV ساده با کوتیشن؛ جداکننده‌ی , یا ; یا تب خودکار تشخیص داده می‌شود */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const first = t.split(/\r?\n/, 1)[0] ?? ''
  // جداکننده خودکار حدس زده می‌شود: در سطر اول، هر کاراکتر (کاما، ;، تب) که بیشترین تعداد ستون را بدهد برنده است
  // (اکسل فارسی معمولاً ; می‌گذارد).
  const sep = [',', ';', '\t'].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const out: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    // ماشین حالت ساده‌ی CSV: داخل کوتیشن (q) جداکننده و خط‌جدید متنِ خود سلول‌اند؛ «""» دوتایی یعنی یک کوتیشنِ واقعی.
    // خارج از کوتیشن، جداکننده ستون را می‌بندد و \n / \r\n ردیف را؛ ردیف‌های کاملاً خالی نادیده گرفته می‌شوند.
    if (q) {
      if (ch === '"' && t[i + 1] === '"') (cur += '"'), i++
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) (row.push(cur), (cur = ''))
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((c) => c.trim())) out.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some((c) => c.trim())) out.push(row)
  return out
}

const HEAD: Record<string, string[]> = {
  unit: ['واحد', 'شماره واحد', 'unit'],
  period: ['دوره', 'ماه', 'period'],
  amount: ['مبلغ', 'مبلغ شارژ', 'amount', 'total'],
  status: ['وضعیت', 'status'],
  due: ['سررسید', 'تاریخ سررسید', 'due', 'due date'],
  paid: ['تاریخ پرداخت', 'پرداخت', 'paid at'],
  date: ['تاریخ', 'تاریخ فاکتور', 'date'],
  vendor: ['فروشنده', 'طرف حساب', 'vendor'],
  category: ['دسته', 'دسته‌بندی', 'دسته بندی', 'category'],
  desc: ['شرح', 'توضیحات', 'description'],
  number: ['شماره', 'شماره فاکتور', 'number'],
}

// ستون‌ها بر اساس «عنوانِ نرمال‌شده» پیدا می‌شوند، نه ترتیب؛ پس فایل می‌تواند ستون‌ها را هر جا و فارسی یا انگلیسی
// داشته باشد (فهرست نام‌های پذیرفته در HEAD). ستونی که پیدا نشود در idx نمی‌آید و کنترل ستون‌های الزامی پایین‌تر است.
function indexHeaders(header: Cell[]) {
  const idx: Record<string, number> = {}
  const h = header.map(norm)
  for (const [k, names] of Object.entries(HEAD)) {
    const i = h.findIndex((x) => names.some((n) => norm(n) === x))
    if (i >= 0) idx[k] = i
  }
  return idx
}

function chargeStatus(v: Cell): ImportChargeRow['status'] | null {
  const t = norm(v)
  if (!t) return 'pending'
  // ترتیب بررسی مهم است (اول paid، بعد overdue، بعد pending) و مقایسه با includes است. توجه: includes('paid') روی عبارت
  // انگلیسی «unpaid» هم true می‌شود؛ پس در فایل‌های انگلیسی برای وضعیت پرداخت‌نشده از «pending» یا «معوق» استفاده کنید.
  if (['پرداخت شده', 'پرداخت‌شده', 'پرداختی', 'paid', 'تسویه'].some((x) => t.includes(norm(x)))) return 'paid'
  if (['معوق', 'overdue', 'بدهکار'].some((x) => t.includes(norm(x)))) return 'overdue'
  if (['در انتظار', 'pending', 'پرداخت نشده', 'پرداخت‌نشده'].some((x) => t.includes(norm(x)))) return 'pending'
  return null
}

const isoOf = (v: Cell) => parseDateCell(v)?.slice(0, 10) ?? null

/** دوره: «1405-07» / «۱۴۰۵/۷» / «مهر ۱۴۰۵» → 'YYYY-MM' (شمسی) */
export function parsePeriodCell(v: Cell): string | null {
  const t = norm(v).replace(/[/\s]+/g, '-')
  let m = t.match(/^(\d{4})-(\d{1,2})$/)
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2].padStart(2, '0')}` : null
  m = norm(v).match(/^(\S+)\s+(\d{4})$/)
  const mi = m ? JALALI_MONTHS.findIndex((x) => norm(x) === m![1]) : -1
  return m && mi >= 0 ? `${m[2]}-${String(mi + 1).padStart(2, '0')}` : null
}

export function parseCharges(table: Cell[][]): ParsedImport<ImportChargeRow> {
  const out: ParsedImport<ImportChargeRow> = { rows: [], errors: [] }
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'فایل ردیف داده ندارد' }] }
  const ix = indexHeaders(table[0])
  const missing = (['unit', 'period', 'amount'] as const).filter((k) => ix[k] === undefined)
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `ستون‌های لازم پیدا نشد: ${missing.map((m) => HEAD[m][0]).join('، ')}` }] }
  table.slice(1).forEach((r, i) => {
    const line = i + 2
    if (!r.some((c) => String(c ?? '').trim())) return
    const unit = normDigits(String(r[ix.unit] ?? '')).trim()
    const period = parsePeriodCell(r[ix.period])
    const amount = parseAmount(r[ix.amount])
    const status = chargeStatus(ix.status !== undefined ? r[ix.status] : '')
    if (!unit) return out.errors.push({ line, message: 'شماره‌ی واحد خالی است' })
    if (!period) return out.errors.push({ line, message: 'دوره نامعتبر است (مثل مهر ۱۴۰۵ یا ۱۴۰۵-۰۷)' })
    if (amount === null || amount < 0) return out.errors.push({ line, message: 'مبلغ نامعتبر است' })
    if (!status) return out.errors.push({ line, message: 'وضعیت باید «پرداخت‌شده / در انتظار / معوق» باشد' })
    const dueRaw = ix.due !== undefined ? String(r[ix.due] ?? '').trim() : ''
    const due = dueRaw ? isoOf(r[ix.due]) : null
    if (dueRaw && !due) return out.errors.push({ line, message: 'تاریخ سررسید نامعتبر است' })
    const paidRaw = ix.paid !== undefined ? String(r[ix.paid] ?? '').trim() : ''
    const paidOn = paidRaw ? isoOf(r[ix.paid]) : null
    if (paidRaw && !paidOn) return out.errors.push({ line, message: 'تاریخ پرداخت نامعتبر است' })
    out.rows.push({ line, unit_number: unit, period, amount, status, ...(due ? { due_date: due } : {}), ...(status === 'paid' && paidOn ? { paid_on: paidOn } : {}) })
  })
  return out
}

export function parseExpenses(table: Cell[][]): ParsedImport<ImportInvoiceRow> {
  const out: ParsedImport<ImportInvoiceRow> = { rows: [], errors: [] }
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'فایل ردیف داده ندارد' }] }
  const ix = indexHeaders(table[0])
  const missing = (['date', 'desc', 'amount'] as const).filter((k) => ix[k] === undefined)
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `ستون‌های لازم پیدا نشد: ${missing.map((m) => HEAD[m][0]).join('، ')}` }] }
  table.slice(1).forEach((r, i) => {
    const line = i + 2
    if (!r.some((c) => String(c ?? '').trim())) return
    const date = isoOf(r[ix.date])
    const amount = parseAmount(r[ix.amount])
    const description = String(r[ix.desc] ?? '').trim()
    if (!date) return out.errors.push({ line, message: 'تاریخ نامعتبر است (مثل ۱۴۰۵/۰۷/۱۰)' })
    if (!description) return out.errors.push({ line, message: 'شرح خالی است' })
    if (amount === null || amount <= 0) return out.errors.push({ line, message: 'مبلغ نامعتبر است' })
    const st = ix.status !== undefined ? norm(r[ix.status]) : ''
    const pending = ['در انتظار', 'پرداخت نشده', 'پرداخت‌نشده', 'pending'].some((x) => st.includes(norm(x)))
    const num = ix.number !== undefined ? String(r[ix.number] ?? '').trim() : ''
    const vendor = ix.vendor !== undefined ? String(r[ix.vendor] ?? '').trim() : ''
    const category = ix.category !== undefined ? String(r[ix.category] ?? '').trim() : ''
    out.rows.push({
      line, invoice_date: date, description, amount, status: pending ? 'pending' : 'paid',
      ...(num ? { number: num } : {}), ...(vendor ? { vendor } : {}), ...(category ? { category } : {}),
    })
  })
  return out
}

/** قالب CSV قابل دانلود (UTF-8 با BOM تا اکسل فارسی را درست باز کند) */
export const TEMPLATES: Record<ImportKind, string> = {
  charges: 'واحد,دوره,مبلغ,وضعیت,تاریخ سررسید,تاریخ پرداخت\n101,مهر ۱۴۰۵,2800000,پرداخت‌شده,1405/07/10,1405/07/05\n102,مهر ۱۴۰۵,2800000,معوق,1405/07/10,\n',
  expenses: 'تاریخ,فروشنده,دسته,شرح,مبلغ,وضعیت\n1405/07/03,شرکت توزیع برق,قبض برق و آب مشاعات,قبض برق مشاعات,4100000,پرداخت‌شده\n',
}

export async function readTable(file: File): Promise<Cell[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    return (await readSheet(file)) as Cell[][]
  }
  if (/\.(csv|tsv|txt)$/i.test(file.name)) return parseCsv(await file.text())
  throw new Error('فقط فایل اکسل (.xlsx) یا CSV پذیرفته می‌شود')
}
