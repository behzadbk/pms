import { Wallet, Percent, AlertTriangle, FileClock } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { StatCard } from '../ui/StatCard'
import { Loading, ErrorBlock, useLoad } from '../hm'
import { dayFa, financeApi, periodFa, tomanText } from '../../lib/api/finance'

const barColors = ['#16324F', '#0E9594', '#C08A3E', '#1D9A6C', '#C4442E', '#7A5C3E']

/** خلاصه‌ی مالی — مشترک بین داشبورد حسابداری و گزارش مالی مدیر (همه‌چیز از /finance/summary) */
export function FinanceOverview() {
  const { data: s, loading, error, reload } = useLoad(() => financeApi.summary(), [])
  if (loading) return <Loading />
  if (error || !s) return <ErrorBlock message={error ?? 'خطا در دریافت گزارش'} retry={reload} />
  const maxCat = Math.max(1, ...s.expense_by_category.map((c) => c.amount))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="موجودی صندوق" value={tomanText(s.fund_balance)} icon={Wallet} tone="ink" />
        <StatCard label={`وصول شارژ ${periodFa(s.collection.period)}`} value={`${s.collection.rate.toLocaleString('fa-IR')}٪`} sub={`${tomanText(s.collection.paid)} از ${tomanText(s.collection.total)}`} icon={Percent} tone="tile" />
        <StatCard label="مطالبات معوق" value={tomanText(s.overdue.total)} sub={`${s.overdue.count.toLocaleString('fa-IR')} واحد`} icon={AlertTriangle} tone="bad" />
        <StatCard label="فاکتورهای پرداخت‌نشده" value={tomanText(s.unpaid_invoices.total)} sub={`${s.unpaid_invoices.count.toLocaleString('fa-IR')} فاکتور`} icon={FileClock} tone="brass" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="هزینه‌ها به تفکیک دسته (۶ ماه اخیر)" />
          <div className="px-5 pb-5 space-y-3">
            {s.expense_by_category.map((c, i) => (
              <div key={c.category}>
                <div className="flex justify-between gap-3 text-xs mb-1"><span>{c.category}</span><span className="text-muted whitespace-nowrap">{tomanText(c.amount)}</span></div>
                <div className="h-2 rounded-full bg-canvas overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%`, background: barColors[i % barColors.length] }} /></div>
              </div>
            ))}
            {s.expense_by_category.length === 0 && <p className="text-sm text-muted">هنوز هزینه‌ی پرداخت‌شده‌ای ثبت نشده است</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="واحدهای بدهکار" />
          <div className="px-5 pb-5 space-y-2 max-h-80 overflow-y-auto">
            {s.overdue.units.length === 0 && <p className="text-sm text-muted">بدهی معوقی وجود ندارد</p>}
            {s.overdue.units.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line text-sm">
                <span><b>{c.unit_number}</b> <span className="text-xs text-muted">· {periodFa(c.period)} · سررسید {dayFa(c.due_date)}</span></span>
                <span className="font-medium whitespace-nowrap">{tomanText(c.total_amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
