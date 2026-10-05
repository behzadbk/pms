import { useState } from 'react'
import { Plus, Trash2, Wallet, ArrowDownCircle, ArrowUpCircle, FileClock } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { InvoiceDetail } from '../../components/finance/InvoiceDetail'
import { Callout, useBusy, TH, TD } from '../../components/finance/parts'
import { Loading, ErrorBlock, useLoad, useToast } from '../../components/hm'
import { errText } from '../../lib/api/residents'
import { dayFa, financeApi, methodFa, periodFa, tomanText, type Invoice, type InvoiceItem, type LedgerEntry } from '../../lib/api/finance'
import { tehranToday } from '../../lib/tehran'

const PAY_METHODS = [
  { value: 'bank_transfer', label: 'واریز بانکی' },
  { value: 'card_to_card', label: 'کارت به کارت' },
  { value: 'cheque', label: 'چک' },
  { value: 'cash', label: 'نقدی' },
]

export function AccountantInvoices() {
  const invoices = useLoad(() => financeApi.invoices(), [])
  const summary = useLoad(() => financeApi.summary(), [])
  const ledger = useLoad(() => financeApi.ledger(200), [])
  const [newOpen, setNewOpen] = useState(false)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [tab, setTab] = useState<'invoices' | 'ledger'>('invoices')
  const { toast, toastNode } = useToast()
  const refresh = () => { void invoices.reload(true); void summary.reload(true); void ledger.reload(true) }
  const s = summary.data

  async function remove(inv: Invoice) {
    if (!window.confirm('این فاکتور حذف شود؟')) return
    try {
      await financeApi.deleteInvoice(inv.id)
      setDetail(null)
      toast('فاکتور حذف شد')
      refresh()
    } catch (e) {
      toast(errText(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">صندوق و فاکتورها</h1>
          <p className="text-muted text-sm mt-1">ثبت فاکتورهای هزینه، پرداخت و دفتر صندوق ساختمان</p>
        </div>
        <PrimaryButton onClick={() => setNewOpen(true)}><Plus size={16} /> ثبت فاکتور جدید</PrimaryButton>
      </div>

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="موجودی فعلی صندوق" value={tomanText(s.fund_balance)} icon={Wallet} tone="ink" />
          <StatCard label={`واریزی ${periodFa(s.current_period)}`} value={tomanText(s.month_income)} icon={ArrowDownCircle} tone="tile" />
          <StatCard label={`پرداختی ${periodFa(s.current_period)}`} value={tomanText(s.month_expense)} icon={ArrowUpCircle} tone="brass" />
          <StatCard label="فاکتورهای پرداخت‌نشده" value={tomanText(s.unpaid_invoices.total)} sub={`${s.unpaid_invoices.count.toLocaleString('fa-IR')} فاکتور`} icon={FileClock} tone="bad" />
        </div>
      )}

      <div className="flex gap-2">
        {([['invoices', 'فاکتورها'], ['ledger', 'گردش صندوق']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3.5 py-2 rounded-xl text-sm border ${tab === id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>{label}</button>
        ))}
      </div>

      {tab === 'invoices' ? (
        <Card>
          <CardHeader title={`${(invoices.data?.length ?? 0).toLocaleString('fa-IR')} فاکتور`} />
          {invoices.loading ? <Loading /> : invoices.error ? <div className="px-5 pb-5"><ErrorBlock message={invoices.error} retry={invoices.reload} /></div> : !invoices.data?.length ? <p className="px-5 pb-6 text-sm text-muted">هنوز فاکتوری ثبت نشده است.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>شماره</th><th className={TH}>شرح</th><th className={TH}>دسته</th><th className={TH}>تاریخ</th><th className={TH}>مبلغ</th><th className={TH}>وضعیت</th><th className={TH}></th></tr></thead>
                <tbody>
                  {invoices.data.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => setDetail(i)}>
                      <td className={`${TD} text-muted font-mono text-xs`}>{i.number}</td>
                      <td className={`${TD} font-medium`}>{i.description}<span className="block text-xs text-muted font-normal">{i.vendor}</span></td>
                      <td className={`${TD} text-muted`}>{i.category}</td>
                      <td className={`${TD} text-muted whitespace-nowrap`}>{dayFa(i.invoice_date)}</td>
                      <td className={`${TD} font-medium whitespace-nowrap`}>{tomanText(i.amount)}</td>
                      <td className={TD}><StatusPill status={i.status} /></td>
                      <td className={TD} onClick={(e) => e.stopPropagation()}>
                        {i.status === 'pending' && <button onClick={() => setPaying(i)} className="text-xs font-medium text-tile hover:underline whitespace-nowrap">ثبت پرداخت</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="گردش صندوق" />
          {ledger.loading ? <Loading /> : ledger.error ? <div className="px-5 pb-5"><ErrorBlock message={ledger.error} retry={ledger.reload} /></div> : !ledger.data?.length ? <p className="px-5 pb-6 text-sm text-muted">هنوز تراکنشی ثبت نشده است.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>شرح</th><th className={TH}>تاریخ</th><th className={TH}>روش</th><th className={TH}>مبلغ</th></tr></thead>
                <tbody>
                  {ledger.data.map((t) => (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <td className={`${TD} font-medium`}>{ledgerDesc(t)}</td>
                      <td className={`${TD} text-muted whitespace-nowrap`}>{dayFa(t.date)}</td>
                      <td className={`${TD} text-muted`}>{methodFa(t.method)}</td>
                      <td className={`${TD} font-medium whitespace-nowrap ${t.type === 'income' ? 'text-good' : 'text-bad'}`}>{t.type === 'income' ? '+' : '−'} {tomanText(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <InvoiceDetail
        invoice={detail}
        onClose={() => setDetail(null)}
        actions={detail && detail.status === 'pending' && (
          <>
            <GhostButton className="!text-bad ml-auto" onClick={() => remove(detail)}><Trash2 size={15} /> حذف فاکتور</GhostButton>
            <PrimaryButton onClick={() => { setPaying(detail); setDetail(null) }}>ثبت پرداخت</PrimaryButton>
          </>
        )}
      />
      {paying && <PayDialog invoice={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); toast('پرداخت فاکتور ثبت شد'); refresh() }} />}
      {newOpen && <NewInvoiceDialog onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); toast('فاکتور ثبت شد'); refresh() }} />}
      {toastNode}
    </div>
  )
}

export function ledgerDesc(t: LedgerEntry) {
  return t.type === 'income' ? `واریز شارژ واحد ${t.unit_number} — ${periodFa(t.period)}${t.reference ? ` (پیگیری ${t.reference})` : ''}` : `${t.description} (${t.vendor})`
}

function PayDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState('bank_transfer')
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  return (
    <Modal open title={`پرداخت فاکتور ${invoice.number}`} onClose={onClose} footer={<><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={busy} onClick={() => run(async () => { try { await financeApi.payInvoice(invoice.id, { pay_method: method }); onDone() } catch (e) { setErr(errText(e)) } })}>ثبت پرداخت (کسر از صندوق)</PrimaryButton></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-canvas p-3 text-sm flex justify-between"><span>{invoice.vendor}</span><b>{tomanText(invoice.amount)}</b></div>
        <SelectField label="روش پرداخت" value={method} onChange={(e) => setMethod(e.target.value)} options={PAY_METHODS} />
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}

type Row = InvoiceItem & { key: number }

function NewInvoiceDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const cats = useLoad(() => financeApi.categories(), [])
  const [form, setForm] = useState({ number: '', vendor: '', category: '', description: '', invoice_date: tehranToday(), status: 'paid' as 'paid' | 'pending', pay_method: 'bank_transfer' })
  const [items, setItems] = useState<Row[]>([{ key: 1, title: '', qty: 1, unit_price: 0 }])
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))
  const setItem = (key: number, p: Partial<InvoiceItem>) => setItems((it) => it.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0
  const total = items.reduce((a, i) => a + i.qty * i.unit_price, 0)
  const category = form.category || cats.data?.[0] || ''
  const valid = form.vendor.trim() && form.description.trim() && total > 0 && items.every((i) => i.title.trim() && i.qty > 0)

  const submit = () => run(async () => {
    setErr('')
    try {
      let attachment: { name: string; mime: string; base64: string } | undefined
      if (file) {
        if (file.size > 3 * 1024 * 1024) throw new Error('حجم پیوست باید کمتر از ۳ مگابایت باشد')
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result).split(',')[1] ?? '')
          r.onerror = () => rej(new Error('خواندن فایل ناموفق بود'))
          r.readAsDataURL(file)
        })
        attachment = { name: file.name, mime: file.type, base64 }
      }
      await financeApi.createInvoice({
        number: form.number.trim() || undefined,
        vendor: form.vendor.trim(),
        category,
        description: form.description.trim(),
        items: items.map(({ title, qty, unit_price }) => ({ title: title.trim(), qty, unit_price })),
        invoice_date: form.invoice_date,
        status: form.status,
        pay_method: form.status === 'paid' ? form.pay_method : undefined,
        attachment,
      })
      onDone()
    } catch (e) {
      setErr(e instanceof Error && !('status' in e) ? e.message : errText(e))
    }
  })

  return (
    <Modal open size="xl" title="ثبت فاکتور جدید" onClose={onClose} footer={<><span className="text-sm ml-auto self-center">جمع کل: <b>{tomanText(total)}</b></span><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={!valid || busy} onClick={submit}>ثبت فاکتور</PrimaryButton></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextField label="فروشنده / طرف حساب" value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} autoFocus />
          <TextField label="شماره فاکتور" value={form.number} onChange={(e) => set({ number: e.target.value })} hint="خالی = شماره‌ی خودکار" />
          <SelectField label="دسته‌ی هزینه" value={category} onChange={(e) => set({ category: e.target.value })} options={(cats.data ?? []).map((c) => ({ value: c, label: c }))} />
          <TextArea className="sm:col-span-3" label="شرح" value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
          <TextField label="تاریخ فاکتور" type="date" dir="ltr" value={form.invoice_date} onChange={(e) => set({ invoice_date: e.target.value })} hint={dayFa(form.invoice_date)} />
          <SelectField label="وضعیت پرداخت" value={form.status} onChange={(e) => set({ status: e.target.value as 'paid' | 'pending' })} options={[{ value: 'paid', label: 'پرداخت‌شده (از صندوق کسر شود)' }, { value: 'pending', label: 'پرداخت‌نشده' }]} />
          {form.status === 'paid' && <SelectField label="روش پرداخت" value={form.pay_method} onChange={(e) => set({ pay_method: e.target.value })} options={PAY_METHODS} />}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">اقلام فاکتور</p>
            <button onClick={() => setItems((it) => [...it, { key: Date.now(), title: '', qty: 1, unit_price: 0 }])} className="text-xs font-medium text-tile hover:underline flex items-center gap-1"><Plus size={13} /> افزودن ردیف</button>
          </div>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="grid grid-cols-[1fr_60px_110px_auto] sm:grid-cols-[1fr_70px_130px_auto] gap-2 items-center">
                <input value={it.title} onChange={(e) => setItem(it.key, { title: e.target.value })} placeholder="شرح ردیف" className="rounded-lg border border-line px-3 py-2 text-sm bg-card min-w-0" />
                <input value={it.qty} inputMode="numeric" onChange={(e) => setItem(it.key, { qty: num(e.target.value) })} className="rounded-lg border border-line px-3 py-2 text-sm bg-card min-w-0" aria-label="تعداد" />
                <input dir="ltr" value={it.unit_price ? it.unit_price.toLocaleString('en-US') : ''} inputMode="numeric" placeholder="فی (تومان)" onChange={(e) => setItem(it.key, { unit_price: num(e.target.value) })} className="rounded-lg border border-line px-3 py-2 text-sm bg-card min-w-0" aria-label="فی" />
                <button disabled={items.length === 1} onClick={() => setItems((x) => x.filter((y) => y.key !== it.key))} className="p-2 text-muted hover:text-bad disabled:opacity-30" aria-label="حذف ردیف"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-muted">پیوست تصویر فاکتور (اختیاری — تصویر یا PDF تا ۳ مگابایت)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-tile-soft file:text-tile file:px-3 file:py-2" />
        </label>
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}
