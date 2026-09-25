import { useState, type ReactNode } from 'react'
import { Megaphone, Plus, Trash2, Vote, Users, X, ListPlus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Modal, TextField, TextArea, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import {
  useStore,
  publishAnnouncement,
  deleteAnnouncement,
  audienceGroups,
  audienceLabel,
  faDateTime,
  uid,
  type AnnouncementRec,
  type PollQuestion,
} from '../../lib/store'

export function AdminAnnouncements() {
  const { announcements } = useStore()
  const [composer, setComposer] = useState<'announcement' | 'poll' | null>(null)
  const [tab, setTab] = useState<'all' | 'announcement' | 'poll'>('all')

  const list = tab === 'all' ? announcements : announcements.filter((a) => a.kind === tab)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">اعلانات و رأی‌گیری</h1>
          <p className="text-muted text-sm mt-1">تابلوی اعلانات دیجیتال و نظرسنجی‌های ساختمان — پس از انتشار برای مخاطبان داخل برنامه اعلان می‌رود</p>
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={() => setComposer('poll')}>
            <Vote size={16} />
            نظرسنجی جدید
          </GhostButton>
          <PrimaryButton onClick={() => setComposer('announcement')}>
            <Plus size={16} />
            اعلان جدید
          </PrimaryButton>
        </div>
      </div>

      <div className="flex gap-2">
        {([
          ['all', 'همه'],
          ['announcement', 'اعلان‌ها'],
          ['poll', 'نظرسنجی‌ها'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${tab === id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {list.length === 0 && (
          <Card className="lg:col-span-2">
            <p className="p-10 text-center text-sm text-muted">موردی منتشر نشده است</p>
          </Card>
        )}
        {list.map((a) => (
          <AnnouncementCard key={a.id} a={a} onDelete={() => deleteAnnouncement(a.id)} showResults />
        ))}
      </div>

      {composer && <Composer kind={composer} onClose={() => setComposer(null)} onKindChange={setComposer} />}
    </div>
  )
}

export function AnnouncementCard({
  a,
  onDelete,
  showResults,
  children,
}: {
  a: AnnouncementRec
  onDelete?: () => void
  showResults?: boolean
  children?: ReactNode
}) {
  const totalVoters = a.questions[0]?.options.reduce((s, o) => s + o.votes, 0) ?? 0
  return (
    <Card className={a.emergency ? 'border-bad/40' : ''}>
      <CardHeader
        title={a.title}
        action={
          <div className="flex items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${a.kind === 'poll' ? 'bg-tile-soft text-tile' : a.emergency ? 'bg-bad-soft text-bad' : 'bg-canvas text-muted'}`}>
              {a.kind === 'poll' ? 'نظرسنجی' : a.emergency ? 'فوری' : 'اعلان'}
            </span>
            {onDelete && (
              <button onClick={onDelete} className="p-1.5 rounded-lg text-muted hover:text-bad hover:bg-bad-soft" aria-label="حذف">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        }
      />
      <div className="px-5 pb-5 space-y-3">
        {a.body && (
          <p className={`text-sm ${a.emergency ? 'text-bad' : 'text-muted'} flex gap-2`}>
            {a.emergency && <Megaphone size={15} className="shrink-0 mt-0.5" />}
            {a.body}
          </p>
        )}

        {a.kind === 'poll' && showResults && (
          <div className="space-y-4">
            {a.questions.map((q, qi) => {
              const total = q.options.reduce((s, o) => s + o.votes, 0)
              return (
                <div key={q.id}>
                  <p className="text-sm font-medium mb-2">
                    {a.questions.length > 1 && `${(qi + 1).toLocaleString('fa-IR')}. `}
                    {q.text}
                    {q.multi && <span className="text-xs text-muted font-normal"> (چندگزینه‌ای)</span>}
                  </p>
                  <div className="space-y-2">
                    {q.options.map((o) => {
                      const pct = total ? Math.round((o.votes / total) * 100) : 0
                      return (
                        <div key={o.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span>{o.label}</span>
                            <span className="text-muted">
                              {o.votes.toLocaleString('fa-IR')} رأی · {pct.toLocaleString('fa-IR')}٪
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-canvas overflow-hidden">
                            <div className="h-full bg-tile rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-muted">
              {totalVoters.toLocaleString('fa-IR')} شرکت‌کننده
              {a.weighted && ' · وزن‌دهی رأی بر اساس متراژ واحد'}
              {a.closesAt && ` · پایان: ${faDateTime(a.closesAt)}`}
            </p>
          </div>
        )}

        {children}

        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted pt-1">
          <Users size={12} />
          {a.audience.map((k) => (
            <span key={k} className="bg-canvas px-2 py-0.5 rounded-full">{audienceLabel(k)}</span>
          ))}
          <span className="mr-auto">{faDateTime(a.createdAt)}</span>
        </div>
      </div>
    </Card>
  )
}

function newQuestion(): PollQuestion {
  return {
    id: uid('q'),
    text: '',
    multi: false,
    options: [
      { id: uid('o'), label: '', votes: 0 },
      { id: uid('o'), label: '', votes: 0 },
    ],
  }
}

function Composer({
  kind,
  onClose,
  onKindChange,
}: {
  kind: 'announcement' | 'poll'
  onClose: () => void
  onKindChange: (k: 'announcement' | 'poll') => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [audience, setAudience] = useState<string[]>(['all_residents'])
  const [units, setUnits] = useState('')
  const [questions, setQuestions] = useState<PollQuestion[]>([newQuestion()])
  const [closesAt, setClosesAt] = useState('')
  const [weighted, setWeighted] = useState(false)

  const toggleAudience = (k: string) => setAudience((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))
  const setQ = (id: string, p: Partial<PollQuestion>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...p } : q)))

  const unitKeys = units
    .split(/[,،\s]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => `unit:واحد ${u.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}`)
  const fullAudience = [...audience, ...unitKeys]

  const pollValid =
    kind !== 'poll' ||
    (questions.length > 0 && questions.every((q) => q.text.trim() && q.options.filter((o) => o.label.trim()).length >= 2))
  const valid = title.trim() && fullAudience.length > 0 && (kind === 'poll' || body.trim()) && pollValid

  function publish() {
    if (!valid) return
    publishAnnouncement({
      kind,
      title: title.trim(),
      body: body.trim(),
      emergency: kind === 'announcement' && emergency,
      audience: fullAudience,
      closesAt: kind === 'poll' && closesAt ? new Date(closesAt).toISOString() : undefined,
      weighted: kind === 'poll' ? weighted : undefined,
      questions:
        kind === 'poll'
          ? questions.map((q) => ({ ...q, text: q.text.trim(), options: q.options.filter((o) => o.label.trim()).map((o) => ({ ...o, label: o.label.trim() })) }))
          : [],
    })
    onClose()
  }

  return (
    <Modal
      open
      size="xl"
      title={kind === 'poll' ? 'ساخت نظرسنجی' : 'اعلان جدید'}
      onClose={onClose}
      footer={
        <>
          <p className="text-xs text-muted ml-auto self-center">
            پس از انتشار برای {fullAudience.map(audienceLabel).join('، ') || '—'} اعلان داخل برنامه ارسال می‌شود
          </p>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={!valid} onClick={publish}>
            انتشار و ارسال اعلان
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex gap-1.5 bg-canvas rounded-xl p-1 w-fit">
          {([
            ['announcement', 'اعلان'],
            ['poll', 'نظرسنجی'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => onKindChange(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${kind === k ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="space-y-4">
          <TextField label="عنوان" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'poll' ? 'مثلاً انتخاب رنگ نمای ساختمان' : 'مثلاً قطعی برق — پنجشنبه'} autoFocus />
          <TextArea label={kind === 'poll' ? 'توضیح (اختیاری)' : 'متن اعلان'} value={body} onChange={(e) => setBody(e.target.value)} />
          {kind === 'announcement' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
              <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} className="w-4 h-4 accent-[var(--color-bad)]" />
              اعلان فوری (با رنگ قرمز و بالای لیست نمایش داده می‌شود)
            </label>
          )}
        </section>

        {kind === 'poll' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">سؤال‌ها و گزینه‌ها</p>
              <button onClick={() => setQuestions((q) => [...q, newQuestion()])} className="flex items-center gap-1.5 text-xs font-medium text-tile hover:underline">
                <ListPlus size={14} /> افزودن سؤال
              </button>
            </div>
            {questions.map((q, qi) => (
              <div key={q.id} className="rounded-xl border border-line p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-tile-soft text-tile text-xs font-bold flex items-center justify-center mt-6">
                    {(qi + 1).toLocaleString('fa-IR')}
                  </span>
                  <TextField className="flex-1" label="متن سؤال" value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} />
                  {questions.length > 1 && (
                    <button onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))} className="p-2.5 mt-6 rounded-xl text-bad hover:bg-bad-soft" aria-label="حذف سؤال">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="space-y-2 pr-9">
                  {q.options.map((o, oi) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <span className={`w-4 h-4 shrink-0 border border-line ${q.multi ? 'rounded' : 'rounded-full'}`} />
                      <input
                        value={o.label}
                        onChange={(e) => setQ(q.id, { options: q.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
                        placeholder={`گزینه ${(oi + 1).toLocaleString('fa-IR')}`}
                        className="flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tile/40"
                      />
                      {q.options.length > 2 && (
                        <button onClick={() => setQ(q.id, { options: q.options.filter((x) => x.id !== o.id) })} className="p-1.5 text-muted hover:text-bad" aria-label="حذف گزینه">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={() => setQ(q.id, { options: [...q.options, { id: uid('o'), label: '', votes: 0 }] })} className="text-xs font-medium text-tile hover:underline flex items-center gap-1">
                      <Plus size={13} /> افزودن گزینه
                    </button>
                    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="checkbox" checked={q.multi} onChange={(e) => setQ(q.id, { multi: e.target.checked })} className="accent-[var(--color-tile)]" />
                      امکان انتخاب چند گزینه
                    </label>
                  </div>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="مهلت شرکت (اختیاری)" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              <label className="flex items-center gap-2 text-sm cursor-pointer sm:mt-6">
                <input type="checkbox" checked={weighted} onChange={(e) => setWeighted(e.target.checked)} className="w-4 h-4 accent-[var(--color-tile)]" />
                وزن‌دهی رأی بر اساس متراژ واحد
              </label>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <p className="text-sm font-medium">مخاطبان</p>
          {(['نقش', 'بخش'] as const).map((g) => (
            <div key={g} className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted w-12">{g === 'نقش' ? 'کاربران' : 'بخش‌ها'}</span>
              {audienceGroups
                .filter((a) => a.group === g)
                .map((a) => (
                  <button
                    key={a.key}
                    onClick={() => toggleAudience(a.key)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      audience.includes(a.key) ? 'bg-tile text-white border-tile' : 'border-line text-muted hover:border-ink-soft'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
            </div>
          ))}
          <TextField label="واحدهای مشخص (اختیاری)" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="مثلاً ۴، ۷، ۱۲" hint="شماره واحدها را با کاما جدا کنید" />
          {fullAudience.length === 0 && <p className="text-xs text-bad">حداقل یک مخاطب انتخاب کنید.</p>}
        </section>
      </div>
    </Modal>
  )
}
