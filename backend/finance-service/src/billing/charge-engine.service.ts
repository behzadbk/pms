import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { calcCharge, resolveFormula, type ChargeBreakdown, type Formula } from './charge-calc'
import { SettingsService } from './settings.service'
import { notify, payersByUnit } from './notify'
import { bad } from '../common/validate'
import { computeDueDate, formatJalali, isIsoDate, parsePeriod, periodLabel } from '../common/jalali'

export interface PlanRow {
  unit_id: string
  unit_number: string
  floor: number | null
  area: number
  residents: number
  amount: number
  breakdown: ChargeBreakdown
  existing: { id: string; status: string; total_amount: number } | null
}

export interface ChargePlan {
  period: string
  period_label: string
  due_date: string
  formula: Pick<Formula, 'id' | 'name' | 'calc_type'>
  rows: PlanRow[]
  to_create: number
  already_issued: number
  total_new_amount: number
}

@Injectable()
export class ChargeEngine {
  constructor(private readonly settings: SettingsService) {}

  /** برنامه‌ی صدور (پیش‌نمایش) — هیچ چیزی نمی‌نویسد */
  async plan(client: PoolClient, tenantId: string, input: { period: string; formulaId?: string; dueDate?: string }): Promise<ChargePlan> {
    if (!parsePeriod(input.period)) bad('دوره باید شمسی و به شکل YYYY-MM باشد (مثلاً 1405-07)')
    if (input.dueDate !== undefined && !isIsoDate(input.dueDate)) bad('سررسید باید به شکل YYYY-MM-DD باشد')
    const settings = await this.settings.get(client, tenantId)

    const fr = await client.query<Formula>(`SELECT * FROM finance.charge_formulas WHERE is_active ORDER BY created_at DESC`)
    let formula: Formula | null
    if (input.formulaId) {
      formula = fr.rows.find((f) => f.id === input.formulaId) ?? null
      if (!formula) throw new NotFoundException('فرمول فعال با این شناسه یافت نشد')
    } else {
      formula = resolveFormula(fr.rows, input.period)
    }
    if (!formula) throw new UnprocessableEntityException('برای این دوره فرمول فعالی تعریف نشده است؛ ابتدا فرمول شارژ را تعریف کنید')

    const units = await client.query<{ id: string; unit_number: string; floor: number | null; area: number | null; residents: number; ex_id: string | null; ex_status: string | null; ex_total: number | null }>(
      `SELECT u.id, u.unit_number, u.floor, u.area_sqm AS area,
              (SELECT count(*) FROM residency.memberships m
                WHERE m.unit_id = u.id AND m.status = 'active' AND m.role NOT IN ('owner_absent', 'caregiver'))::int AS residents,
              c.id AS ex_id, c.status AS ex_status, c.total_amount AS ex_total
         FROM property.units u
         LEFT JOIN finance.monthly_charges c ON c.unit_id = u.id AND c.period = $1
        ORDER BY u.floor NULLS LAST, u.unit_number`,
      [input.period],
    )
    const rows: PlanRow[] = units.rows.map((u) => {
      const breakdown = calcCharge(formula!, { area: u.area ?? 0, residents: u.residents })
      return {
        unit_id: u.id,
        unit_number: u.unit_number,
        floor: u.floor,
        area: u.area ?? 0,
        residents: u.residents,
        amount: breakdown.total,
        breakdown,
        existing: u.ex_id ? { id: u.ex_id, status: u.ex_status!, total_amount: u.ex_total! } : null,
      }
    })
    const fresh = rows.filter((r) => !r.existing)
    return {
      period: input.period,
      period_label: periodLabel(input.period),
      due_date: input.dueDate ?? computeDueDate(input.period, settings.due_day),
      formula: { id: formula.id, name: formula.name, calc_type: formula.calc_type },
      rows,
      to_create: fresh.length,
      already_issued: rows.length - fresh.length,
      total_new_amount: fresh.reduce((a, r) => a + r.amount, 0),
    }
  }

  /**
   * صدور واقعی. idempotent برای (unit, period): ON CONFLICT DO NOTHING — اجرای دوباره فقط واحدهای
   * جاافتاده (مثلاً واحد تازه‌اضافه‌شده) را می‌سازد و شارژ قبلی را عوض نمی‌کند.
   */
  async issue(client: PoolClient, tenantId: string, input: { period: string; formulaId?: string; dueDate?: string }) {
    const plan = await this.plan(client, tenantId, input)
    const fresh = plan.rows.filter((r) => !r.existing)
    const created: { id: string; unit_id: string; total_amount: number }[] = []
    for (const r of fresh) {
      const ins = await client.query<{ id: string; unit_id: string; total_amount: number }>(
        `INSERT INTO finance.monthly_charges (tenant_id, unit_id, period, formula_id, base_amount, late_fee_amount, total_amount, due_date, status, breakdown)
         VALUES ($1, $2, $3, $4, $5, 0, $5, $6::date, 'pending', $7::jsonb)
         ON CONFLICT (unit_id, period) DO NOTHING
         RETURNING id, unit_id, total_amount`,
        [tenantId, r.unit_id, plan.period, plan.formula.id, r.amount, plan.due_date, JSON.stringify(r.breakdown)],
      )
      if (ins.rows[0]) created.push(ins.rows[0])
    }

    // اعلان به پرداخت‌کننده‌ی هر واحد (push از مسیر inbox)
    const payers = await payersByUnit(client, created.map((c) => c.unit_id))
    const dueFa = formatJalali(plan.due_date)
    for (const c of created) {
      const persons = payers.get(c.unit_id) ?? []
      await notify(client, tenantId, persons.map((p) => ({ person: p })), {
        kind: 'charge_issued',
        title: `شارژ ${plan.period_label} صادر شد`,
        body: `مبلغ ${c.total_amount.toLocaleString('fa-IR')} تومان — سررسید ${dueFa}`,
        link: '/resident/charges',
        ref: c.id,
      })
    }
    return { period: plan.period, period_label: plan.period_label, due_date: plan.due_date, generatedCount: created.length, skippedExisting: plan.already_issued, total_amount: created.reduce((a, c) => a + c.total_amount, 0) }
  }
}
