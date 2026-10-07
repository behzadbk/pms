import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Users2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Loading, ErrorBlock, useLoad } from '../../components/hm'
import { dayFa, financeApi, instantFa, methodFa, periodFa, tomanText, type MonthExpenses } from '../../lib/api/finance'

const COLORS = ['#16324F', '#0E9594', '#C08A3E', '#1D9A6C', '#C4442E', '#7A5C3E', '#6B7FA8']

export function ResidentFinance() {
  const t = useLoad(() => financeApi.transparency(), [])
  const mine = useLoad(() => financeApi.myCharges(), [])
  const receipts = useLoad(() => financeApi.myReceipts(), [])

  if (t.loading) return <Loading />
  if (t.error || !t.data) return <ErrorBlock message={t.error ?? 'خطا در دریافت اطلاعات'} retry={t.reload} />
  // اگر ماه جاری هنوز هزینه‌ای ندارد، ماه قبل نمایش داده می‌شود
  const month: MonthExpenses = t.data.current.total > 0 ? t.data.current : t.data.previous
  const latest = mine.data?.[0]
  const b = latest?.breakdown

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">شفافیت مالی</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title={`هزینه‌های ساختمان ${periodFa(month.period)} — به تفکیک دسته`} />
          {month.total === 0 ? <p className="px-5 pb-6 text-sm text-muted">هنوز هزینه‌ی پرداخت‌شده‌ای برای این ماه ثبت نشده است.</p> : (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-56" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={month.by_category} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {month.by_category.map((e, i) => <Cell key={e.category} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => tomanText(Number(v))} contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12, background: 'var(--color-card)', color: 'var(--color-ink-text)' }} labelStyle={{ color: 'var(--color-ink-text)' }} itemStyle={{ color: 'var(--color-ink-text)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2.5">
                {month.by_category.map((e, i) => (
                  <div key={e.category} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />{e.category}</span>
                    <span className="text-muted text-xs whitespace-nowrap">{tomanText(e.amount)} · {Math.round((e.amount / month.total) * 100).toLocaleString('fa-IR')}٪</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-line flex items-center justify-between text-sm font-semibold"><span>جمع کل</span><span>{tomanText(month.total)}</span></div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="محاسبه‌ی شارژ من" action={<Users2 size={16} className="text-tile" />} />
          <div className="px-5 pb-5 space-y-3">
            {!latest || !b ? <p className="text-sm text-muted">هنوز شارژی صادر نشده است.</p> : (
              <>
                <p className="text-xs text-muted">{periodFa(latest.period)} · واحد {latest.unit_number}{b.inputs ? ` · ${b.inputs.area.toLocaleString('fa-IR')} متر` : ''}</p>
                {!!b.base && <Line k="مبلغ پایه" v={b.base} />}
                {!!b.area && <Line k="بر اساس متراژ" v={b.area} />}
                {!!b.residents && <Line k="بر اساس نفرات" v={b.residents} />}
                {(b.fixed_items ?? []).map((i, k) => <Line key={k} k={i.title} v={i.amount} />)}
                {latest.late_fee_amount > 0 && <Line k="جریمه‌ی دیرکرد" v={latest.late_fee_amount} />}
                <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-tile-soft text-tile font-semibold"><span>جمع کل شارژ</span><span>{tomanText(latest.total_amount)}</span></div>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={`فاکتورهای پرداخت‌شده‌ی ساختمان — ${periodFa(month.period)}`} />
        <div className="px-4 sm:px-5 pb-5 space-y-2.5">
          {month.invoices.length === 0 && <p className="text-sm text-muted">فاکتوری برای این ماه ثبت نشده است.</p>}
          {month.invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-line">
              <div className="min-w-0">
                <p className="text-sm font-medium">{inv.description}</p>
                <p className="text-xs text-muted mt-0.5">{inv.vendor} · {inv.category} · {dayFa(inv.paid_on)}</p>
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">{tomanText(inv.amount)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="رسیدهای پرداخت من" />
        <div className="px-4 sm:px-5 pb-5 space-y-2.5">
          {(receipts.data ?? []).length === 0 && <p className="text-sm text-muted">هنوز پرداختی ثبت نشده است.</p>}
          {(receipts.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-line">
              <div><p className="text-sm font-medium">شارژ {periodFa(r.period)} · واحد {r.unit_number}</p><p className="text-xs text-muted mt-0.5">{methodFa(r.method)} · {instantFa(r.paid_at)}{r.reference ? ` · پیگیری ${r.reference}` : ''}</p></div>
              <span className="text-sm font-semibold text-good whitespace-nowrap">{tomanText(r.amount)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Line({ k, v }: { k: string; v: number }) {
  return <div className="flex items-center justify-between gap-3 text-sm p-3 rounded-xl bg-canvas"><span>{k}</span><span className="font-medium whitespace-nowrap">{tomanText(v)}</span></div>
}
