import { useState } from 'react'
import { Wrench, ThumbsDown, Lightbulb, MessageSquareText, MapPin, ArrowRight, CheckCircle2, Home } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { SelectField, TextField, TextArea } from '../../components/ui/Modal'
import { useStore, addTicket, ticketKindInfo, DEMO_RESIDENT_UNIT, faDateTime, type TicketKind } from '../../lib/store'

/** پروفایل واحد ساکن — بعداً از property-svc (واحد/طبقه/بلوک کاربر) خوانده می‌شود */
const MY_FLOOR = 3
const MY_BLOCK = 'A'

const kinds: { id: TicketKind; icon: typeof Wrench; hint: string }[] = [
  { id: 'fault', icon: Wrench, hint: 'چیزی خراب شده یا کار نمی‌کند' },
  { id: 'criticism', icon: ThumbsDown, hint: 'از چیزی ناراضی هستید' },
  { id: 'suggestion', icon: Lightbulb, hint: 'ایده‌ای برای بهتر شدن ساختمان' },
  { id: 'direct', icon: MessageSquareText, hint: 'پیام خصوصی فقط برای مدیر ساختمان' },
]

const floors = ['-۲', '-۱', 'همکف', ...Array.from({ length: 12 }, (_, i) => (i + 1).toLocaleString('fa-IR')), 'پشت‌بام']
const areas = ['راهرو', 'راه‌پله', 'آسانسور', 'لابی', 'پارکینگ', 'موتورخانه', 'انباری', 'محوطه / حیاط', 'مشاعات (سالن، استخر، …)', 'سایر']

type Where = 'unit' | 'floor' | 'other'

