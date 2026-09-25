import { Wallet, Percent, AlertTriangle, FileClock } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { StatCard } from '../ui/StatCard'
import { StatusPill } from '../ui/StatusPill'
import { toman } from '../../lib/mockData'
import { useStore } from '../../lib/store'
import { chargeStats, expenseByCategory, fundBalance, periods } from '../../lib/finance'

const barColors = ['#16324F', '#0E9594', '#C08A3E', '#1D9A6C', '#C4442E', '#7A5C3E']

/** خلاصه‌ی مالی — مشترک بین داشبورد حسابداری و گزارش مالی مدیر */
export function FinanceOverview() {
  const state = useStore()
  const { charges, invoices } = state
  const current = charges.filter((c) => c.period === periods(charges)[0])
  const stats = chargeStats(current)
  const allOverdue = charges.filter((c) => c.status === 'overdue')
  const unpaid = invoices.filter((i) => i.status === 'pending')
  const byCat = expenseByCategory(invoices)
  const maxCat = Math.max(1, ...byCat.map((c) => c.amount))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="موجودی صندوق" value={toman(fundBalance(state))} icon={Wallet} tone="ink" />
        <StatCard label={`وصول شارژ ${current[0]?.period ?? ''}`} value={`${stats.rate.toLocaleString('fa-IR')}٪`} sub={`${toman(stats.paid)} از ${toman(stats.total)}`} icon={Percent} tone="tile" />
        <StatCard label="مطالبات معوق" value={toman(allOverdue.reduce((a, c) => a + c.total, 0))} sub={`${allOverdue.length.toLocaleString('fa-IR')} واحد`} icon={AlertTriangle} tone="bad" />
        <StatCard label="فاکتورهای پرداخت‌نشده" value={toman(unpaid.reduce((a, i) => a + i.amount, 0))} sub={`${unpaid.length.toLocaleString('fa-IR')} فاکتور`} icon={FileClock} tone="brass" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="هزینه‌ها به تفکیک دسته" />
          <div className="px-5 pb-5 space-y-3">
            {byCat.map((c, i) => (
              <div key={c.category}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{c.category}</span>
                  <span className="text-muted">{toman(c.amount)}</span>
                </div>
                <div className="h-2 rounded-full bg-canvas overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%`, background: barColors[i % barColors.length] }} />
                </div>
              </div>
            ))}
            {byCat.length === 0 && <p className="text-sm text-muted">فاکتوری ثبت نشده است</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="واحدهای بدهکار" />
          <div className="px-5 pb-5 space-y-2">
            {allOverdue.length === 0 && <p className="text-sm text-muted">بدهی معوقی وجود ندارد</p>}
            {allOverdue.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-line text-sm">
                <span>
                  <b>{c.unit}</b> <span className="text-xs text-muted">· {c.period}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{toman(c.total)}</span>
                  <StatusPill status={c.status} />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
