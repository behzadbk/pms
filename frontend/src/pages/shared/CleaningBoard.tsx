import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, Home, Plus, Search, Sparkles, Star, UserRound, Users, Wrench, X } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { GlassSheet, GlassToast } from '../../components/ui/Glass'
import { ErrorBlock, Loading } from '../../components/hm'
import { StarsView } from '../../components/CleaningRating'
import { CleaningReviews } from './CleaningReviews'
import {
  cleaningTasksApi,
  kindLabel,
  slotLabel,
  statusLabel,
  type CleaningBoard as Board,
  type CleaningTask,
  type CleaningUnit,
  type TaskKind,
  type TaskSlot,
  type TeamMember,
} from '../../lib/api/cleaning'
import { errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { addDays, tehranParts, tehranToday } from '../../lib/tehran'

/**
 * تابلوی نظافت — پنل نظارت و تقسیم کارِ «مسئول نظافت» (و مدیر).
 * درخواست‌های نظافت منزل ساکنان اینجا می‌آید؛ مسئول با یک لمس به یکی از کادر واگذار می‌کند.
 * خودش هم کار می‌چیند: نظافت منزل (واحد)، نظافت مشاعات برج، کار موردی.
 */

type Tab = 'board' | 'team' | 'reviews'

const inputCls = 'w-full rounded-2xl border border-line px-4 py-3 text-base bg-card min-h-[52px] focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile'
const bigBtn = 'w-full min-h-[56px] rounded-2xl text-base font-bold flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.99] transition'
const chip = (on: boolean) => `min-h-[44px] px-4 rounded-full border text-sm font-medium transition ${on ? 'border-tile bg-tile/10 text-tile font-bold' : 'border-line bg-card'}`

const COMMON_AREAS = ['لابی', 'راهرو طبقات', 'پارکینگ', 'آسانسورها', 'راه‌پله‌ها', 'پشت‌بام', 'سالن ورزش', 'استخر و سونا']

const whenText = (t: CleaningTask) =>
  [
    t.want_date ? (t.want_date === tehranToday() ? 'امروز' : t.want_date === addDays(tehranToday(), 1) ? 'فردا' : formatJalali(t.want_date, false)) : null,
    t.want_slot !== 'any' ? slotLabel[t.want_slot] : null,
  ].filter(Boolean).join(' · ')

const clock = (iso: string) => {
  const p = tehranParts(iso)
  return fa(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`)
}

function ErrBox({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-bad bg-bad-soft rounded-2xl px-4 py-3 leading-7" role="alert">
      <AlertTriangle size={18} className="shrink-0 mt-1" />
      <span>{children}</span>
    </p>
  )
}

const kindIcon = { unit: Home, common: Building2, custom: Wrench } as const

/* ───────────── انتخاب کادر (یک لمس) ───────────── */

function TeamChips({ team, selected, onPick, disabled }: { team: TeamMember[]; selected?: string | null; onPick: (id: string) => void; disabled?: boolean }) {
  if (team.length === 0) return <p className="text-xs text-warn">هنوز کسی در دپارتمان نظافت ثبت نشده؛ از «کارکنان» اضافه کنید.</p>
  return (
    <div className="flex flex-wrap gap-2">
      {team.map((m) => (
        <button key={m.id} type="button" disabled={disabled} onClick={() => onPick(m.id)} aria-pressed={selected === m.id} className={chip(selected === m.id)}>
          {m.full_name}
          <span className="text-[11px] text-muted font-normal mr-1.5">{m.open_count > 0 ? `${fa(m.open_count)} کار` : 'آزاد'}</span>
        </button>
      ))}
    </div>
  )
}

/* ───────────── کارت یک کار ───────────── */

function TaskRow({ t, team, canAct, onAssign, onCancel, busy }: {
  t: CleaningTask
  team: TeamMember[]
  canAct: boolean
  onAssign: (t: CleaningTask, assigneeId: string) => void
  onCancel: (t: CleaningTask) => void
  busy: boolean
}) {
  const Icon = kindIcon[t.kind]
  const [reassign, setReassign] = useState(false)
  const when = whenText(t)
  const tone = t.status === 'new' ? 'bg-warn-soft text-warn' : t.status === 'in_progress' ? 'bg-good-soft text-good' : t.status === 'done' ? 'bg-good-soft text-good' : t.status === 'cancelled' ? 'bg-canvas text-muted' : 'bg-tile/10 text-tile'
  return (
    <Card className={t.status === 'cancelled' ? 'opacity-60' : ''}>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-tile/15 text-tile flex items-center justify-center shrink-0"><Icon size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-6">{t.kind === 'unit' ? `${kindLabel.unit} — واحد ${fa(t.unit_number ?? '')}` : t.title}</p>
            <p className="text-xs text-muted mt-0.5">
              {t.source === 'resident' ? 'درخواست ساکن' : kindLabel[t.kind]}
              {when ? ` · ${when}` : ''}
              {t.assignee_name ? ` · ${t.assignee_name}` : ''}
              {t.status === 'in_progress' && t.started_at ? ` · از ${clock(t.started_at)}` : ''}
              {t.status === 'done' && t.done_at ? ` · ${clock(t.done_at)}` : ''}
            </p>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${tone}`}>{statusLabel[t.status]}</span>
        </div>
        {t.details && <p className="text-sm bg-black/5 rounded-2xl px-3.5 py-2.5 leading-7">{t.details}</p>}
        {t.done_note && <p className="text-xs text-muted">یادداشت نظافتچی: {t.done_note}</p>}

        {canAct && t.status === 'new' && (
          <div className="space-y-2">
            <p className="text-xs text-muted">برای واگذاری، یک نفر را انتخاب کنید:</p>
            <TeamChips team={team} disabled={busy} onPick={(id) => onAssign(t, id)} />
          </div>
        )}
        {canAct && t.status === 'assigned' && reassign && (
          <div className="space-y-2">
            <p className="text-xs text-muted">واگذاری به:</p>
            <TeamChips team={team} selected={t.assignee_id} disabled={busy} onPick={(id) => { setReassign(false); if (id !== t.assignee_id) onAssign(t, id) }} />
          </div>
        )}
        {canAct && (t.status === 'new' || t.status === 'assigned') && (
          <div className="flex gap-2">
            {t.status === 'assigned' && !reassign && (
              <button onClick={() => setReassign(true)} className="min-h-[44px] px-4 rounded-xl border border-line text-sm font-medium">تغییر نفر</button>
            )}
            <button onClick={() => onCancel(t)} disabled={busy} className="min-h-[44px] px-4 rounded-xl border border-line text-sm text-bad font-medium">لغو کار</button>
          </div>
        )}
      </div>
    </Card>
  )
}

