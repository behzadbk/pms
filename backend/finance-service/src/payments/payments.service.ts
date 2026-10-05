import { ConflictException, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { notify, payersByUnit } from '../billing/notify'
import { periodLabel } from '../common/jalali'
import { EventsService } from '../events/events.service'

export interface PaymentRow { id: string; monthly_charge_id: string; amount: number; gateway: string; status: string; gateway_ref_id: string | null }

@Injectable()
export class PaymentsService {
  constructor(private readonly events: EventsService) {}

  /**
   * نهایی‌کردن پرداخت موفق (آنلاین یا دستی): payment → success، شارژ → paid، اعلان به ساکن.
   * هم‌زمان‌شدن دو callback با قفل ردیف شارژ ایمن می‌شود.
   */
  async settle(client: PoolClient, tenantId: string, paymentId: string, o: { method: string; refId?: string | null }) {
    const p = await client.query<PaymentRow>(`SELECT * FROM finance.payments WHERE id = $1 FOR UPDATE`, [paymentId])
    const payment = p.rows[0]
    if (!payment) return null
    if (payment.status === 'success') return payment
    const c = await client.query<{ id: string; status: string; unit_id: string; period: string; total_amount: number }>(
      `SELECT id, status, unit_id, period, total_amount FROM finance.monthly_charges WHERE id = $1 FOR UPDATE`,
      [payment.monthly_charge_id],
    )
    const charge = c.rows[0]
    if (!charge) return null
    if (charge.status === 'paid') throw new ConflictException('این شارژ قبلاً پرداخت شده است')
    await client.query(
      `UPDATE finance.payments SET status = 'success', paid_at = now(), method = $2, reference = COALESCE($3, reference) WHERE id = $1`,
      [paymentId, o.method, o.refId ?? null],
    )
    await client.query(`UPDATE finance.monthly_charges SET status = 'paid', paid_at = now(), pay_method = $2, updated_at = now() WHERE id = $1`, [charge.id, o.method])
    const payers = await payersByUnit(client, [charge.unit_id])
    await notify(client, tenantId, (payers.get(charge.unit_id) ?? []).map((p2) => ({ person: p2 })), {
      kind: 'payment_received',
      title: `پرداخت شارژ ${periodLabel(charge.period)} ثبت شد`,
      body: `مبلغ ${payment.amount.toLocaleString('fa-IR')} تومان — با تشکر`,
      link: '/resident/charges',
      ref: charge.id,
    })
    this.events.publish('payment.succeeded', { paymentId, chargeId: charge.id }, tenantId)
    return { ...payment, status: 'success' }
  }
}
