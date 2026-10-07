import { useCallback, useEffect, useState } from 'react'
import { Wallet, Receipt, AlertCircle, RefreshCw, FilePlus2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { Loading, ErrorBlock } from '../../components/hm'
import { platformApi } from '../../lib/api'
import { errText, fa } from '../../lib/api/residents'
import { fmtToman, type InvoiceStatus, type PlatformInvoice, type PlatformSummary } from '../../lib/api/platform'

const faDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fa-IR') : '—')
const faPeriod = (p: string) => p.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

export function SuperAdminBilling() {
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([])
  const [summary, setSummary] = useState<PlatformSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [inv, sum] = await Promise.all([platformApi.listInvoices(), platformApi.getSummary()])
      setInvoices(inv.invoices)
      setSummary(sum)
    } catch (e) {
      setErr(errText(e, 'دریافت فاکتورها ناموفق بود'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function generate() {
    setBusy('generate')
    setNote(null)
    try {
      const r = await platformApi.generateInvoices()
      setNote(r.created ? `${fa(r.created)} فاکتور برای دوره‌ی ${faPeriod(r.period)} صادر شد` : `برای دوره‌ی ${faPeriod(r.period)} همه‌ی فاکتورها قبلاً صادر شده است`)
      await load()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(id: string, status: InvoiceStatus) {
    setBusy(id)
    try {
      await platformApi.setInvoiceStatus(id, status)
      await load()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">تراکنش‌های پلتفرم</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 border border-line bg-card px-3 py-2.5 rounded-xl text-sm hover:bg-canvas" aria-label="بازخوانی">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={generate} disabled={busy === 'generate'} className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
            <FilePlus2 size={16} />
            صدور فاکتور این ماه
          </button>
        </div>
      </div>

      {note && <p className="text-sm text-good bg-good-soft rounded-lg px-3 py-2">{note}</p>}
      {err && <ErrorBlock message={err} retry={load} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="درآمد ماهانه مکرر" value={summary ? fmtToman(summary.totalMrr) : '—'} icon={Wallet} tone="ink" />
        <StatCard label="فاکتورهای این ماه" value={summary ? fa(summary.invoices.thisPeriod) : '—'} sub={summary ? `${fa(summary.invoices.paid)} پرداخت‌شده · ${fa(summary.invoices.pending)} در انتظار` : undefined} icon={Receipt} tone="tile" />
        <StatCard label="پرداخت‌های ناموفق" value={summary ? fa(summary.invoices.failed) : '—'} icon={AlertCircle} tone="bad" />
      </div>

      <Card>
        <CardHeader title="فاکتورهای اشتراک" />
        {loading && invoices.length === 0 ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted text-center py-10">هنوز فاکتوری صادر نشده است. با «صدور فاکتور این ماه» برای همه‌ی مجتمع‌های فعال فاکتور بسازید.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">مجتمع</th>
                  <th className="font-medium px-5 py-2.5">دوره</th>
                  <th className="font-medium px-5 py-2.5">مبلغ</th>
                  <th className="font-medium px-5 py-2.5">سررسید</th>
                  <th className="font-medium px-5 py-2.5">وضعیت</th>
                  <th className="font-medium px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{inv.tenantName}</td>
                    <td className="px-5 py-3 text-muted">{faPeriod(inv.period)}</td>
                    <td className="px-5 py-3 font-medium">{fmtToman(inv.amount)}</td>
                    <td className="px-5 py-3 text-muted">{inv.status === 'paid' ? `پرداخت: ${faDate(inv.paidAt)}` : faDate(inv.dueAt)}</td>
                    <td className="px-5 py-3"><StatusPill status={inv.status === 'void' ? 'cancelled' : inv.status} /></td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {(inv.status === 'pending' || inv.status === 'failed') && (
                        <span className="flex items-center gap-3 text-xs font-medium">
                          <button disabled={busy === inv.id} onClick={() => setStatus(inv.id, 'paid')} className="text-tile hover:underline">ثبت پرداخت</button>
                          {inv.status === 'pending' && <button disabled={busy === inv.id} onClick={() => setStatus(inv.id, 'failed')} className="text-bad hover:underline">ناموفق</button>}
                          <button disabled={busy === inv.id} onClick={() => setStatus(inv.id, 'void')} className="text-muted hover:underline">ابطال</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