/* ───────────── کار جدید ───────────── */

function NewTaskSheet({ open, team, onClose, onCreated }: { open: boolean; team: TeamMember[]; onClose: () => void; onCreated: (t: CleaningTask) => void }) {
  const [kind, setKind] = useState<TaskKind>('unit')
  const [q, setQ] = useState('')
  const [units, setUnits] = useState<CleaningUnit[]>([])
  const [unit, setUnit] = useState<CleaningUnit | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [day, setDay] = useState<0 | 1 | 2 | null>(0)
  const [slot, setSlot] = useState<TaskSlot>('any')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setKind('unit'); setQ(''); setUnits([]); setUnit(null); setTitle(''); setDetails(''); setDay(0); setSlot('any'); setAssignee(null); setErr('')
  }, [open])

  useEffect(() => {
    if (kind !== 'unit' || unit || !q.trim()) { setUnits([]); return }
    let alive = true
    const t = window.setTimeout(() => {
      cleaningTasksApi.units(q.trim()).then((r) => alive && setUnits(r)).catch(() => alive && setUnits([]))
    }, 250)
    return () => { alive = false; window.clearTimeout(t) }
  }, [q, kind, unit])

  const ready = kind === 'unit' ? !!unit : title.trim().length >= 2

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setErr('')
    try {
      const t = await cleaningTasksApi.create({
        kind,
        unitId: kind === 'unit' ? unit!.id : undefined,
        title: kind === 'unit' ? undefined : title.trim(),
        details: details.trim() || undefined,
        wantDate: day === null ? undefined : addDays(tehranToday(), day),
        wantSlot: slot,
        assigneeId: assignee ?? undefined,
      })
      onCreated(t)
    } catch (e) {
      setErr(errText(e, 'ثبت کار ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassSheet open={open} onClose={onClose} title="کار جدید">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/5" role="group" aria-label="نوع کار">
          {(['unit', 'common', 'custom'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`min-h-[46px] rounded-xl text-sm ${kind === k ? 'bg-card shadow font-bold' : 'text-muted font-medium'}`}>
              {k === 'unit' ? 'منزل' : k === 'common' ? 'مشاعات' : 'موردی'}
            </button>
          ))}
        </div>

        {kind === 'unit' ? (
          unit ? (
            <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
              <div>
                <p className="text-xs text-muted">واحد</p>
                <p className="text-2xl font-extrabold">{fa(unit.unit_number)}</p>
              </div>
              <button type="button" onClick={() => { setUnit(null); setQ('') }} className="text-sm text-tile font-medium px-3 py-2">تغییر</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="relative">
                <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="شماره‌ی واحد، مثلاً ۱۲۰۱" aria-label="شماره‌ی واحد" maxLength={10} className={`${inputCls} pr-12 text-lg`} />
              </div>
              {units.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {units.map((u) => (
                    <button key={u.id} type="button" onClick={() => setUnit(u)} className="min-h-[56px] rounded-2xl border border-line bg-card px-3 py-2 text-right active:scale-[0.98]">
                      <span className="block text-lg font-extrabold">{fa(u.unit_number)}</span>
                      <span className="block text-[11px] text-muted">{u.floor !== null ? `طبقه‌ی ${fa(u.floor)}` : ' '}</span>
                    </button>
                  ))}
                </div>
              )}
              {q.trim() && units.length === 0 && <p className="text-sm text-muted text-center py-2">واحدی با این شماره پیدا نشد</p>}
            </div>
          )
        ) : (
          <div className="space-y-2.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === 'common' ? 'محل نظافت، مثلاً لابی' : 'عنوان کار، مثلاً شست‌وشوی شیشه‌ها'} aria-label="عنوان" className={inputCls} />
            {kind === 'common' && (
              <div className="flex flex-wrap gap-2">
                {COMMON_AREAS.map((a) => <button key={a} type="button" onClick={() => setTitle(a)} className={chip(title === a)}>{a}</button>)}
              </div>
            )}
          </div>
        )}

        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={2} placeholder="توضیح برای نظافتچی (اختیاری)" className={`${inputCls} resize-none`} />

        <div className="space-y-2">
          <p className="text-sm text-muted">چه روزی؟</p>
          <div className="flex flex-wrap gap-2">
            {([[0, 'امروز'], [1, 'فردا'], [2, 'پس‌فردا']] as const).map(([d, l]) => <button key={d} type="button" onClick={() => setDay(day === d ? null : d)} className={chip(day === d)}>{l}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(slotLabel) as TaskSlot[]).map((s) => <button key={s} type="button" onClick={() => setSlot(s)} className={chip(slot === s)}>{slotLabel[s]}</button>)}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted">واگذاری (اختیاری — می‌توانید بعداً از تابلو بسپارید)</p>
          <TeamChips team={team} selected={assignee} onPick={(id) => setAssignee(assignee === id ? null : id)} />
        </div>

        {err && <ErrBox>{err}</ErrBox>}
        <button onClick={submit} disabled={!ready || busy} className={`${bigBtn} bg-tile text-white`}>
          <CheckCircle2 size={22} />
          {busy ? 'در حال ثبت…' : assignee ? 'ثبت و واگذاری' : 'ثبت کار'}
        </button>
      </div>
    </GlassSheet>
  )
}

