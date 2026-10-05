import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Home, Lightbulb, MapPin, MessageSquareText, Send, ThumbsDown, Wrench } from 'lucide-react'
import {
  maintenanceApi, KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL,
  type Ticket, type TicketContext, type TicketDetail, type TicketKind,
} from '../../lib/api/maintenance'
import { errText, fa } from '../../lib/api/residents'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Sheet, useLoad, useToast } from '../../components/hm'
import { PRIORITY_TONE, STATUS_TONE, SelectField, TextAreaField, CheckRow, whenFa } from '../shared/maintenanceUi'
import { ago } from '../../lib/api/residents'

const kinds: { id: TicketKind; icon: typeof Wrench; hint: string }[] = [
  { id: 'fault', icon: Wrench, hint: 'چیزی خراب شده یا کار نمی‌کند' },
  { id: 'criticism', icon: ThumbsDown, hint: 'از چیزی ناراضی هستید' },
  { id: 'suggestion', icon: Lightbulb, hint: 'ایده‌ای برای بهتر شدن ساختمان' },
  { id: 'direct', icon: MessageSquareText, hint: 'پیام خصوصی فقط برای مدیر ساختمان' },
]

const floors = ['-۲', '-۱', 'همکف', ...Array.from({ length: 12 }, (_, i) => fa(i + 1)), 'پشت‌بام']
const areas = ['راهرو', 'راه‌پله', 'آسانسور', 'لابی', 'پارکینگ', 'موتورخانه', 'انباری', 'محوطه / حیاط', 'مشاعات (سالن، استخر، …)', 'سایر']
const placeholders: Record<TicketKind, string> = {
  fault: 'مثلاً لامپ راهرو سوخته است',
  criticism: 'مثلاً نظافت راه‌پله‌ها مرتب انجام نمی‌شود',
  suggestion: 'مثلاً نصب قفسه دوچرخه در پارکینگ',
  direct: 'موضوع پیام',
}

type Where = 'unit' | 'floor' | 'other'

export function ResidentTickets() {
  const { toast, toastNode } = useToast()
  const ctx = useLoad<TicketContext>(() => maintenanceApi.context(), [])
  const list = useLoad<Ticket[]>(() => maintenanceApi.tickets(), [])
  const [kind, setKind] = useState<TicketKind | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'تیکت‌های من · همین'
    const t = window.setInterval(() => document.visibilityState === 'visible' && void list.reload(true), 30_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="ساکن" title="تیکت‌های من" />
      <p className="text-sm text-[var(--hm-t2)] -mt-2">گزارش خرابی، انتقاد، پیشنهاد یا پیام مستقیم به مدیر</p>

      {kind ? (
        <TicketForm
          kind={kind}
          unit={ctx.data?.unit ?? null}
          onBack={() => setKind(null)}
          onDone={async (msg) => {
            setKind(null)
            toast(msg)
            await list.reload(true)
          }}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kinds.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className="hm-card text-right p-4 min-h-[124px] flex flex-col gap-1.5 active:scale-[0.98] transition-transform">
              <k.icon size={24} className="text-[var(--hm-pri)]" />
              <p className="font-bold text-sm mt-1.5">{KIND_LABEL[k.id]}</p>
              <p className="text-xs text-[var(--hm-t2)] leading-5">{k.hint}</p>
            </button>
          ))}
        </div>
      )}

      <p className="text-sm font-bold mt-2">درخواست‌های قبلی</p>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error || !list.data ? (
        <ErrorBlock message={list.error ?? ''} retry={() => void list.reload()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="درخواستی ثبت نشده است" tone="mute" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.data.map((t) => (
            <button key={t.id} className="hm-card p-4 text-right flex flex-col gap-2 active:scale-[0.99] transition-transform" onClick={() => setOpenId(t.id)}>
              <div className="flex items-start gap-2">
                <p className="font-bold text-[15px] flex-1 min-w-0 leading-7">{t.subject}</p>
                <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              </div>
              <p className="text-xs text-[var(--hm-t2)] leading-6">
                {KIND_LABEL[t.kind]} · {ago(t.created_at)}
                {t.location && ` · ${t.location}`}
              </p>
              {t.event_count > 1 && t.last_event && <p className="text-xs rounded-xl px-3 py-2 hm-tone-mute leading-6">آخرین پیگیری: {t.last_event}</p>}
            </button>
          ))}
        </div>
      )}

      <TicketSheet id={openId} onClose={() => setOpenId(null)} toast={toast} onChanged={() => list.reload(true)} />
      {toastNode}
    </div>
  )
}

