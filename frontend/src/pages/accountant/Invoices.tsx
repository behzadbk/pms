import { useState } from 'react'
import { Plus, Trash2, Wallet, ArrowDownCircle, ArrowUpCircle, FileClock } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { InvoiceDetail } from '../../components/finance/InvoiceDetail'
import { toman } from '../../lib/mockData'
import { useStore, addInvoice, updateInvoice, deleteInvoice, expenseCategories, faDate, type InvoiceItem } from '../../lib/store'
import { useAuth } from '../../context/AuthContext'
import { fundBalance, ledger } from '../../lib/finance'

const methods = ['واریز بانکی', 'کارت به کارت', 'چک', 'نقدی', 'درگاه آنلاین']

export function AccountantInvoices() {
  const state = useStore()
  const { invoices } = state
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [tab, setTab] = useState<'invoices' | 'ledger'>('invoices')
  const detail = invoices.find((i) => i.id === detailId) ?? null

  const entries = ledger(state)
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const monthIncome = entries.filter((e) => e.type === 'income' && (e.date ?? '') >= monthAgo).reduce((a, e) => a + e.amount, 0)
  const monthExpense = entries.filter((e) => e.type === 'expense' && (e.date ?? '') >= monthAgo).reduce((a, e) => a + e.amount, 0)
  const unpaid = invoices.filter((i) => i.status === 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">صندوق و فاکتورها</h1>
          <p className="text-muted text-sm mt-1">ثبت فاکتورهای هزینه، پرداخت و دفتر صندوق ساختمان</p>
        </div>
        <PrimaryButton onClick={() => setNewOpen(true)}>
          <Plus size={16} />
          ثبت فاکتور جدید
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="موجودی فعلی صندوق" value={toman(fundBalance(state))} icon={Wallet} tone="ink" />
        <StatCard label="واریزی ۳۰ روز اخیر" value={toman(monthIncome)} icon={ArrowDownCircle} tone="tile" />
        <StatCard label="پرداختی ۳۰ روز اخیر" value={toman(monthExpense)} icon={ArrowUpCircle} tone="brass" />
        <StatCard label="فاکتورهای پرداخت‌نشده" value={toman(unpaid.reduce((a, i) => a + i.amount, 0))} sub={`${unpaid.length.toLocaleString('fa-IR')} فاکتور`} icon={FileClock} tone="bad" />
      </div>

      <div className="flex gap-2">
        {([
          ['invoices', 'فاکتورها'],
          ['ledger', 'گردش صندوق'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-xl text-sm border ${tab === id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'invoices' ? (
        <Card>
          <CardHeader title={`${invoices.length.toLocaleString('fa-IR')} فاکتور`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">شماره</th>
                  <th className="font-medium px-5 py-2.5">شرح</th>
                  <th className="font-medium px-5 py-2.5">دسته</th>
                  <th className="font-medium px-5 py-2.5">تاریخ</th>
                  <th className="font-medium px-5 py-2.5">مبلغ</th>
                  <th className="font-medium px-5 py-2.5">وضعیت</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => setDetailId(i.id)}>
                    <td className="px-5 py-3 text-muted font-mono text-xs">{i.number}</td>
                    <td className="px-5 py-3 font-medium">
                      {i.description}
                      <span className="block text-xs text-muted font-normal">{i.vendor}</span>
                    </td>
                    <td className="px-5 py-3 text-muted">{i.category}</td>
                    <td className="px-5 py-3 text-muted">{faDate(i.issuedAt)}</td>
                    <td className="px-5 py-3 font-medium">{toman(i.amount)}</td>
                    <td className="px-5 py-3"><StatusPill status={i.status} /></td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      {i.status === 'pending' && (
                        <button
                          onClick={() => updateInvoice(i.id, { status: 'paid', paidAt: new Date().toISOString() })}
                          className="text-xs font-medium text-tile hover:underline whitespace-nowrap"
                        >
                          ثبت پرداخت
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
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
                {entries.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{t.desc}</td>
                    <td className="px-5 py-3 text-muted">{faDate(t.date)}</td>
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
      )}

      <InvoiceDetail
        invoice={detail}
        onClose={() => setDetailId(null)}
        actions={
          detail && (
            <>
              <GhostButton
                className="!text-bad"
                onClick={() => {
                  deleteInvoice(detail.id)
                  setDetailId(null)
                }}
              >
                <Trash2 size={15} /> حذف فاکتور
              </GhostButton>
              {detail.status === 'pending' && (
                <PrimaryButton onClick={() => updateInvoice(detail.id, { status: 'paid', paidAt: new Date().toISOString() })}>ثبت پرداخت</PrimaryButton>
              )}
            </>
          )
        }
      />
      {newOpen && <NewInvoiceDialog onClose={() => setNewOpen(false)} />}
    </div>
  )
}

function NewInvoiceDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    number: '',
    vendor: '',
    category: expenseCategories[3],
    description: '',
    issuedAt: new Date().toISOString().slice(0, 10),
    status: 'paid' as 'paid' | 'pending',
    method: methods[0],
    attachmentName: '',
  })
  const [items, setItems] = useState<(InvoiceItem & { key: number })[]>([{ key: 1, title: '', qty: 1, unitPrice: 0 }])
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))
  const setItem = (key: number, p: Partial<InvoiceItem>) => setItems((it) => it.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0
  const total = items.reduce((a, i) => a + i.qty * i.unitPrice, 0)
  const valid = form.vendor.trim() && form.description.trim() && total > 0 && items.every((i) => i.title.trim())

  function submit() {
    if (!valid) return
    addInvoice({
      number: form.number.trim() || `F-${Date.now().toString().slice(-6)}`,
      vendor: form.vendor.trim(),
      category: form.category,
      description: form.description.trim(),
      items: items.map(({ title, qty, unitPrice }) => ({ title: title.trim(), qty, unitPrice })),
      amount: total,
      issuedAt: new Date(form.issuedAt).toISOString(),
      status: form.status,
      paidAt: form.status === 'paid' ? new Date().toISOString() : undefined,
      method: form.method,
      registeredBy: user?.fullName ?? 'حسابداری',
      attachmentName: form.attachmentName || undefined,
    })
    onClose()
  }

  return (
    <Modal
      open
      size="xl"
      title="ثبت فاکتور جدید"
      onClose={onClose}
      footer={
        <>
          <span className="text-sm ml-auto self-center">
            جمع کل: <b>{toman(total)}</b>
          </span>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={!valid} onClick={submit}>ثبت فاکتور</PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextField label="فروشنده / طرف حساب" value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} autoFocus />
          <TextField label="شماره فاکتور" value={form.number} onChange={(e) => set({ number: e.target.value })} hint="خالی = شماره خودکار" />
          <SelectField label="دسته‌ی هزینه" value={form.category} onChange={(e) => set({ category: e.target.value })} options={expenseCategories.map((c) => ({ value: c, label: c }))} />
          <TextArea className="sm:col-span-3" label="شرح" value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
          <TextField label="تاریخ فاکتور" type="date" value={form.issuedAt} onChange={(e) => set({ issuedAt: e.target.value })} />
          <SelectField
            label="وضعیت پرداخت"
            value={form.status}
            onChange={(e) => set({ status: e.target.value as 'paid' | 'pending' })}
            options={[{ value: 'paid', label: 'پرداخت‌شده (از صندوق کسر شود)' }, { value: 'pending', label: 'پرداخت‌نشده' }]}
          />
          <SelectField label="روش پرداخت" value={form.method} onChange={(e) => set({ method: e.target.value })} options={methods.map((m) => ({ value: m, label: m }))} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">اقلام فاکتور</p>
            <button onClick={() => setItems((it) => [...it, { key: Date.now(), title: '', qty: 1, unitPrice: 0 }])} className="text-xs font-medium text-tile hover:underline flex items-center gap-1">
              <Plus size={13} /> افزودن ردیف
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="grid grid-cols-[1fr_70px_130px_auto] gap-2 items-center">
                <input value={it.title} onChange={(e) => setItem(it.key, { title: e.target.value })} placeholder="شرح ردیف" className="rounded-lg border border-line px-3 py-2 text-sm" />
                <input value={it.qty} inputMode="numeric" onChange={(e) => setItem(it.key, { qty: num(e.target.value) })} className="rounded-lg border border-line px-3 py-2 text-sm" aria-label="تعداد" />
                <input value={it.unitPrice ? it.unitPrice.toLocaleString('en-US') : ''} inputMode="numeric" placeholder="فی (تومان)" onChange={(e) => setItem(it.key, { unitPrice: num(e.target.value) })} className="rounded-lg border border-line px-3 py-2 text-sm" aria-label="فی" />
                <button
                  disabled={items.length === 1}
                  onClick={() => setItems((x) => x.filter((y) => y.key !== it.key))}
                  className="p-2 text-muted hover:text-bad disabled:opacity-30"
                  aria-label="حذف ردیف"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-muted">پیوست تصویر فاکتور (اختیاری)</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => set({ attachmentName: e.target.files?.[0]?.name ?? '' })}
            className="mt-1.5 block w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-tile-soft file:text-tile file:px-3 file:py-2"
          />
        </label>
      </div>
    </Modal>
  )
}
