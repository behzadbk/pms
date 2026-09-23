import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Download, FileText, Users2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { expenseBreakdown, myChargeSplit, myInvoices, toman } from '../../lib/mockData'

export function ResidentFinance() {
  const totalExpense = expenseBreakdown.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">شفافیت مالی</h1>
        <p className="text-muted text-sm mt-1">هزینه‌های مشاعات دقیقاً کجا و چقدر خرج شده — با تفکیک سهم مالک و مستأجر</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="هزینه‌های ساختمان این ماه — به تفکیک دسته" />
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdown}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {expenseBreakdown.map((e) => (
                      <Cell key={e.category} fill={e.colorVar} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => toman(Number(v))}
                    contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: 12, border: '1px solid #e2e6ea', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              {expenseBreakdown.map((e) => (
                <div key={e.category} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.colorVar }} />
                    {e.category}
                  </span>
                  <span className="text-muted text-xs">
                    {toman(e.amount)} · {Math.round((e.amount / totalExpense) * 100)}٪
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-line flex items-center justify-between text-sm font-semibold">
                <span>جمع کل</span>
                <span>{toman(totalExpense)}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="تفکیک شارژ من" action={<Users2 size={16} className="text-tile" />} />
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-muted">{myChargeSplit.period}</p>
            <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-canvas">
              <span>سهم مالک</span>
              <span className="font-medium">{toman(myChargeSplit.ownerShare)}</span>
            </div>
            <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-canvas">
              <span>سهم مستأجر</span>
              <span className="font-medium">{toman(myChargeSplit.tenantShare)}</span>
            </div>
            <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-tile-soft text-tile font-semibold">
              <span>جمع کل شارژ</span>
              <span>{toman(myChargeSplit.total)}</span>
            </div>
            <p className="text-xs text-muted leading-6">{myChargeSplit.note}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="فاکتورها و رسیدهای من" />
        <div className="px-5 pb-5 space-y-2.5">
          {myInvoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between p-3.5 rounded-xl border border-line">
              <div className="flex items-center gap-3">
                <div className="bg-tile-soft text-tile rounded-lg p-2">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium">{inv.title}</p>
                  <p className="text-xs text-muted mt-0.5">{inv.date} · {toman(inv.amount)}</p>
                </div>
              </div>
              <button className="flex items-center gap-1.5 text-xs font-medium text-tile hover:underline">
                <Download size={13} /> دانلود PDF
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