function TicketForm({ kind, unit, onBack, onDone }: { kind: TicketKind; unit: TicketContext['unit']; onBack: () => void; onDone: (msg: string) => Promise<void> }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [where, setWhere] = useState<Where>('unit')
  const [floor, setFloor] = useState(unit?.floor != null ? fa(unit.floor) : fa(1))
  const [area, setArea] = useState(areas[0])
  const [spot, setSpot] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const myFloor = unit?.floor != null ? fa(unit.floor) : '—'
  const block = unit?.building ?? ''
  const unitNo = unit ? fa(unit.number) : '—'
  const location =
    kind !== 'fault'
      ? undefined
      : where === 'unit'
        ? `داخل واحد ${unitNo} · طبقه ${myFloor}${block ? ` · ${block}` : ''}`
        : where === 'floor'
          ? `طبقه ${myFloor} (مشاعات)${block ? ` · ${block}` : ''}${spot ? ` · ${spot}` : ''}`
          : [floor.match(/^[-۰-۹]/) ? `طبقه ${floor}` : floor, area, spot].filter(Boolean).join(' · ')

  async function submit() {
    if (subject.trim().length < 3) return setErr('موضوع را بنویسید')
    setBusy(true)
    setErr('')
    try {
      await maintenanceApi.createTicket({ kind, subject: subject.trim(), body: body.trim() || undefined, priority: kind === 'fault' ? (urgent ? 'urgent' : 'normal') : undefined, location })
      await onDone(kind === 'direct' ? 'پیام شما برای مدیر ساختمان ارسال شد' : 'ثبت شد و به مدیریت ساختمان ارسال گردید')
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="hm-card p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="hm-back" aria-label="تغییر موضوع">
          <ArrowRight size={20} />
        </button>
        <p className="font-bold flex-1">{KIND_LABEL[kind]}</p>
      </div>

      {kind === 'fault' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--hm-t2)] flex items-center gap-1.5">
            <MapPin size={13} /> محل خرابی
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              ['unit', 'داخل واحد من', `واحد ${unitNo} · طبقه ${myFloor}`],
              ['floor', 'طبقه‌ی من (مشاعات)', `راهرو/راه‌پله طبقه ${myFloor}`],
              ['other', 'جای دیگر', 'طبقه یا بخش دیگری از ساختمان'],
            ] as [Where, string, string][]).map(([id, label, sub]) => (
              <button key={id} type="button" onClick={() => setWhere(id)} className="hm-row !items-start text-right" style={where === id ? { borderColor: 'var(--hm-pri)', background: 'var(--hm-pri-soft)' } : undefined}>
                <span>
                  <span className="font-bold text-sm flex items-center gap-1">{id === 'unit' && <Home size={13} />} {label}</span>
                  <span className="block text-xs text-[var(--hm-t2)] mt-0.5">{sub}</span>
                </span>
              </button>
            ))}
          </div>
          {where === 'other' && (
            <FieldCard>
              <SelectField label="طبقه" value={floor} onChange={setFloor} options={floors.map((f) => ({ value: f, label: f.match(/^[-۰-۹]/) ? `طبقه ${f}` : f }))} />
              <SelectField label="بخش" value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} />
              <Field label="جزئیات محل (اختیاری)" value={spot} onChange={setSpot} placeholder="مثلاً کنار ستون ۱۲" />
            </FieldCard>
          )}
          {where === 'floor' && (
            <FieldCard>
              <Field label="جزئیات محل (اختیاری)" value={spot} onChange={setSpot} placeholder="مثلاً جلوی آسانسور" />
            </FieldCard>
          )}
          <p className="text-xs rounded-xl px-3 py-2 hm-tone-mute leading-6">
            محل ثبت‌شده: <b>{location}</b>
          </p>
        </div>
      )}

      <FieldCard>
        <Field label="موضوع" value={subject} onChange={setSubject} placeholder={placeholders[kind]} />
        <TextAreaField label={kind === 'direct' ? 'متن پیام' : 'توضیحات'} value={body} onChange={setBody} placeholder="جزئیات بیشتر…" rows={4} maxLength={4000} />
        {kind === 'fault' && (
          <CheckRow checked={urgent} onChange={setUrgent}>
            فوری است (خطر، قطعی آب/برق، گیر کردن آسانسور…)
          </CheckRow>
        )}
      </FieldCard>
      {kind === 'direct' && <p className="text-xs text-[var(--hm-t2)]">این پیام فقط برای مدیر ساختمان ارسال می‌شود.</p>}
      {err && <p className="text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta busy={busy} disabled={subject.trim().length < 3} onClick={submit}>
        {kind === 'direct' ? 'ارسال پیام' : 'ثبت و ارسال'}
      </Cta>
    </section>
  )
}

