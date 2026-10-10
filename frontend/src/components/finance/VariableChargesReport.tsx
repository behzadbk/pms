import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { Loading, ErrorBlock, useLoad } from '../hm'
import { financeApi, currentPeriod, instantFa, periodFa, tomanText } from '../../lib/api/finance'
import { Callout, PeriodPicker, TH, TD } from './parts'

/**
 * ریز «شارژ متغیر» واحدها (مصرف خدمات + سفارش‌های کافه/رستوران) — مانیتورینگ ویژه‌ی مدیر ساختمان.
 * این گزارش و جزئیات تسویه‌ی واحدها برای ساکنین دیگر، کارکنان و نگهبانی نمایش داده نمی‌شود.
 */
export function VariableChargesReport() {
  const [period, setPeriod] = useState(currentPeriod())
  const { data, loading, error, reload } = useLoad(() => financeApi.variableCharges(period), [period])
  const [unit, setUnit] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      <Callout>
        مبلغ سفارش‌های تحویل‌شده‌ی کافه/رستوران و مازاد آفرها هنگام صدور شارژ ماه بعد به «شارژ متغیر» هر واحد اضافه می‌شود. این گزارش فقط برای مدیر قابل مشاهده است؛ هر ساکن فقط صورتحساب واحد خودش را می‌بیند.
      </Callout>
      <div className="max-w-xs"><PeriodPicker value={period} onChange={setPeriod} label="ماه مصرف" /></div>

      {loading && <Loading />}
      {error && <ErrorBlock message={error} retry={reload} />}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Sum label="کافه و رستوران" value={tomanText(data.totals.fnb)} />
            <Sum label="مازاد آفرها و خدمات" value={tomanText(data.totals.services)} />
            <Sum label="جمع شارژ متغیر" value={tomanText(data.totals.total)} strong />
            <Sum label="هنوز روی شارژی نرفته" value={tomanText(data.totals.pending)} />
          </div>

          <Card>
            <CardHeader title={`ریز واحدها — ${periodFa(data.period)}`} />
            {data.units.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-muted">در این ماه مصرف متغیری ثبت نشده است.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>واحد</th><th className={TH}>کافه/رستوران</th><th className={TH}>خدمات</th><th className={TH}>جمع</th><th className={TH}>منتظر شارژ</th></tr></thead>
                  <tbody>
                    {data.units.map((u) => (
                      <tr key={u.unit_id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => setUnit(unit === u.unit_id ? null : u.unit_id)}>
                        <td className={`${TD} font-medium`}>واحد {u.unit_number}</td>
                        <td className={`${TD} text-muted whitespace-nowrap`}>{u.fnb_total ? `${tomanText(u.fnb_total)} (${u.fnb_orders.toLocaleString('fa-IR')} سفارش)` : '—'}</td>
                        <td className={`${TD} text-muted whitespace-nowrap`}>{u.service_total ? tomanText(u.service_total) : '—'}</td>
                        <td className={`${TD} font-medium whitespace-nowrap`}>{tomanText(u.total)}</td>
                        <td className={`${TD} whitespace-nowrap ${u.pending ? 'text-warn' : 'text-muted'}`}>{u.pending ? tomanText(u.pending) : 'ثبت‌شده'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {unit && (
            <Card>
              <CardHeader title={`جزئیات واحد ${data.units.find((u) => u.unit_id === unit)?.unit_number ?? ''}`} />
              <div className="px-4 sm:px-5 pb-5 space-y-2 text-sm">
                {data.orders.filter((o) => o.unit_id === unit).map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                    <div>
                      <p className="font-medium">{o.venue_name} · سفارش {o.order_number}</p>
                      <p className="text-xs text-muted mt-0.5">{instantFa(o.delivered_at)} · {o.exempt ? 'قبل از راه‌اندازی صورتحساب (محاسبه نمی‌شود)' : o.billed ? 'روی شارژ نشسته' : 'منتظر صدور شارژ'}</p>
                    </div>
                    <span className="font-semibold whitespace-nowrap">{tomanText(o.total)}</span>
                  </div>
                ))}
                {data.services.filter((x) => x.unit_id === unit).map((x, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                    <div>
                      <p className="font-medium">مازاد {x.service}</p>
                      <p className="text-xs text-muted mt-0.5">{x.qty.toLocaleString('fa-IR')} واحد مازاد · {x.billed ? 'روی شارژ نشسته' : 'منتظر صدور شارژ'}</p>
                    </div>
                    <span className="font-semibold whitespace-nowrap">{tomanText(x.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Sum({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line p-4 ${strong ? 'bg-tile-soft' : 'bg-card'}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-bold ${strong ? 'text-tile' : ''}`}>{value}</p>
    </div>
  )
}
