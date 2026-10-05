import { useEffect, useState, type ReactNode } from 'react'
import { ListPlus, Megaphone, Pin, Plus, Trash2, Users, Vote, X } from 'lucide-react'
import { announcementsApi, type Announcement, type AudienceGroup } from '../../lib/api/announcements'
import { errText, fa } from '../../lib/api/residents'
import { parseDateInput } from '../../lib/jalali'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, useLoad, useToast } from '../../components/hm'
import { CheckRow, DateField, Drawer, TextAreaField, whenFa } from '../shared/maintenanceUi'

type Tab = 'all' | 'announcement' | 'poll'

export function AdminAnnouncements() {
  const [tab, setTab] = useState<Tab>('all')
  const [composer, setComposer] = useState<'announcement' | 'poll' | null>(null)
  const { data, error, loading, reload } = useLoad<Announcement[]>(() => announcementsApi.feed(), [])
  const { toast, toastNode } = useToast()

  useEffect(() => {
    document.title = 'اعلانات و رأی‌گیری · همین'
  }, [])

  async function remove(a: Announcement) {
    if (!window.confirm(`«${a.title}» حذف شود؟ اعلان‌های ارسال‌شده هم از صندوق ساکنین پاک می‌شود.`)) return
    try {
      await announcementsApi.remove(a.id)
      toast('حذف شد')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }
  async function pin(a: Announcement) {
    try {
      await announcementsApi.patch(a.id, { pinned: !a.pinned })
      await reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }
  async function closePoll(a: Announcement) {
    try {
      await announcementsApi.patch(a.id, { close_now: true })
      toast('نظرسنجی بسته شد')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  const list = (data ?? []).filter((a) => tab === 'all' || a.kind === tab)
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="مدیریت" title="اعلانات و رأی‌گیری" />
      <p className="text-sm text-[var(--hm-t2)] -mt-2 leading-7">تابلوی اعلانات و نظرسنجی‌های ساختمان — پس از انتشار برای مخاطبان اعلان (و Push) ارسال می‌شود.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Seg<Tab> className="flex-1 min-w-[240px]" options={[['all', 'همه'], ['announcement', 'اعلان‌ها'], ['poll', 'نظرسنجی‌ها']]} value={tab} onChange={setTab} />
        <button className="hm-chip !min-h-[44px] inline-flex items-center gap-1.5" onClick={() => setComposer('poll')}>
          <Vote size={15} /> نظرسنجی جدید
        </button>
        <button className="lg4-capsule min-h-[44px] px-4 text-sm font-bold inline-flex items-center gap-1.5" onClick={() => setComposer('announcement')}>
          <Plus size={16} /> اعلان جدید
        </button>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBlock message={error ?? ''} retry={() => void reload()} />
      ) : list.length === 0 ? (
        <EmptyState icon={Megaphone} title="موردی منتشر نشده است" tone="mute" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((a) => (
            <AnnouncementCard
              key={a.id}
              a={a}
              actions={
                <div className="flex items-center gap-1.5">
                  <button className="hm-back !w-9 !h-9" aria-label={a.pinned ? 'برداشتن سنجاق' : 'سنجاق'} onClick={() => pin(a)} style={a.pinned ? { color: 'var(--hm-pri)' } : undefined}>
                    <Pin size={15} />
                  </button>
                  <button className="hm-back !w-9 !h-9" aria-label="حذف" onClick={() => remove(a)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              }
            >
              {a.kind === 'poll' && !a.closed && (
                <button className="hm-chip self-start" onClick={() => closePoll(a)}>
                  بستن نظرسنجی
                </button>
              )}
            </AnnouncementCard>
          ))}
        </div>
      )}

      <Composer
        kind={composer}
        onKind={setComposer}
        onClose={() => setComposer(null)}
        onDone={async (n) => {
          setComposer(null)
          toast(`منتشر شد — اعلان برای ${fa(n)} مخاطب ارسال شد`)
          await reload(true)
        }}
      />
      {toastNode}
    </div>
  )
}

/** کارت اعلان/نظرسنجی — نتایج وقتی نمایش داده می‌شوند که سرور اجازه دهد (مدیر، رأی‌داده، پایان‌یافته) */
export function AnnouncementCard({ a, actions, children }: { a: Announcement; actions?: ReactNode; children?: ReactNode }) {
  return (
    <article className="hm-card p-4 flex flex-col gap-3" style={a.emergency ? { borderColor: 'var(--hm-bad)' } : undefined}>
      <div className="flex items-start gap-2">
        <p className="font-bold text-[15px] flex-1 min-w-0 leading-7">
          {a.pinned && <Pin size={13} className="inline ml-1 text-[var(--hm-pri)]" />}
          {a.title}
        </p>
        {actions}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={a.kind === 'poll' ? 'pri' : a.emergency ? 'bad' : 'mute'}>{a.kind === 'poll' ? 'نظرسنجی' : a.emergency ? 'فوری' : 'اعلان'}</Badge>
        {a.kind === 'poll' && <Badge tone={a.closed ? 'mute' : 'ok'}>{a.closed ? 'بسته شده' : 'باز'}</Badge>}
        {a.weighted && <Badge tone="acc">وزن‌دار (متراژ)</Badge>}
      </div>
      {a.body && (
        <p className={`text-sm leading-7 whitespace-pre-line flex gap-2 ${a.emergency ? 'text-[var(--hm-bad)]' : 'text-[var(--hm-t2)]'}`}>
          {a.emergency && <Megaphone size={15} className="shrink-0 mt-1.5" />}
          {a.body}
        </p>
      )}

      {a.kind === 'poll' && a.results_visible && (
        <div className="flex flex-col gap-4">
          {a.questions.map((q, qi) => {
            const val = (o: (typeof q.options)[number]) => (a.weighted ? o.weight ?? 0 : o.votes ?? 0)
            const total = q.options.reduce((s, o) => s + val(o), 0)
            return (
              <div key={q.id}>
                <p className="text-sm font-bold mb-2">
                  {a.questions.length > 1 && `${fa(qi + 1)}. `}
                  {q.text}
                  {q.multi && <span className="text-xs text-[var(--hm-t2)] font-normal"> (چندگزینه‌ای)</span>}
                </p>
                <div className="flex flex-col gap-2">
                  {q.options.map((o) => {
                    const pct = total ? Math.round((val(o) / total) * 100) : 0
                    return (
                      <div key={o.id}>
                        <div className="flex justify-between text-xs mb-1 gap-2">
                          <span className="font-bold">
                            {o.label}
                            {q.my_answers.includes(o.id) && <span className="text-[var(--hm-pri)]"> ✓ رأی شما</span>}
                          </span>
                          <span className="text-[var(--hm-t2)] shrink-0">
                            {fa(o.votes ?? 0)} رأی · {fa(pct)}٪
                          </span>
                        </div>
                        <div className="hm-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {a.kind === 'poll' && (
        <p className="text-xs text-[var(--hm-t2)]">
          {fa(a.participants)} شرکت‌کننده
          {a.closes_at && ` · ${a.closed ? 'پایان' : 'مهلت'}: ${whenFa(a.closes_at)}`}
        </p>
      )}

      {children}

      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--hm-t2)] pt-1">
        <Users size={12} />
        {a.audience.map((k) => (
          <span key={k.key} className="hm-chip !min-h-0 !py-0.5 !px-2 !text-[11px] !font-normal">
            {k.label}
          </span>
        ))}
        <span className="mr-auto">{whenFa(a.created_at)}</span>
      </div>
    </article>
  )
}

interface QDraft { text: string; multi: boolean; options: string[] }
const newQ = (): QDraft => ({ text: '', multi: false, options: ['', ''] })

function Composer({ kind, onKind, onClose, onDone }: { kind: 'announcement' | 'poll' | null; onKind: (k: 'announcement' | 'poll') => void; onClose: () => void; onDone: (recipients: number) => Promise<void> }) {
  const open = !!kind
  const [groups, setGroups] = useState<AudienceGroup[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [audience, setAudience] = useState<string[]>(['all_residents'])
  const [units, setUnits] = useState('')
  const [questions, setQuestions] = useState<QDraft[]>([newQ()])
  const [closes, setCloses] = useState('')
  const [expires, setExpires] = useState('')
  const [weighted, setWeighted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setBody('')
    setEmergency(false)
    setPinned(false)
    setAudience(['all_residents'])
    setUnits('')
    setQuestions([newQ()])
    setCloses('')
    setExpires('')
    setWeighted(false)
    setErr('')
    void announcementsApi.audiences().then((r) => setGroups(r.groups)).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open && kind])

  const toggle = (k: string) => setAudience((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))
  const setQ = (i: number, p: Partial<QDraft>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)))
  const unitList = units.split(/[,،\s]+/).map((u) => u.trim()).filter(Boolean)

  async function publish() {
    if (!kind) return
    if (title.trim().length < 2) return setErr('عنوان را بنویسید')
    if (kind === 'announcement' && !body.trim()) return setErr('متن اعلان را بنویسید')
    if (!audience.length && !unitList.length) return setErr('حداقل یک مخاطب انتخاب کنید')
    if (kind === 'poll') {
      for (const q of questions) if (!q.text.trim() || q.options.filter((o) => o.trim()).length < 2) return setErr('هر سؤال متن و حداقل دو گزینه می‌خواهد')
    }
    const closeIso = closes.trim() ? parseDateInput(closes) : null
    if (closes.trim() && !closeIso) return setErr('مهلت نظرسنجی نامعتبر است')
    const expIso = expires.trim() ? parseDateInput(expires) : null
    if (expires.trim() && !expIso) return setErr('تاریخ انقضا نامعتبر است')
    setBusy(true)
    setErr('')
    try {
      const r = await announcementsApi.publish({
        kind, title: title.trim(), body: body.trim() || undefined, emergency: kind === 'announcement' && emergency, pinned,
        audience, units: unitList.length ? unitList : undefined, weighted: kind === 'poll' ? weighted : undefined,
        closes_at: kind === 'poll' && closeIso ? `${closeIso}T23:59:00+03:30` : undefined,
        expires_at: expIso ? `${expIso}T23:59:00+03:30` : undefined,
        questions: kind === 'poll' ? questions.map((q) => ({ text: q.text.trim(), multi: q.multi, options: q.options.filter((o) => o.trim()).map((label) => ({ label: label.trim() })) })) : undefined,
      })
      await onDone(r.recipients)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const byGroup = (g: string) => groups.filter((x) => x.group === g)
  return (
    <Drawer open={open} onClose={onClose} title={kind === 'poll' ? 'ساخت نظرسنجی' : 'اعلان جدید'}>
      <div className="flex flex-col gap-5">
        <Seg<'announcement' | 'poll'> options={[['announcement', 'اعلان'], ['poll', 'نظرسنجی']]} value={kind ?? 'announcement'} onChange={onKind} />

        <FieldCard>
          <Field label="عنوان" value={title} onChange={setTitle} placeholder={kind === 'poll' ? 'مثلاً انتخاب رنگ نمای ساختمان' : 'مثلاً قطعی برق — پنجشنبه'} />
          <TextAreaField label={kind === 'poll' ? 'توضیح (اختیاری)' : 'متن اعلان'} value={body} onChange={setBody} rows={4} maxLength={5000} />
          {kind === 'announcement' && <CheckRow checked={emergency} onChange={setEmergency}>اعلان فوری (قرمز و بالای فهرست)</CheckRow>}
          <CheckRow checked={pinned} onChange={setPinned}>سنجاق شود (همیشه بالای فهرست)</CheckRow>
          <DateField label="انقضا (اختیاری — بعد از آن از فید ساکنین حذف می‌شود)" value={expires} onChange={setExpires} />
        </FieldCard>

        {kind === 'poll' && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">سؤال‌ها و گزینه‌ها</p>
              <button className="hm-chip inline-flex items-center gap-1" onClick={() => setQuestions((q) => [...q, newQ()])}>
                <ListPlus size={14} /> افزودن سؤال
              </button>
            </div>
            {questions.map((q, qi) => (
              <div key={qi} className="hm-card p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="hm-avatar hm-tone-pri !w-8 !h-8 !text-xs">{fa(qi + 1)}</span>
                  <input className="hm-input flex-1" value={q.text} placeholder="متن سؤال" onChange={(e) => setQ(qi, { text: e.target.value })} />
                  {questions.length > 1 && (
                    <button className="hm-back !w-9 !h-9" aria-label="حذف سؤال" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== qi))}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2 ps-10">
                    <span className={`w-4 h-4 shrink-0 border ${q.multi ? 'rounded' : 'rounded-full'}`} style={{ borderColor: 'var(--hm-t3)' }} />
                    <input className="hm-input flex-1 !font-normal" value={o} placeholder={`گزینه ${fa(oi + 1)}`} onChange={(e) => setQ(qi, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })} />
                    {q.options.length > 2 && (
                      <button aria-label="حذف گزینه" onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi) })}>
                        <X size={15} className="text-[var(--hm-t3)]" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between ps-10 pt-1">
                  <button className="text-xs font-bold text-[var(--hm-pri)]" onClick={() => setQ(qi, { options: [...q.options, ''] })}>
                    + افزودن گزینه
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-[var(--hm-t2)] cursor-pointer">
                    <input type="checkbox" checked={q.multi} onChange={(e) => setQ(qi, { multi: e.target.checked })} className="accent-[var(--hm-pri)]" /> چندگزینه‌ای
                  </label>
                </div>
              </div>
            ))}
            <FieldCard>
              <DateField label="آخرین مهلت شرکت (اختیاری)" value={closes} onChange={setCloses} />
              <CheckRow checked={weighted} onChange={setWeighted}>وزن‌دهی رأی بر اساس متراژ واحد</CheckRow>
            </FieldCard>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <p className="text-sm font-bold">مخاطبان</p>
          {(['نقش', 'بخش'] as const).map((g) =>
            byGroup(g).length ? (
              <div key={g} className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-[var(--hm-t2)] w-14">{g === 'نقش' ? 'کاربران' : 'بخش‌ها'}</span>
                {byGroup(g).map((x) => (
                  <button key={x.key} className="hm-chip" data-on={audience.includes(x.key)} onClick={() => toggle(x.key)}>
                    {x.label}
                  </button>
                ))}
              </div>
            ) : null,
          )}
          <FieldCard>
            <Field label="واحدهای مشخص (اختیاری، با ویرگول جدا کنید)" value={units} onChange={setUnits} placeholder="مثلاً ۱۲۰۴، ۱۱۰۲" />
          </FieldCard>
        </section>

        {err && <p className="text-xs text-[var(--hm-bad)]">{err}</p>}
        <Cta busy={busy} onClick={publish}>
          انتشار و ارسال اعلان
        </Cta>
      </div>
    </Drawer>
  )
}
