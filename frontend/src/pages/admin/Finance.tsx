import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { FinanceOverview } from '../../components/finance/FinanceOverview'
import { InvoiceDetail } from '../../components/finance/InvoiceDetail'
import { ChargeManager } from '../../components/finance/ChargeManager'
import { FormulaEditor } from '../../components/finance/FormulaEditor'
import { SettingsCard } from '../../components/finance/SettingsCard'
import { AccountantsCard } from '../../components/finance/AccountantsCard'
import { TH, TD } from '../../components/finance/parts'
import { Loading, ErrorBlock, useLoad } from '../../components/hm'
import { dayFa, financeApi, tomanText, type Invoice } from '../../lib/api/finance'

type Tab = 'overview' | 'invoices' | 'charges' | 'setup'

/**
 * گزارش و تنظیمات مالی مدیر ساختمان.
 * مدیر: فرمول شارژ، نرخ جریمه، حساب‌های حسابدار و صدور شارژ را مدیریت می‌کند؛ ثبت فاکتور هزینه با حسابدار است.
 */
export function AdminFinance() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [cat, setCat] = useState('')
  const invoices = useLoad(() => (tab === 'invoices' ? financeApi.invoices() : Promise.resolve([] as Invoice[])), [tab])
  const cats = useLoad(() => financeApi.categories(), [])
  const list = (invoices.data ?? []).filter((i) => !cat || i.category === cat)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">مالی ساختمان</h1>
        <p className="text-muted text-sm mt-1">گزارش مالی، فرمول شارژ، جریمه‌ی دیرکرد و حسابداران ساختمان</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {([['overview', 'خلاصه'], ['invoices', 'فاکتورها و هزینه‌ها'], ['charges', 'شارژ و مطالبات'], ['setup', 'فرمول و تنظیمات']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3.5 py-2 rounded-xl text-sm border ${tab === id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <FinanceOverview />}

      {tab === 'invoices' && (
        <Card>
          <CardHeader
            title={`${list.length.toLocaleString('fa-IR')} فاکتور · ${tomanText(list.reduce((a, i) => a + i.amount, 0))}`}
            action={
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 text-sm bg-card" aria-label="دسته">
                <option value="">همه‌ی دسته‌ها</option>
                {(cats.data ?? []).map((c) => <option key={c}>{c}</option>)}
              </select>
            }
          />
          {invoices.loading ? <Loading /> : invoices.error ? <div className="px-5 pb-5"><ErrorBlock message={invoices.error} retry={invoices.reload} /></div> : list.length === 0 ? <p className="px-5 pb-6 text-sm text-muted">فاکتوری ثبت نشده است. ثبت فاکتور توسط حسابدار انجام می‌شود.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>شرح</th><th className={TH}>دسته</th><th className={TH}>تاریخ</th><th className={TH}>مبلغ</th><th className={TH}>وضعیت</th><th className={TH}></th></tr></thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => setDetail(i)}>
                      <td className={`${TD} font-medium`}>{i.description}<span className="block text-xs text-muted font-normal">{i.vendor} · {i.number}</span></td>
                      <td className={`${TD} text-muted`}>{i.category}</td>
                      <td className={`${TD} text-muted whitespace-nowrap`}>{dayFa(i.invoice_date)}</td>
                      <td className={`${TD} font-medium whitespace-nowrap`}>{tomanText(i.amount)}</td>
                      <td className={TD}><StatusPill status={i.status} /></td>
                      <td className={TD}><span className="text-tile text-xs font-medium flex items-center gap-1 whitespace-nowrap"><Eye size={13} /> جزئیات</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'charges' && <ChargeManager />}

      {tab === 'setup' && (
        <div className="space-y-5">
          <FormulaEditor />
          <SettingsCard canEdit />
          <AccountantsCard />
        </div>
      )}

      <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
