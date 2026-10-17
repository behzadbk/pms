import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { EasyHide } from '../../components/ui/Widget'
import { StatusPill } from '../../components/ui/StatusPill'
import { TH, TD } from '../../components/finance/parts'
import { Loading, ErrorBlock, useLoad } from '../../components/hm'
import { dayFa, financeApi, instantFa, methodFa, periodFa, periodShortFa, tomanText } from '../../lib/api/finance'
import { ExpandList, ExpandToggle, useExpandable } from '../../components/ui/ExpandList'

/** داشبورد مدیر — همه‌ی ارقام از aggregateهای واقعی finance-service */
export function AdminDashboard() {
  const { data: s, loading, error, reload } = useLoad(() => financeApi.summary({ months: 6 }), [])
  const period = s?.collection.period
  const charges = useLoad(() => (period ? financeApi.charges({ period }) : Promise.resolve([])), [period])
  const chargeRows = useExpandable(charges.data ?? [], 10)

  if (loading) return <Loading />
  if (error || !s) return <ErrorBlock message={error ?? 'خطا در دریافت اطلاعات'} retry={reload} />
  const trend = s.monthly.map((m) => ({ month: periodShortFa(m.period), income: Math.round(m.income / 1e6 * 10) / 10, expense: Math.round(m.expense / 1e6 * 10) / 10 }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد مدیریت</h1>
        <p className="text-muted text-sm mt-1">نمای کلی وضعیت مالی ساختمان — {periodFa(s.current_period)}</p>
      </div>

      <div className="lg5-grid">
        <StatCard label="موجودی صندوق" value={tomanText(s.fund_balance)} icon={Wallet} tone="ink" />
        <StatCard glass label="درآمد این ماه" value={tomanText(s.month_income)} icon={TrendingUp} tone="tile" />
        <StatCard glass label="هزینه این ماه" value={tomanText(s.month_expense)} icon={TrendingDown} tone="brass" />
        <StatCard glass label="مطالبات معوق" value={tomanText(s.overdue.total)} sub={`${s.overdue.count.toLocaleString('fa-IR')} شارژ`} icon={AlertTriangle} tone="bad" />
      </div>

      <EasyHide>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="روند درآمد و هزینه (میلیون تومان)" />
          <div className="h-64 px-3 pb-4" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--lg4-pri)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--lg4-pri)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="expense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#C9A27E" stopOpacity={0.3} /><stop offset="95%" stopColor="#C9A27E" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: 12, border: '1px solid var(--color-line)', fontSize: 12, background: 'var(--color-card)', color: 'var(--color-ink-text)' }} labelStyle={{ color: 'var(--color-ink-text)' }} itemStyle={{ color: 'var(--color-ink-text)' }} />
                <Area type="monotone" dataKey="income" name="درآمد" stroke="var(--lg4-pri)" fill="url(#income)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" name="هزینه" stroke="#C9A27E" fill="url(#expense)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="آخرین پرداخت‌ها" />
          <div className="px-5 pb-5 space-y-3">
            {s.recent_payments.length === 0 && <p className="text-sm text-muted">هنوز پرداختی ثبت نشده است</p>}
            <ExpandList className="space-y-3" items={s.recent_payments} render={(p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 pb-3 border-b border-line last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">واحد {p.unit_number} · {periodFa(p.period)}</p>
                  <p className="text-xs text-muted mt-0.5">{methodFa(p.method)} · {instantFa(p.paid_at)}</p>
                </div>
                <span className="text-sm font-medium text-good whitespace-nowrap">{tomanText(p.amount)}</span>
              </div>
            )} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={`وضعیت شارژ واحدها — ${periodFa(period)}`} />
        {charges.loading ? <Loading /> : !charges.data?.length ? <p className="px-5 pb-6 text-sm text-muted">هنوز شارژی صادر نشده است. از «مالی ← فرمول و تنظیمات» فرمول تعریف و از «شارژ و مطالبات» صادر کنید.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>واحد</th><th className={TH}>مبلغ پایه</th><th className={TH}>جریمه دیرکرد</th><th className={TH}>جمع کل</th><th className={TH}>سررسید</th><th className={TH}>وضعیت</th></tr></thead>
              <tbody>
                {chargeRows.visible.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className={`${TD} font-medium`}>{c.unit_number}</td>
                    <td className={`${TD} text-muted`}>{tomanText(c.base_amount)}</td>
                    <td className={`${TD} text-muted`}>{c.late_fee_amount ? tomanText(c.late_fee_amount) : '—'}</td>
                    <td className={`${TD} font-medium`}>{tomanText(c.total_amount)}</td>
                    <td className={`${TD} text-muted whitespace-nowrap`}>{dayFa(c.due_date)}</td>
                    <td className={TD}><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ExpandToggle hidden={chargeRows.hidden} open={chargeRows.open} onToggle={chargeRows.toggle} className="my-2" />
          </div>
        )}
      </Card>
      </EasyHide>
    </div>
  )
}
