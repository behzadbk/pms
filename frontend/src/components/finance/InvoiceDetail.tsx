import type { ReactNode } from 'react'
import { Paperclip } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { StatusPill } from '../ui/StatusPill'
import { toman } from '../../lib/mockData'
import { faDate, type InvoiceRec } from '../../lib/store'

/** جزئیات کامل یک فاکتور — مشترک بین حسابداری (ثبت‌کننده) و مدیر (فقط مشاهده) */
export function InvoiceDetail({ invoice, onClose, actions }: { invoice: InvoiceRec | null; onClose: () => void; actions?: ReactNode }) {
  if (!invoice) return null
  return (
    <Modal open size="lg" title={`فاکتور ${invoice.number}`} onClose={onClose} footer={actions}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Info label="فروشنده / طرف حساب" value={invoice.vendor} />
          <Info label="دسته‌ی هزینه" value={invoice.category} />
          <Info label="وضعیت">
            <StatusPill status={invoice.status} />
          </Info>
          <Info label="تاریخ فاکتور" value={faDate(invoice.issuedAt)} />
          <Info label="تاریخ پرداخت" value={invoice.paidAt ? faDate(invoice.paidAt) : '—'} />
          <Info label="روش پرداخت" value={invoice.method} />
        </div>
        <p className="text-sm bg-canvas rounded-xl p-3">{invoice.description}</p>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-b border-line bg-canvas">
                <th className="font-medium px-4 py-2">شرح</th>
                <th className="font-medium px-4 py-2">تعداد</th>
                <th className="font-medium px-4 py-2">فی</th>
                <th className="font-medium px-4 py-2">جمع</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">{it.title}</td>
                  <td className="px-4 py-2.5 text-muted">{it.qty.toLocaleString('fa-IR')}</td>
                  <td className="px-4 py-2.5 text-muted">{toman(it.unitPrice)}</td>
                  <td className="px-4 py-2.5 font-medium">{toman(it.qty * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-canvas">
                <td className="px-4 py-2.5 font-semibold" colSpan={3}>مبلغ کل</td>
                <td className="px-4 py-2.5 font-bold">{toman(invoice.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>ثبت‌شده توسط: {invoice.registeredBy} (حسابداری)</span>
          {invoice.attachmentName && (
            <span className="flex items-center gap-1">
              <Paperclip size={12} /> {invoice.attachmentName}
            </span>
          )}
        </div>
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
