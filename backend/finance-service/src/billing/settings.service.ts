import { Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { bad, bool, num, obj } from '../common/validate'
import type { LateFeeRule } from './charge-calc'

export interface FinanceSettings {
  due_day: number
  late_fee_enabled: boolean
  late_fee_mode: 'per_month' | 'per_day'
  late_fee_rate: number
  late_fee_grace_days: number
  late_fee_cap_percent: number | null
  opening_balance: number
  updated_at: string
}

const COLS = `due_day, late_fee_enabled, late_fee_mode, late_fee_rate, late_fee_grace_days, late_fee_cap_percent, opening_balance, updated_at`

export function lateFeeRuleOf(s: FinanceSettings): LateFeeRule {
  return { enabled: s.late_fee_enabled, mode: s.late_fee_mode, ratePercent: s.late_fee_rate, graceDays: s.late_fee_grace_days, capPercent: s.late_fee_cap_percent }
}

@Injectable()
export class SettingsService {
  /** تنظیمات tenant جاری؛ اگر هنوز ساخته نشده با پیش‌فرض‌ها (جریمه‌ی دیرکرد غیرفعال، نرخ ۰) ساخته می‌شود */
  async get(client: PoolClient, tenantId: string): Promise<FinanceSettings> {
    await client.query(`INSERT INTO finance.settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`, [tenantId])
    const r = await client.query<FinanceSettings>(`SELECT ${COLS} FROM finance.settings WHERE tenant_id = $1`, [tenantId])
    return r.rows[0]
  }

  async update(client: PoolClient, tenantId: string, body: unknown, actor: string): Promise<FinanceSettings> {
    const b = obj(body)
    const cur = await this.get(client, tenantId)
    const mode = b.late_fee_mode ?? cur.late_fee_mode
    if (mode !== 'per_month' && mode !== 'per_day') bad('نوع محاسبه‌ی جریمه نامعتبر است')
    const rate = num(b.late_fee_rate, 'نرخ جریمه', { min: 0, max: 100 }) ?? cur.late_fee_rate
    const enabled = bool(b.late_fee_enabled, 'فعال بودن جریمه') ?? cur.late_fee_enabled
    if (enabled && !(rate > 0)) bad('برای فعال‌کردن جریمه‌ی دیرکرد، نرخ باید بزرگ‌تر از صفر باشد')
    const cap = b.late_fee_cap_percent === null ? null : (num(b.late_fee_cap_percent, 'سقف جریمه', { min: 0, max: 1000 }) ?? cur.late_fee_cap_percent)
    const r = await client.query<FinanceSettings>(
      `UPDATE finance.settings SET due_day = $2, late_fee_enabled = $3, late_fee_mode = $4, late_fee_rate = $5,
              late_fee_grace_days = $6, late_fee_cap_percent = $7, opening_balance = $8, updated_at = now(), updated_by = $9
        WHERE tenant_id = $1 RETURNING ${COLS}`,
      [
        tenantId,
        num(b.due_day, 'روز سررسید', { min: 1, max: 31, int: true }) ?? cur.due_day,
        enabled,
        mode,
        rate,
        num(b.late_fee_grace_days, 'مهلت (روز)', { min: 0, max: 365, int: true }) ?? cur.late_fee_grace_days,
        cap,
        num(b.opening_balance, 'موجودی اولیه‌ی صندوق') ?? cur.opening_balance,
        /^[0-9a-f-]{36}$/i.test(actor) ? actor : null,
      ],
    )
    return r.rows[0]
  }
}