function TicketSheet({ id, onClose, toast, onChanged }: { id: string | null; onClose: () => void; toast: (m: string) => void; onChanged: () => Promise<unknown> }) {
  const { data, error, reload } = useLoad<TicketDetail | null>(() => (id ? maintenanceApi.ticket(id) : Promise.resolve(null)), [id])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setText(''), [id])

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      setText('')
      await reload(true)
      await onChanged()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const t = data
  return (
    <Sheet open={!!id} onClose={onClose} label="جزئیات تیکت">
      {error ? (
        <ErrorBlock message={error} />
      ) : !t ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-lg font-bold leading-8">{t.subject}</p>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              {t.kind === 'fault' && <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>}
              <span className="text-xs text-[var(--hm-t2)]">
                {KIND_LABEL[t.kind]} · {whenFa(t.created_at)}
              </span>
            </div>
            {t.location && <p className="text-xs text-[var(--hm-t2)] mt-1.5 flex items-center gap-1"><MapPin size={12} /> {t.location}</p>}
          </div>
          {t.body && <p className="text-sm leading-7 rounded-2xl px-3 py-2.5 hm-tone-mute whitespace-pre-line">{t.body}</p>}
          <div>
            <p className="text-sm font-bold mb-2">روند پیگیری</p>
            <ol className="flex flex-col gap-2.5 border-r-2 pr-4" style={{ borderColor: 'var(--hm-hair)' }}>
              {t.events.map((e) => (
                <li key={e.id} className="text-xs leading-6">
                  <span className="text-[var(--hm-t2)]">{whenFa(e.created_at)}</span>
                  <p className="text-sm">
                    {e.type === 'comment' && e.actor_name ? <b>{e.actor_name}: </b> : null}
                    {e.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          {t.status !== 'closed' && (
            <div className="flex items-end gap-2">
              <label className="hm-card flex-1 px-3 py-2">
                <span className="block text-xs text-[var(--hm-t2)]">پیام به مدیریت</span>
                <input className="hm-input mt-0.5" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="توضیح بیشتر یا پاسخ…" />
              </label>
              <button className="hm-back" aria-label="ارسال" disabled={busy || !text.trim()} onClick={() => act(() => maintenanceApi.comment(t.id, text.trim()), 'ارسال شد')}>
                <Send size={18} />
              </button>
            </div>
          )}
          {t.status === 'resolved' && (
            <div className="grid grid-cols-2 gap-2">
              <button className="lg4-capsule min-h-[46px] text-sm font-bold disabled:opacity-60" disabled={busy} onClick={() => act(() => maintenanceApi.setStatus(t.id, 'closed'), 'تیکت بسته شد')}>
                مشکل حل شد، ببند
              </button>
              <button className="min-h-[46px] rounded-full text-sm font-bold hm-tone-bad disabled:opacity-60" disabled={busy} onClick={() => act(() => maintenanceApi.setStatus(t.id, 'open', 'ساکن: مشکل برطرف نشده'), 'تیکت دوباره باز شد')}>
                هنوز حل نشده
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