/* ───────────── تب کادر ───────────── */

function TeamTab({ team }: { team: TeamMember[] }) {
  if (team.length === 0) {
    return <Card><p className="p-10 text-center text-sm text-muted">کسی در دپارتمان نظافت ثبت نشده؛ مدیر از بخش «کارکنان» اضافه می‌کند.</p></Card>
  }
  return (
    <div className="space-y-2.5">
      {team.map((m) => (
        <Card key={m.id}>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-tile-soft text-tile flex items-center justify-center shrink-0"><UserRound size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">{m.full_name}{m.is_dept_head && <span className="text-[11px] mr-2 px-2 py-0.5 rounded-full bg-brass-soft text-brass">مسئول</span>}</p>
              <p className="text-xs text-muted mt-0.5">
                {m.running ? 'همین حالا مشغول کار است' : m.open_count > 0 ? `${fa(m.open_count)} کار در انتظار` : 'آزاد'}
                {` · امروز ${fa(m.done_today)} کار انجام داده`}
              </p>
            </div>
            {m.rating && (
              <div className="text-left shrink-0">
                <p className="text-lg font-extrabold">{fa(m.rating.average.toFixed(1).replace(/\.0$/, '')).replace('.', '٫')}</p>
                <StarsView value={m.rating.average} size={12} />
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ───────────── صفحه ───────────── */

export function CleaningBoard() {
  const [params, setParams] = useSearchParams()
  const tab = (['board', 'team', 'reviews'].includes(params.get('tab') ?? '') ? params.get('tab') : 'board') as Tab
  const [data, setData] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actErr, setActErr] = useState('')
  const [cancelT, setCancelT] = useState<CleaningTask | null>(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    try { setData(await cleaningTasksApi.board()); setError(null) } catch (e) { setError(errText(e, 'بارگذاری تابلو ممکن نشد')) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    return () => window.clearInterval(t)
  }, [load])

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3000) }
  const setTab = (t: Tab) => setParams(t === 'board' ? {} : { tab: t }, { replace: true })

  async function assign(t: CleaningTask, assigneeId: string) {
    if (busyId) return
    setBusyId(t.id)
    setActErr('')
    try {
      const r = await cleaningTasksApi.assign(t.id, { assigneeId })
      flash(`به ${r.assignee_name ?? 'نظافتچی'} سپرده شد`)
      await load()
    } catch (e) {
      setActErr(errText(e, 'واگذاری ممکن نشد'))
    } finally {
      setBusyId(null)
    }
  }
  async function doCancel() {
    if (!cancelT) return
    setBusyId(cancelT.id)
    try {
      await cleaningTasksApi.cancel(cancelT.id)
      setCancelT(null)
      flash('کار لغو شد')
      await load()
    } catch (e) {
      setActErr(errText(e, 'لغو ممکن نشد'))
      setCancelT(null)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !data) return <ErrorBlock message={error} retry={load} />
  if (!data) return <Loading />

  const waiting = data.tasks.filter((t) => t.status === 'new')
  const active = data.tasks.filter((t) => t.status === 'assigned' || t.status === 'in_progress')
    .sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'))
  const finished = data.tasks.filter((t) => t.status === 'done' || t.status === 'cancelled')

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-tile/15 text-tile flex items-center justify-center"><ClipboardList size={22} /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold">تابلوی نظافت</h1>
          <p className="text-xs text-muted">درخواست‌ها را بچینید و به کادر نظافت بسپارید</p>
        </div>
        <button onClick={() => setNewOpen(true)} className="min-h-[46px] px-4 rounded-2xl bg-tile text-white text-sm font-bold flex items-center gap-1.5">
          <Plus size={18} /> کار جدید
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/5" role="tablist">
        {([['board', 'تابلو', Sparkles], ['team', 'کادر', Users], ['reviews', 'بازخورد', Star]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-[46px] rounded-xl text-sm flex items-center justify-center gap-1.5 relative ${tab === id ? 'bg-card shadow font-bold' : 'text-muted font-medium'}`}>
            <Icon size={16} />
            {label}
            {id === 'board' && waiting.length > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-warn text-white text-[11px] font-bold flex items-center justify-center">{fa(waiting.length)}</span>}
          </button>
        ))}
      </div>

      {actErr && <ErrBox>{actErr}</ErrBox>}

      {tab === 'board' && (
        <>
          {waiting.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold">منتظر واگذاری ({fa(waiting.length)})</h2>
              {waiting.map((t) => <TaskRow key={t.id} t={t} team={data.team} canAct busy={busyId === t.id} onAssign={assign} onCancel={setCancelT} />)}
            </section>
          )}
          <section className="space-y-2.5">
            <h2 className="text-sm font-bold">در برنامه ({fa(active.length)})</h2>
            {active.length === 0 ? (
              <Card><p className="p-8 text-center text-sm text-muted">{waiting.length > 0 ? 'کاری هنوز واگذار نشده' : 'کاری در برنامه نیست؛ با «کار جدید» بچینید'}</p></Card>
            ) : (
              active.map((t) => <TaskRow key={t.id} t={t} team={data.team} canAct busy={busyId === t.id} onAssign={assign} onCancel={setCancelT} />)
            )}
          </section>
          {finished.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold text-muted">۳ روز اخیر</h2>
              {finished.map((t) => <TaskRow key={t.id} t={t} team={data.team} canAct={false} busy={false} onAssign={assign} onCancel={setCancelT} />)}
            </section>
          )}
        </>
      )}

      {tab === 'team' && <TeamTab team={data.team} />}
      {tab === 'reviews' && <CleaningReviews embedded />}

      <NewTaskSheet open={newOpen} team={data.team} onClose={() => setNewOpen(false)} onCreated={(t) => { setNewOpen(false); flash(t.assignee_name ? `کار به ${t.assignee_name} سپرده شد` : 'کار در صف واگذاری ثبت شد'); void load() }} />
      <GlassSheet open={!!cancelT} onClose={() => setCancelT(null)} title="لغو کار">
        <div className="space-y-4">
          <p className="text-sm leading-7">«{cancelT?.title}» لغو می‌شود{cancelT?.assignee_name ? ` و ${cancelT.assignee_name} خبردار می‌شود` : ''}. مطمئن هستید؟</p>
          <button onClick={doCancel} disabled={!!busyId} className={`${bigBtn} bg-bad text-white`}><X size={20} /> بله، لغو شود</button>
          <button onClick={() => setCancelT(null)} className="w-full min-h-[48px] rounded-2xl border border-line text-sm font-medium">انصراف</button>
        </div>
      </GlassSheet>
      <GlassToast message={toast} />
    </div>
  )
}
