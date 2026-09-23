import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { charges, financeSummary, monthlyTrend, tickets, toman } from '../../lib/mockData'

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد مدیریت</h1>
        <p className="text-muted text-sm mt-1">نمای کلی وضعیت مالی و عملیاتی برج آفتاب — شهریور ۱۴۰۴</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="موجودی صندوق" value={toman(financeSummary.fundBalance)} icon={Wallet} tone="ink" />
        <StatCard label="درآمد این ماه" value={toman(financeSummary.monthIncome)} icon={TrendingUp} tone="tile" />
        <StatCard label="هزینه این ماه" value={toman(financeSummary.monthExpense)} icon={TrendingDown} tone="brass" />
        <StatCard
          label="مطالبات معوق"
          value={toman(financeSummary.overdueTotal)}
          sub={`${financeSummary.overdueUnits} واحد`}
          icon={AlertTriangle}
          tone="bad"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="روند درآمد و هزینه (میلیون تومان)" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0E9594" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0E9594" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C08A3E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#C08A3E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ea" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: 12, border: '1px solid #e2e6ea', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="income" name="درآمد" stroke="#0E9594" fill="url(#income)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" name="هزینه" stroke="#C08A3E" fill="url(#expense)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="تیکت‌های اخیر" />
          <div className="px-5 pb-5 space-y-3">
            {tickets.slice(0, 4).map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2 pb-3 border-b border-line last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-xs text-muted mt-0.5">{t.unit} · {t.createdAt}</p>
                </div>
                <StatusPill status={t.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="وضعیت شارژ واحدها — شهریور ۱۴۰۴" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">واحد</th>
                <th className="font-medium px-5 py-2.5">مبلغ پایه</th>
                <th className="font-medium px-5 py-2.5">جریمه دیرکرد</th>
                <th className="font-medium px-5 py-2.5">جمع کل</th>
                <th className="font-medium px-5 py-2.5">سررسید</th>
                <th className="font-medium px-5 py-2.5">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{c.unit}</td>
                  <td className="px-5 py-3 text-muted">{toman(c.base)}</td>
                  <td className="px-5 py-3 text-muted">{c.lateFee ? toman(c.lateFee) : '—'}</td>
                  <td className="px-5 py-3 font-medium">{toman(c.total)}</td>
                  <td className="px-5 py-3 text-muted">{c.dueDate}</td>
                  <td className="px-5 py-3"><StatusPill status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
