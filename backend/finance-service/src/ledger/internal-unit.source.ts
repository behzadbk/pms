import { Injectable } from '@nestjs/common'
import type { OverageBreakdownLike } from './types-local'
import type { LedgerEntry, Q, SourceStatus, UnitLedgerSource, UnitProfile, UnitRow } from './provider'

interface ChargeRow {
  id: string
  period: string
  base_amount: number
  late_fee_amount: number
  total_amount: number
  due_date: string | null
  status: 'pending' | 'paid' | 'overdue'
  paid_at: string | null
  breakdown: { overage?: OverageBreakdownLike } | null
  paid_amount: number
  last_paid_at: string | null
}

/** پرداخت‌شده‌ی هر شارژ: جمع پرداخت‌های موفق؛ اگر ردیف پرداختی نبود (ثبت دستی/ورود از فایل) و شارژ paid است، کل مبلغ */
const PAID_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount), 0) AS amt, MAX(p.paid_at) AS at, COUNT(*) AS n
      FROM finance.payments p WHERE p.monthly_charge_id = c.id AND p.status = 'success'
  ) pay ON true`
const PAID_AMOUNT = `CASE WHEN pay.n > 0 THEN pay.amt WHEN c.status = 'paid' THEN c.total_amount ELSE 0 END`
const PAID_AT = `(COALESCE(pay.at, CASE WHEN c.status = 'paid' THEN c.paid_at END) AT TIME ZONE 'Asia/Tehran')::date::text`

/**
 * منبع پیش‌فرض واحدها: همان دفتر شارژ/پرداخت که در دیتابیس این ساختمان هست (صدور با فرمول یا ورود از فایل حسابداری).
 * فقط SELECT. وقتی نرم‌افزار حسابداری واقعی وصل شد، یک UnitLedgerSource دیگر جایگزینش می‌شود.
 */
@Injectable()
export class InternalUnitSource implements UnitLedgerSource {
  status(): SourceStatus {
    return { source: 'internal', connected: true, label: 'دفتر شارژ ساختمان (صدور/ورود از فایل حسابداری)' }
  }

  async listUnits(client: Q): Promise<UnitRow[]> {
    const r = await client.query<UnitRow>(
      `SELECT u.id AS unit_id, u.unit_number, u.floor, u.area_sqm::float8 AS area,
              COALESCE(SUM(c.total_amount - (${PAID_AMOUNT})), 0)::float8 AS balance,
              COUNT(c.id) FILTER (WHERE c.status = 'overdue')::int AS overdue_count,
              MAX(${PAID_AT}) AS last_payment_at
         FROM property.units u
         LEFT JOIN finance.monthly_charges c ON c.unit_id = u.id
         ${PAID_LATERAL}
        GROUP BY u.id, u.unit_number, u.floor, u.area_sqm
        ORDER BY u.floor NULLS LAST, u.unit_number`,
    )
    return r.rows
  }

  async unitProfile(client: Q, unitId: string): Promise<UnitProfile | null> {
    const u = (await client.query<{ unit_id: string; unit_number: string; floor: number | null; area: number | null }>(
      `SELECT id AS unit_id, unit_number, floor, area_sqm::float8 AS area FROM property.units WHERE id = $1`, [unitId],
    )).rows[0]
    if (!u) return null
    const rows = (await client.query<ChargeRow>(
      `SELECT c.id, c.period, c.base_amount::float8, COALESCE(c.late_fee_amount,0)::float8 AS late_fee_amount, c.total_amount::float8,
              c.due_date::text, c.status, c.paid_at, c.breakdown,
              (${PAID_AMOUNT})::float8 AS paid_amount, (${PAID_AT}) AS last_paid_at
         FROM finance.monthly_charges c ${PAID_LATERAL}
        WHERE c.unit_id = $1 ORDER BY c.period DESC`, [unitId],
    )).rows

    const entries: LedgerEntry[] = []
    const periods: UnitProfile['periods'] = []
    const sum = { fixed: 0, variable: 0, penalty: 0, paid: 0, overdue: 0, last: null as string | null }
    for (const c of rows) {
      const variable = Math.max(0, Math.min(c.base_amount, Number(c.breakdown?.overage?.total ?? 0)))
      const fixed = c.base_amount - variable
      const date = c.due_date
      if (fixed > 0) entries.push({ date, period: c.period, kind: 'charge', title: 'شارژ ماهانه', debit: fixed, credit: 0 })
      if (variable > 0) {
        const items = (c.breakdown?.overage?.items ?? []).map((i) => i.service).filter(Boolean)
        entries.push({ date, period: c.period, kind: 'variable', title: `شارژ متغیر${items.length ? ` — ${[...new Set(items)].join('، ')}` : ''}`, debit: variable, credit: 0 })
      }
      if (c.late_fee_amount > 0) entries.push({ date, period: c.period, kind: 'penalty', title: 'جریمه‌ی دیرکرد', debit: c.late_fee_amount, credit: 0 })
      if (c.paid_amount > 0) {
        const at = c.last_paid_at
        entries.push({ date: at, period: c.period, kind: 'payment', title: 'پرداخت', debit: 0, credit: c.paid_amount })
        if (at && (!sum.last || at > sum.last)) sum.last = at
      }
      if (c.status === 'overdue') sum.overdue++
      sum.fixed += fixed; sum.variable += variable; sum.penalty += c.late_fee_amount; sum.paid += c.paid_amount
      periods.push({ period: c.period, fixed, variable, penalty: c.late_fee_amount, total: c.total_amount, paid: c.paid_amount, status: c.status, due_date: c.due_date })
    }
    entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.kind === 'payment' ? -1 : 1))
    return {
      source: 'internal',
      unit: u,
      summary: {
        total_fixed: sum.fixed, total_variable: sum.variable, total_penalty: sum.penalty, total_paid: sum.paid,
        balance: sum.fixed + sum.variable + sum.penalty - sum.paid, overdue_count: sum.overdue, last_payment_at: sum.last,
      },
      periods,
      entries,
    }
  }
}
