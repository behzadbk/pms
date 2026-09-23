import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { tickets } from '../../lib/mockData'

export function ResidentTickets() {
  const [submitted, setSubmitted] = useState(false)
  const mine = tickets.filter((t) => t.unit === 'واحد ۱۲')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تیکت‌های من</h1>
        <p className="text-muted text-sm mt-1">ثبت گزارش خرابی، انتقاد یا پیشنهاد و پیگیری وضعیت آن</p>
      </div>

      <Card>
        <CardHeader title="ثبت تیکت جدید" />
        <div className="px-5 pb-5 space-y-4">
          <label className="block">
            <span className="text-xs text-muted">موضوع</span>
            <input placeholder="مثلاً چراغ راهرو خراب است" className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-muted">توضیحات</span>
            <textarea rows={3} placeholder="جزئیات بیشتر..." className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm resize-none" />
          </label>
          <button
            onClick={() => setSubmitted(true)}
            className="bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90"
          >
            ارسال تیکت
          </button>
          {submitted && (
            <p className="text-sm text-good bg-good-soft rounded-xl px-4 py-3">تیکت شما ثبت شد و به تیم مدیریت ارسال گردید.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="تیکت‌های قبلی" />
        <div className="px-5 pb-5 space-y-3">
          {mine.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
              <div>
                <p className="text-sm font-medium">{t.subject}</p>
                <p className="text-xs text-muted mt-0.5">{t.category} · {t.createdAt}</p>
              </div>
              <StatusPill status={t.status} />
            </div>
          ))}
          {mine.length === 0 && <p className="text-sm text-muted text-center py-4">تیکتی ثبت نشده است</p>}
        </div>
      </Card>
    </div>
  )
}
