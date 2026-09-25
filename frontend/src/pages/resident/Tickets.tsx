import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { SelectField } from '../../components/ui/Modal'
import { useStore, addTicket, DEMO_RESIDENT_UNIT, faDateTime } from '../../lib/store'

const categories = ['گزارش خرابی', 'انتقاد', 'پیشنهاد', 'سایر']

export function ResidentTickets() {
  const { tickets } = useStore()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [submitted, setSubmitted] = useState(false)
  const mine = tickets.filter((t) => t.unit === DEMO_RESIDENT_UNIT)

  function submit() {
    if (!subject.trim()) return
    addTicket({
      subject: subject.trim(),
      body: body.trim(),
      unit: DEMO_RESIDENT_UNIT,
      category,
      priority: 'normal',
      reporter: DEMO_RESIDENT_UNIT,
    })
    setSubject('')
    setBody('')
    setSubmitted(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تیکت‌های من</h1>
        <p className="text-muted text-sm mt-1">ثبت گزارش خرابی، انتقاد یا پیشنهاد و پیگیری وضعیت آن</p>
      </div>

      <Card>
        <CardHeader title="ثبت تیکت جدید" />
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-xs text-muted">موضوع</span>
              <input
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setSubmitted(false) }}
                placeholder="مثلاً چراغ راهرو طبقه ۵ خراب است"
                className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm"
              />
            </label>
            <SelectField label="نوع" value={category} onChange={(e) => setCategory(e.target.value)} options={categories.map((c) => ({ value: c, label: c }))} />
          </div>
          <label className="block">
            <span className="text-xs text-muted">توضیحات</span>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="جزئیات بیشتر..."
              className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm resize-none"
            />
          </label>
          <button
            onClick={submit}
            disabled={!subject.trim()}
            className="bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40"
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
            <div key={t.id} className="p-3 rounded-xl border border-line">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t.subject}</p>
                  <p className="text-xs text-muted mt-0.5">{t.category} · {faDateTime(t.createdIso)}</p>
                </div>
                <StatusPill status={t.status} />
              </div>
              {t.timeline.length > 1 && (
                <p className="text-xs text-muted mt-2 bg-canvas rounded-lg px-3 py-2">آخرین پیگیری: {t.timeline[t.timeline.length - 1].text}</p>
              )}
            </div>
          ))}
          {mine.length === 0 && <p className="text-sm text-muted text-center py-4">تیکتی ثبت نشده است</p>}
        </div>
      </Card>
    </div>
  )
}
