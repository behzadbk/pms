import { useState, type ReactNode } from 'react'
import { Paperclip } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { StatusPill } from '../ui/StatusPill'
import { dayFa, methodFa, openInvoiceAttachment, tomanText, type Invoice } from '../../lib/api/finance'
import { errText } from '../../lib/api/residents'

/** جزئیات کامل یک فاکتور — مشترک بین حسابداری (ثبت‌کننده) و مدیر (فقط مشاهده) */
export function InvoiceDetail({ invoice, onClose, actions }: { invoice: Invoice | null; onClose: () => void; actions?: ReactNode }) {
  const [err, setErr] = useState('')
  if (!invoice) return null
  return (
    <Modal open size="lg" title={`فاکتور ${invoice.number}`} onClose={onClose} footer={actions}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Info label="فروشنده / طرف حساب" value={invoice.vendor} />
          <Info label="دسته‌ی هزینه" value={invoice.category} />
          <Info label="وضعیت"><StatusPill status={invoice.status} /></Info>
          <Info label="تاریخ فاکتور" value={dayFa(invoice.invoice_date)} />
          <Info label="تاریخ پرداخت" value={dayFa(invoice.paid_on)} />
          <Info label="روش پرداخت" value={methodFa(invoice.pay_method)} />
        </div>
        <p className="text-sm bg-canvas rounded-xl p-3">{invoice.description}</p>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted border-b border-line bg-canvas"><th className="font-medium px-4 py-2">شرح</th><th className="font-medium px-4 py-2">تعداد</th><th className="font-medium px-4 py-2">فی</th><th className="font-medium px-4 py-2">جمع</th></tr></thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">{it.title}</td>
                  <td className="px-4 py-2.5 text-muted">{it.qty.toLocaleString('fa-IR')}</td>
                  <td className="px-4 py-2.5 text-muted">{tomanText(it.unit_price)}</td>
                  <td className="px-4 py-2.5 font-medium">{tomanText(it.qty * it.unit_price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-canvas"><td className="px-4 py-2.5 font-semibold" colSpan={3}>مبلغ کل</td><td className="px-4 py-2.5 font-bold">{tomanText(invoice.amount)}</td></tr></tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>ثبت‌شده توسط: {invoice.registered_by_name ?? '—'} (حسابداری)</span>
          {invoice.has_attachment && (
            <button className="flex items-center gap-1 text-tile hover:underline" onClick={() => openInvoiceAttachment(invoice.id).catch((e) => setErr(errText(e)))}>
              <Paperclip size={12} /> {invoice.attachment_name ?? 'مشاهده‌ی پیوست'}
            </button>
          )}
        </div>
        {err && <p className="text-xs text-bad">{err}</p>}
      </div>
    </Modal>
  )
}

function Info({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-canvas">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="text-sm font-medium mt-1">{children ?? value}</div>
    </div>
  )
}
