import { Injectable } from '@nestjs/common'
import type { LedgerEntry, SourceStatus, StaffLedgerSource, StaffProfile, StaffRow } from './provider'

const emptySummary = { total_net: 0, total_paid: 0, balance: 0, total_bonus: 0, total_penalty: 0, last_payment_at: null }

/**
 * پیش‌فرض: هنوز نرم‌افزار حسابداری برای حقوق وصل نشده. چیزی ساخته نمی‌شود و فرانت «اتصال برقرار نیست» را نشان می‌دهد.
 * (قانون محصول: ساختمان تازه خام و خالی است؛ هرگز داده‌ی دمو نمی‌گیرد.)
 */
@Injectable()
export class NoStaffSource implements StaffLedgerSource {
  status(): SourceStatus {
    return { source: 'none', connected: false, label: 'اتصال به نرم‌افزار حسابداری برای حقوق برقرار نیست' }
  }
  async staffProfile(staff: StaffRow): Promise<StaffProfile> {
    return { source: 'none', available: false, staff, summary: emptySummary, payslips: [], entries: [] }
  }
}

const BASE: Record<string, number> = { lobby: 14_000_000, amenity_desk: 15_000_000, kitchen: 16_000_000, cafe: 13_500_000, security: 13_000_000, maintenance: 17_000_000, cleaning: 11_500_000 }
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * فقط برای پیش‌نمایش/توسعه (ACCOUNTING_STAFF_SOURCE=demo، و در production اصلاً فعال نمی‌شود): فیش حقوقی قطعی‌ساز
 * (از روی شناسه‌ی کارمند) برای ۳ دوره‌ی اخیر تا بشود UI را دید. جایگزین درایور واقعی نرم‌افزار حسابداری می‌شود.
 */
@Injectable()
export class DemoStaffSource implements StaffLedgerSource {
  status(): SourceStatus {
    return { source: 'demo', connected: false, label: 'داده‌ی نمایشی (فقط پیش‌نمایش — به نرم‌افزار حسابداری وصل نیست)' }
  }
  async staffProfile(staff: StaffRow, period?: string): Promise<StaffProfile> {
    const h = hash(staff.id)
    const base = BASE[staff.department ?? ''] ?? 12_000_000
    const cur = period ?? '1405-07'
    const [y, m] = cur.split('-').map(Number)
    const payslips: StaffProfile['payslips'] = []
    const entries: LedgerEntry[] = []
    let totalNet = 0, totalPaid = 0, bonus = 0, pen = 0, last: string | null = null
    for (let i = 2; i >= 0; i--) {
      let mm = m - i, yy = y
      if (mm < 1) { mm += 12; yy -= 1 }
      const p = `${yy}-${pad(mm)}`
      const seed = (h >> (i * 3)) % 100
      const overtime = (seed % 4) * 450_000
      const b = i === 1 && seed % 3 === 0 ? 1_000_000 : 0
      const ded = Math.round(base * 0.07) + (i === 0 && seed % 5 === 0 ? 300_000 : 0)
      const net = base + overtime + b - ded
      const paid = i !== 0 // ماه جاری هنوز پرداخت نشده
      const date = `2026-${pad(Math.min(12, mm + 3))}-${pad(1 + (seed % 5))}`
      payslips.push({ period: p, base, overtime, bonus: b, deductions: ded, net, paid })
      entries.push({ date, period: p, kind: 'charge', title: 'حقوق ماهانه', debit: net, credit: 0 })
      if (b) { entries.push({ date, period: p, kind: 'adjustment', title: `پاداش — ${b.toLocaleString('fa-IR')} تومان`, debit: 0, credit: 0 }); bonus += b }
      if (i === 0 && ded > Math.round(base * 0.07)) { entries.push({ date, period: p, kind: 'penalty', title: `جریمه (تأخیر/غیبت) — ${(ded - Math.round(base * 0.07)).toLocaleString('fa-IR')} تومان`, debit: 0, credit: 0 }); pen += ded - Math.round(base * 0.07) }
      totalNet += net
      if (paid) { totalPaid += net; entries.push({ date, period: p, kind: 'payment', title: 'پرداخت حقوق', debit: 0, credit: net }); last = date }
    }
    entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return { source: 'demo', available: true, staff, summary: { total_net: totalNet, total_paid: totalPaid, balance: totalNet - totalPaid, total_bonus: bonus, total_penalty: pen, last_payment_at: last }, payslips: payslips.reverse(), entries }
  }
}
