import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { calcCharge, resolveFormula, withOverage, type ChargeBreakdown, type Formula } from './charge-calc'
import { markOverageBilled, pendingOverage } from './overage'
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
  /** مبلغ کل شارژ (فرمول + مازاد) */
  amount: number
  /** مازاد مصرف خدمات که در این شارژ می‌نشیند (۰ اگر نباشد) */
  overage: number
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
    return (await this.build(client, tenantId, input)).plan
  }

  private async build(client: PoolClient, tenantId: string, input: { period: string; formulaId?: string; dueDate?: string }): Promise<{ plan: ChargePlan; eventIds: Map<string, string[]> }> {
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
    // «residents» = عضوهای فعالِ ساکن؛ مالک غایب و مراقب (که در واحد زندگی نمی‌کنند) شمرده نمی‌شوند.
    // LEFT JOIN با شارژِ همین دوره (ex_*) نشان می‌دهد کدام واحد قبلاً شارژ گرفته؛ پیش‌نمایش با همین «تفاوت» ساخته می‌شود.
    // مازاد مصرف خدمات (آفرها): مصرف ماه‌های قبل از این دوره که هنوز به شارژی نرفته
    const overages = await pendingOverage(client, input.period)
    const eventIds = new Map<string, string[]>()
    const rows: PlanRow[] = units.rows.map((u) => {
      const ov = overages.get(u.id)
      // مازاد خدمات فقط روی شارژِ «تازه» می‌نشیند؛ واحدی که برای این دوره شارژ دارد دست نمی‌خورد، وگرنه مازاد دوبار
      // حساب می‌شد. eventIds مشخص می‌کند کدام رویدادهای مصرف باید بعد از صدور «فریز» (billed) شوند.
      const fresh = !u.ex_id
      const breakdown = withOverage(calcCharge(formula!, { area: u.area ?? 0, residents: u.residents }), fresh ? ov : undefined)
      if (fresh && ov) eventIds.set(u.id, ov.event_ids)
      return {
        unit_id: u.id,
        unit_number: u.unit_number,
        floor: u.floor,
        area: u.area ?? 0,
        residents: u.residents,
        amount: breakdown.total,
        overage: breakdown.overage?.total ?? 0,
        breakdown,
        existing: u.ex_id ? { id: u.ex_id, status: u.ex_status!, total_amount: u.ex_total! } : null,
      }
    })
    const fresh = rows.filter((r) => !r.existing)
    const plan: ChargePlan = {
      period: input.period,
      period_label: periodLabel(input.period),
      due_date: input.dueDate ?? computeDueDate(input.period, settings.due_day),
      formula: { id: formula.id, name: formula.name, calc_type: formula.calc_type },
      rows,
      to_create: fresh.length,
      already_issued: rows.length - fresh.length,
      total_new_amount: fresh.reduce((a, r) => a + r.amount, 0),
    }
    return { plan, eventIds }
  }

  /**
   * صدور واقعی. idempotent برای (unit, period): ON CONFLICT DO NOTHING — اجرای دوباره فقط واحدهای
   * جاافتاده (مثلاً واحد تازه‌اضافه‌شده) را می‌سازد و شارژ قبلی را عوض نمی‌کند.
   */
  async issue(client: PoolClient, tenantId: string, input: { period: string; formulaId?: string; dueDate?: string }) {
    const { plan, eventIds } = await this.build(client, tenantId, input)
    const fresh = plan.rows.filter((r) => !r.existing)
    const created: { id: string; unit_id: string; total_amount: number }[] = []
    // بین پیش‌نمایش (plan) و درج ممکن است صدور دیگری هم‌زمان اجرا شده باشد؛ ON CONFLICT DO NOTHING جلوی شارژ دوباره را می‌گیرد
    // و فقط ردیف‌هایی که واقعاً درج شده‌اند (ins.rows[0]) فریز مازاد و اعلان می‌گیرند.
    for (const r of fresh) {
      const ins = await client.query<{ id: string; unit_id: string; total_amount: number }>(
        `INSERT INTO finance.monthly_charges (tenant_id, unit_id, period, formula_id, base_amount, late_fee_amount, total_amount, due_date, status, breakdown)
         VALUES ($1, $2, $3, $4, $5, 0, $5, $6::date, 'pending', $7::jsonb)
         ON CONFLICT (unit_id, period) DO NOTHING
         RETURNING id, unit_id, total_amount`,
        [tenantId, r.unit_id, plan.period, plan.formula.id, r.amount, plan.due_date, JSON.stringify(r.breakdown)],
      )
      if (ins.rows[0]) {
        created.push(ins.rows[0])
        // مصرف‌های مازاد داخل این شارژ فریز می‌شوند تا دوباره روی شارژ بعدی نیایند
        await markOverageBilled(client, ins.rows[0].id, eventIds.get(r.unit_id) ?? [])
      }
    }

    // اعلان به پرداخت‌کننده‌ی هر واحد (push از مسیر inbox)
    const payers = await payersByUnit(client, created.map((c) => c.unit_id))
    const dueFa = formatJalali(plan.due_date)
    const overageById = new Map(plan.rows.filter((r) => r.overage > 0).map((r) => [r.unit_id, r.overage]))
    for (const c of created) {
      const persons = payers.get(c.unit_id) ?? []
      await notify(client, tenantId, persons.map((p) => ({ person: p })), {
        kind: 'charge_issued',
        title: `شارژ ${plan.period_label} صادر شد`,
        body: `مبلغ ${c.total_amount.toLocaleString('fa-IR')} تومان${overageById.get(c.unit_id) ? ` (شامل ${overageById.get(c.unit_id)!.toLocaleString('fa-IR')} تومان مازاد خدمات)` : ''} — سررسید ${dueFa}`,
        link: '/resident/charges',
        ref: c.id,
      })
    }
    return { period: plan.period, period_label: plan.period_label, due_date: plan.due_date, generatedCount: created.length, skippedExisting: plan.already_issued, total_amount: created.reduce((a, c) => a + c.total_amount, 0) }
  }
}