export function ResidentTickets() {
  const { tickets } = useStore()
  const [kind, setKind] = useState<TicketKind | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [where, setWhere] = useState<Where>('unit')
  const [floor, setFloor] = useState(MY_FLOOR.toLocaleString('fa-IR'))
  const [area, setArea] = useState(areas[0])
  const [spot, setSpot] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const mine = tickets.filter((t) => t.unit === DEMO_RESIDENT_UNIT)

  const myFloor = MY_FLOOR.toLocaleString('fa-IR')
  const location =
    kind !== 'fault'
      ? undefined
      : where === 'unit'
        ? `داخل ${DEMO_RESIDENT_UNIT} · طبقه ${myFloor} · بلوک ${MY_BLOCK}`
        : where === 'floor'
          ? `طبقه ${myFloor} (مشاعات) · بلوک ${MY_BLOCK}${spot ? ` · ${spot}` : ''}`
          : [floor.match(/^[-۰-۹]/) ? `طبقه ${floor}` : floor, area, spot].filter(Boolean).join(' · ')

  const subjectPlaceholder = {
    fault: 'مثلاً لامپ راهرو سوخته است',
    criticism: 'مثلاً نظافت راه‌پله‌ها مرتب انجام نمی‌شود',
    suggestion: 'مثلاً نصب قفسه دوچرخه در پارکینگ',
    direct: 'موضوع پیام',
  }

  function submit() {
    if (!kind || !subject.trim()) return
    addTicket({
      kind,
      subject: subject.trim(),
      body: body.trim(),
      unit: DEMO_RESIDENT_UNIT,
      category: ticketKindInfo[kind].category,
      priority: kind === 'fault' ? (urgent ? 'urgent' : 'normal') : 'low',
      reporter: DEMO_RESIDENT_UNIT,
      location,
    })
    setSubmitted(kind === 'direct' ? 'پیام شما برای مدیر ساختمان ارسال شد.' : 'ثبت شد و به مدیریت ساختمان ارسال گردید.')
    setSubject('')
    setBody('')
    setUrgent(false)
    setSpot('')
    setKind(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تیکت‌های من</h1>
        <p className="text-muted text-sm mt-1">گزارش خرابی، انتقاد، پیشنهاد یا پیام مستقیم به مدیر</p>
      </div>

      {submitted && (
        <p className="text-sm text-good bg-good-soft rounded-xl px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={16} /> {submitted}
        </p>
      )}

      <Card>
        <CardHeader
          title={kind ? ticketKindInfo[kind].label : 'موضوع درخواست چیست؟'}
          action={
            kind && (
              <button onClick={() => setKind(null)} className="flex items-center gap-1 text-xs text-muted hover:text-ink-text">
                <ArrowRight size={14} /> تغییر موضوع
              </button>
            )
          }
        />
        <div className="px-5 pb-5">
          {!kind ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kinds.map((k) => (
                <button
                  key={k.id}
                  onClick={() => {
                    setKind(k.id)
                    setSubmitted(null)
                  }}
                  className="text-right p-4 rounded-2xl border border-line hover:border-tile hover:bg-tile-soft/40 transition-colors min-h-[112px]"
                >
                  <k.icon size={22} className="text-tile" />
                  <p className="font-semibold text-sm mt-2.5">{ticketKindInfo[k.id].label}</p>
                  <p className="text-xs text-muted mt-1">{k.hint}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {kind === 'fault' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted flex items-center gap-1.5">
                    <MapPin size={13} /> محل خرابی
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      ['unit', `داخل واحد من`, `${DEMO_RESIDENT_UNIT} · طبقه ${myFloor}`],
                      ['floor', 'طبقه‌ی من (مشاعات)', `راهرو/راه‌پله طبقه ${myFloor}`],
                      ['other', 'جای دیگر', 'طبقه یا بخش دیگری از ساختمان'],
                    ] as [Where, string, string][]).map(([id, label, sub]) => (
                      <label
                        key={id}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer text-sm ${
                          where === id ? 'border-tile bg-tile-soft/50' : 'border-line hover:border-ink-soft'
                        }`}
                      >
                        <input type="radio" name="where" checked={where === id} onChange={() => setWhere(id)} className="mt-0.5 accent-[var(--color-tile)]" />
                        <span>
                          <span className="font-medium flex items-center gap-1">{id === 'unit' && <Home size={13} />}{label}</span>
                          <span className="block text-xs text-muted mt-0.5">{sub}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {where === 'other' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <SelectField label="طبقه" value={floor} onChange={(e) => setFloor(e.target.value)} options={floors.map((f) => ({ value: f, label: f.match(/^[-۰-۹]/) ? `طبقه ${f}` : f }))} />
                      <SelectField label="بخش" value={area} onChange={(e) => setArea(e.target.value)} options={areas.map((a) => ({ value: a, label: a }))} />
                      <TextField label="جزئیات محل (اختیاری)" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="مثلاً کنار ستون ۱۲" />
                    </div>
                  )}
                  {where === 'floor' && (
                    <TextField label="جزئیات محل (اختیاری)" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="مثلاً جلوی آسانسور" />
                  )}
                  <p className="text-xs bg-canvas rounded-lg px-3 py-2">محل ثبت‌شده: <b>{location}</b></p>
                </div>
              )}

              <TextField label="موضوع" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={subjectPlaceholder[kind]} autoFocus />
              <TextArea label={kind === 'direct' ? 'متن پیام' : 'توضیحات'} value={body} onChange={(e) => setBody(e.target.value)} placeholder="جزئیات بیشتر…" />

              {kind === 'fault' && (
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                  <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-4 h-4 accent-[var(--color-bad)]" />
                  فوری است (خطر، قطعی آب/برق، گیر کردن آسانسور…)
                </label>
              )}
              {kind === 'direct' && <p className="text-xs text-muted">این پیام فقط برای مدیر ساختمان ارسال می‌شود.</p>}

              <button
                onClick={submit}
                disabled={!subject.trim()}
                className="bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                {kind === 'direct' ? 'ارسال پیام' : 'ثبت و ارسال'}
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="درخواست‌های قبلی" />
        <div className="px-5 pb-5 space-y-3">
          {mine.map((t) => (
            <div key={t.id} className="p-3 rounded-xl border border-line">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.subject}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {t.category} · {faDateTime(t.createdIso)}
                    {t.location && ` · ${t.location}`}
                  </p>
                </div>
                <StatusPill status={t.status} />
              </div>
              {t.timeline.length > 1 && (
                <p className="text-xs text-muted mt-2 bg-canvas rounded-lg px-3 py-2">آخرین پیگیری: {t.timeline[t.timeline.length - 1].text}</p>
              )}
            </div>
          ))}
          {mine.length === 0 && <p className="text-sm text-muted text-center py-4">درخواستی ثبت نشده است</p>}
        </div>
      </Card>
    </div>
  )
}
