import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, Info } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { FinanceOverview } from '../../components/finance/FinanceOverview'
import { InvoiceDetail } from '../../components/finance/InvoiceDetail'
import { toman } from '../../lib/mockData'
import { useStore, faDate, expenseCategories } from '../../lib/store'
import { chargeStats, periods } from '../../lib/finance'

type Tab = 'overview' | 'invoices' | 'charges'

/**
 * گزارش مالی مدیر ساختمان — فقط مشاهده.
 * ثبت فاکتور، صدور شارژ و ثبت وصولی مسئولیت حسابداری است (پنل /accountant).
 */
export function AdminFinance() {
  const { invoices, charges } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [cat, setCat] = useState('')
  const allPeriods = periods(charges)
  const [period, setPeriod] = useState(allPeriods[0] ?? '')

  const invList = cat ? invoices.filter((i) => i.category === cat) : invoices
  const chargeList = charges.filter((c) => c.period === (period || allPeriods[0]))
  const cs = chargeStats(chargeList)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">گزارش مالی</h1>
        <p className="text-muted text-sm mt-1 flex items-center gap-1.5">
          <Info size={14} /> نمای گزارش — ثبت فاکتور و مدیریت شارژ توسط حسابداری انجام می‌شود
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {([
          ['overview', 'خلاصه'],
          ['invoices', 'فاکتورها و هزینه‌ها'],
          ['charges', 'شارژ و مطالبات'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-xl text-sm border ${tab === id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <FinanceOverview />}

      {tab === 'invoices' && (
        <Card>
          <CardHeader
            title={`${invList.length.toLocaleString('fa-IR')} فاکتور · ${toman(invList.reduce((a, i) => a + i.amount, 0))}`}
            action={
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 text-sm bg-card">
                <option value="">همه‌ی دسته‌ها</option>
                {expenseCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">شرح</th>
                  <th className="font-medium px-5 py-2.5">دسته</th>
                  <th className="font-medium px-5 py-2.5">تاریخ</th>
                  <th className="font-medium px-5 py-2.5">مبلغ</th>
                  <th className="font-medium px-5 py-2.5">وضعیت</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {invList.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => setDetailId(i.id)}>
                    <td className="px-5 py-3 font-medium">
                      {i.description}
                      <span className="block text-xs text-muted font-normal">{i.vendor} · {i.number}</span>
                    </td>
                    <td className="px-5 py-3 text-muted">{i.category}</td>
                    <td className="px-5 py-3 text-muted">{faDate(i.issuedAt)}</td>
                    <td className="px-5 py-3 font-medium">{toman(i.amount)}</td>
                    <td className="px-5 py-3"><StatusPill status={i.status} /></td>
                    <td className="px-5 py-3">
                      <span className="text-tile text-xs font-medium flex items-center gap-1 whitespace-nowrap"><Eye size={13} /> جزئیات</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'charges' && (
        <Card>
          <CardHeader
            title="وضعیت وصول شارژ"
            action={
              <select value={period || allPeriods[0]} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 text-sm bg-card">
                {allPeriods.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            }
          />
          <div className="px-5 pb-4">
            <div className="flex justify-between text-xs mb-1.5">
              <span>وصول‌شده {toman(cs.paid)} از {toman(cs.total)}</span>
              <span className="font-medium">{cs.rate.toLocaleString('fa-IR')}٪</span>
            </div>
            <div className="h-2.5 rounded-full bg-canvas overflow-hidden">
              <div className="h-full bg-good rounded-full" style={{ width: `${cs.rate}%` }} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">واحد</th>
                  <th className="font-medium px-5 py-2.5">مبلغ</th>
                  <th className="font-medium px-5 py-2.5">جریمه</th>
                  <th className="font-medium px-5 py-2.5">سررسید</th>
                  <th className="font-medium px-5 py-2.5">تاریخ پرداخت</th>
                  <th className="font-medium px-5 py-2.5">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {chargeList.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{c.unit}</td>
                    <td className="px-5 py-3">{toman(c.total)}</td>
                    <td className="px-5 py-3 text-muted">{c.lateFee ? toman(c.lateFee) : '—'}</td>
                    <td className="px-5 py-3 text-muted">{c.dueDate}</td>
                    <td className="px-5 py-3 text-muted">{c.paidAt ? faDate(c.paidAt) : '—'}</td>
                    <td className="px-5 py-3"><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <InvoiceDetail invoice={invoices.find((i) => i.id === detailId) ?? null} onClose={() => setDetailId(null)} />
    </div>
  )
}
