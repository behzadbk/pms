import type { ChargeRec, InvoiceRec } from './store'
import { expenseCategories } from './store'

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

/** ارقام انگلیسی → فارسی (برای نمایش دوره و سررسید مثل بقیه‌ی برنامه) */
const toFa = (s: string) => s.replace(/\d/g, (d) => FA[Number(d)])

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

function jalaliToIso(jy: number, jm: number, jd: number): string {
  // الگوریتم استاندارد جلالی → میلادی
  jy -= 979
  const jDays = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186) + jd - 1
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
  return new Date(Date.UTC(g, gm, days + 1, 9)).toISOString()
}

/** CSV ساده با کوتیشن؛ جداکننده‌ی , یا ; یا تب خودکار تشخیص داده می‌شود */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const first = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = [',', ';', '\t'].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const out: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
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

function indexHeaders(header: Cell[]) {
  const idx: Record<string, number> = {}
  const h = header.map(norm)
  for (const [k, names] of Object.entries(HEAD)) {
    const i = h.findIndex((x) => names.some((n) => norm(n) === x))
    if (i >= 0) idx[k] = i
  }
  return idx
}

function chargeStatus(v: Cell): ChargeRec['status'] | null {
  const t = norm(v)
  if (!t) return 'pending'
  if (['پرداخت شده', 'پرداخت‌شده', 'پرداختی', 'paid', 'تسویه'].some((x) => t.includes(norm(x)))) return 'paid'
  if (['معوق', 'overdue', 'بدهکار'].some((x) => t.includes(norm(x)))) return 'overdue'
  if (['در انتظار', 'pending', 'پرداخت نشده', 'پرداخت‌نشده'].some((x) => t.includes(norm(x)))) return 'pending'
  return null
}

export function parseCharges(table: Cell[][]): ParsedImport<Omit<ChargeRec, 'id'>> {
  const out: ParsedImport<Omit<ChargeRec, 'id'>> = { rows: [], errors: [] }
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'فایل ردیف داده ندارد' }] }
  const ix = indexHeaders(table[0])
  const missing = (['unit', 'period', 'amount'] as const).filter((k) => ix[k] === undefined)
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `ستون‌های لازم پیدا نشد: ${missing.map((m) => HEAD[m][0]).join('، ')}` }] }
  table.slice(1).forEach((r, i) => {
    const line = i + 2
    if (!r.some((c) => String(c ?? '').trim())) return
    const unit = normDigits(String(r[ix.unit] ?? '')).trim()
    const period = toFa(normDigits(String(r[ix.period] ?? '')).trim())
    const amount = parseAmount(r[ix.amount])
    const status = chargeStatus(ix.status !== undefined ? r[ix.status] : '')
    if (!unit) return out.errors.push({ line, message: 'شماره‌ی واحد خالی است' })
    if (!period) return out.errors.push({ line, message: 'دوره خالی است' })
    if (amount === null || amount < 0) return out.errors.push({ line, message: 'مبلغ نامعتبر است' })
    if (!status) return out.errors.push({ line, message: 'وضعیت باید «پرداخت‌شده / در انتظار / معوق» باشد' })
    const due = ix.due !== undefined ? parseDateCell(r[ix.due]) : null
    if (ix.due !== undefined && String(r[ix.due] ?? '').trim() && !due) return out.errors.push({ line, message: 'تاریخ سررسید نامعتبر است' })
    const paidAt = ix.paid !== undefined ? parseDateCell(r[ix.paid]) : null
    out.rows.push({
      unit, period, base: amount, lateFee: 0, total: amount, dueDate: ix.due !== undefined ? toFa(normDigits(String(r[ix.due] ?? '')).trim()) : '',
      status, paidAt: status === 'paid' ? (paidAt ?? new Date().toISOString()) : undefined, payMethod: status === 'paid' ? 'ورود از فایل حسابداری' : undefined,
    })
  })
  return out
}

export function parseExpenses(table: Cell[][], registeredBy: string): ParsedImport<Omit<InvoiceRec, 'id'>> {
  const out: ParsedImport<Omit<InvoiceRec, 'id'>> = { rows: [], errors: [] }
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'فایل ردیف داده ندارد' }] }
  const ix = indexHeaders(table[0])
  const missing = (['date', 'desc', 'amount'] as const).filter((k) => ix[k] === undefined)
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `ستون‌های لازم پیدا نشد: ${missing.map((m) => HEAD[m][0]).join('، ')}` }] }
  table.slice(1).forEach((r, i) => {
    const line = i + 2
    if (!r.some((c) => String(c ?? '').trim())) return
    const issuedAt = parseDateCell(r[ix.date])
    const amount = parseAmount(r[ix.amount])
    const description = String(r[ix.desc] ?? '').trim()
    if (!issuedAt) return out.errors.push({ line, message: 'تاریخ نامعتبر است (مثل ۱۴۰۵/۰۷/۱۰)' })
    if (!description) return out.errors.push({ line, message: 'شرح خالی است' })
    if (amount === null || amount <= 0) return out.errors.push({ line, message: 'مبلغ نامعتبر است' })
    const rawCat = ix.category !== undefined ? String(r[ix.category] ?? '').trim() : ''
    const category = expenseCategories.find((c) => norm(c) === norm(rawCat)) ?? (rawCat || 'بیمه و متفرقه')
    const st = ix.status !== undefined ? norm(r[ix.status]) : 'پرداخت شده'
    const paid = !st || st.includes(norm('پرداخت شده')) || st.includes(norm('پرداخت‌شده')) || st === 'paid'
    const vendor = ix.vendor !== undefined ? String(r[ix.vendor] ?? '').trim() : ''
    out.rows.push({
      number: ix.number !== undefined ? String(r[ix.number] ?? '').trim() || '—' : '—',
      vendor: vendor || 'نامشخص', category, description, items: [{ title: description, qty: 1, unitPrice: amount }], amount, issuedAt,
      status: paid ? 'paid' : 'pending', method: 'ورود از فایل حسابداری', registeredBy, paidAt: paid ? issuedAt : undefined,
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
