import { Plus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { financeSummary, toman } from '../../lib/mockData'

const transactions = [
  { id: '1', desc: 'واریز شارژ واحد ۴', type: 'income', amount: 2_450_000, date: '۱۴۰۴/۰۶/۰۱', method: 'درگاه آنلاین' },
  { id: '2', desc: 'فاکتور نظافت راه‌پله', type: 'expense', amount: 3_200_000, date: '۱۴۰۴/۰۵/۲۹', method: 'واریز بانکی' },
  { id: '3', desc: 'واریز شارژ واحد ۱۵', type: 'income', amount: 2_600_000, date: '۱۴۰۴/۰۵/۲۸', method: 'کیف پول' },
  { id: '4', desc: 'قبض برق مشاعات', type: 'expense', amount: 4_100_000, date: '۱۴۰۴/۰۵/۲۵', method: 'واریز بانکی' },
  { id: '5', desc: 'دستمزد سرایدار — مرداد', type: 'expense', amount: 12_500_000, date: '۱۴۰۴/۰۵/۰۱', method: 'نقدی' },
]

export function AdminFinance() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">صندوق و فاکتورها</h1>
          <p className="text-muted text-sm mt-1">دفترداری صندوق ساختمان و فاکتورهای هزینه مشاعات</p>
        </div>
        <button className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={16} />
          ثبت فاکتور جدید
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="موجودی فعلی صندوق" value={toman(financeSummary.fundBalance)} icon={Wallet} tone="ink" />
        <StatCard label="مجموع واریزی این ماه" value={toman(financeSummary.monthIncome)} icon={ArrowDownCircle} tone="tile" />
        <StatCard label="مجموع پرداختی این ماه" value={toman(financeSummary.monthExpense)} icon={ArrowUpCircle} tone="brass" />
      </div>

      <Card>
        <CardHeader title="گردش صندوق" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">شرح</th>
                <th className="font-medium px-5 py-2.5">تاریخ</th>
                <th className="font-medium px-5 py-2.5">روش</th>
                <th className="font-medium px-5 py-2.5">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{t.desc}</td>
                  <td className="px-5 py-3 text-muted">{t.date}</td>
                  <td className="px-5 py-3 text-muted">{t.method}</td>
                  <td className={`px-5 py-3 font-medium ${t.type === 'income' ? 'text-good' : 'text-bad'}`}>
                    {t.type === 'income' ? '+' : '−'} {toman(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
