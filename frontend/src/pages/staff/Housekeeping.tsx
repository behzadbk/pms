import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Ban, Building2, CheckCircle2, Clock, History, ListTodo, PencilLine, Play, Sparkles, Square, Undo2, Wrench } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { GlassSheet, GlassToast } from '../../components/ui/Glass'
import {
  cleaningApi,
  cleaningTasksApi,
  kindLabel,
  slotLabel,
  type CleaningCommit,
  type CleaningHome,
  type CleaningOutcome,
  type CleaningSession,
  type CleaningTask,
  type CleaningUnitInfo,
} from '../../lib/api/cleaning'
import { errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { addDays, tehranParts, tehranToday } from '../../lib/tehran'
import { money, qty, qtyUnit, usedPct } from '../../lib/entitlementsFmt'

/**
 * «کارهای نظافت من» — کارمندِ دپارتمان نظافت (یا مدیر).
 * مسئول نظافت کارها را می‌چیند و به او می‌سپارد؛ اینجا فقط همان کارها هست: ۱) «شروع» ۲) «پایان».
 * در نظافت منزل، مدت از سهمیه‌ی ساعتِ همان واحد کم می‌شود و مازاد (با نرخ شیفت) خودکار به شارژ ماه بعد می‌رود؛
 * هر جا ساعت را فراموش کرد «ثبت دستی» هست. نظافت مشاعات و کارهای موردی فقط زمان کار را ثبت می‌کنند.
 */

type Tab = 'work' | 'history'

const SLOT_ICON_TEXT = (t: CleaningTask) => [t.want_date ? (t.want_date === tehranToday() ? 'امروز' : t.want_date === addDays(tehranToday(), 1) ? 'فردا' : formatJalali(t.want_date, false)) : null, t.want_slot !== 'any' ? slotLabel[t.want_slot] : null].filter(Boolean).join(' · ')

const inputCls = 'w-full rounded-2xl border border-line px-4 py-3 text-base bg-card min-h-[52px] focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile'
const bigBtn = 'w-full min-h-[60px] rounded-2xl text-base font-bold flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.99] transition'

/* ───────────── ابزار زمان ───────────── */

const clock = (iso: string | Date) => {
  const p = tehranParts(iso)
  return fa(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`)
}
const dayWord = (iso: string) => {
  const d = tehranParts(iso).date
  const t = tehranToday()
  if (d === t) return 'امروز'
  if (d === addDays(t, -1)) return 'دیروز'
  return formatJalali(d, false)
}
const isoAt = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+03:30`).toISOString()
const validTime = (v: string) => /^\d{2}:\d{2}$/.test(v)
const durLabel = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${fa(r)} دقیقه`
  if (r === 0) return `${fa(h)} ساعت`
  return `${fa(h)} ساعت و ${fa(r)} دقیقه`
}
const stopwatch = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return fa(`${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`)
}
/** ساعت پایانِ واقعی که نظافتچی تایپ کرده؛ اگر امروز در آینده می‌افتد یعنی دیروز بوده */
function endIsoFromClock(hhmm: string): string {
  const today = tehranToday()
  const t = isoAt(today, hhmm)
  return new Date(t).getTime() > Date.now() + 2 * 60_000 ? isoAt(addDays(today, -1), hhmm) : t
}

/* ───────────── اجزای مشترک ───────────── */

function QuotaBar({ info }: { info: CleaningUnitInfo }) {
  const line = info.line
  if (!line) return null
  if (line.included === null) {
    return (
      <p className="text-sm text-warn bg-warn-soft rounded-2xl px-4 py-3 leading-7">
        متراژ این واحد ثبت نشده؛ سهمیه‌ی رایگان مشخص نیست و تمام زمان نظافت مازاد حساب می‌شود. به مدیر اطلاع دهید.
      </p>
    )
  }
  const pct = usedPct(line)
  const over = line.overage_qty > 0
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-muted">سهمیه‌ی رایگان {line.window_label}</p>
        <p className="text-sm font-bold">
          {qtyUnit(Math.max(0, line.remaining ?? 0), line.unit_label)} <span className="font-normal text-muted">باقی‌مانده از {qty(line.included)}</span>
        </p>
      </div>
      <div className="h-3 rounded-full bg-black/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${over ? 'bg-warn' : 'bg-tile'}`} style={{ width: `${pct}%` }} />
      </div>
      {over && <p className="text-xs text-warn">سهمیه‌ی این ماه تمام شده؛ نظافت جدید مازاد حساب می‌شود</p>}
    </div>
  )
}

/** «با این نظافت چه می‌شود»: مدت، سهم سهمیه، مازاد و مبلغ — با زبان ساده */
function OutcomeBox({ o, done = false }: { o: CleaningOutcome; done?: boolean }) {
  return (
    <div className="rounded-2xl bg-[var(--lg-bg-base)] p-4 space-y-3 text-sm" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">مدت نظافت</span>
        <span className="font-bold text-base">{o.duration_label}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">نرخ</span>
        <span>{o.shift_label}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">{done ? 'از سهمیه‌ی رایگان کم شد' : 'از سهمیه‌ی رایگان کم می‌شود'}</span>
        <span className="font-bold text-good">{qtyUnit(o.free_qty, o.unit_label)}</span>
      </div>
      {o.overage_qty > 0 ? (
        <div className="rounded-xl bg-warn-soft text-warn px-3.5 py-3 leading-7">
          <p className="font-bold">
            مازاد: {qtyUnit(o.overage_qty, o.unit_label)} — {money(o.amount)}
          </p>
          <p className="text-xs mt-0.5">این مبلغ {done ? 'به' : 'به‌صورت خودکار به'} شارژ ماه بعد واحد اضافه {done ? 'شد' : 'می‌شود'}</p>
        </div>
      ) : (
        <p className="rounded-xl bg-good-soft text-good px-3.5 py-3 font-medium">کاملاً داخل سهمیه است؛ هزینه‌ای ندارد</p>
      )}
      {o.no_tier ? (
        <p className="text-xs text-warn">متراژ واحد ثبت نشده؛ سهمیه‌ای برایش محاسبه نمی‌شود.</p>
      ) : (
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>باقی‌مانده‌ی سهمیه بعد از این نظافت</span>
          <span className="font-semibold text-ink-text">{qtyUnit(o.remaining_after, o.unit_label)}</span>
        </div>
      )}
    </div>
  )
}

function ErrBox({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-bad bg-bad-soft rounded-2xl px-4 py-3 leading-7" role="alert">
      <AlertTriangle size={18} className="shrink-0 mt-1" />
      <span>{children}</span>
    </p>
  )
}

/* ───────────── ۱) کارهای واگذارشده و شروع ───────────── */

function TaskCard({ task, unitLabel, busyId, onStart, onManual }: {
  task: CleaningTask
  unitLabel: string
  busyId: string | null
  onStart: (t: CleaningTask) => void
  onManual: (t: CleaningTask, info: CleaningUnitInfo) => void
}) {
  const isUnit = task.kind === 'unit'
  const [info, setInfo] = useState<CleaningUnitInfo | null>(null)
  const [err, setErr] = useState('')
  const done = task.status === 'done'

  useEffect(() => {
    if (!isUnit || done || !task.unit_id) return
    let alive = true
    cleaningApi.unit(task.unit_id).then((r) => alive && setInfo(r)).catch((e) => alive && setErr(errText(e, 'اطلاعات واحد بارگذاری نشد')))
    return () => { alive = false }
  }, [isUnit, done, task.unit_id])

  const when = SLOT_ICON_TEXT(task)
  const Icon = isUnit ? Sparkles : task.kind === 'common' ? Building2 : Wrench
  return (
    <Card className={done ? 'opacity-70' : ''}>
      <div className="p-4 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-tile/15 text-tile flex items-center justify-center shrink-0"><Icon size={21} /></div>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-6">{isUnit ? `واحد ${fa(task.unit_number ?? '')}` : task.title}</p>
            <p className="text-xs text-muted mt-0.5">
              {kindLabel[task.kind]}{isUnit && task.floor !== null ? ` · طبقه‌ی ${fa(task.floor)}` : ''}{when ? ` · ${when}` : ''}
            </p>
          </div>
          {done && <span className="text-[11px] px-2 py-0.5 rounded-full bg-good-soft text-good shrink-0">انجام شد</span>}
        </div>
        {task.details && <p className="text-sm bg-black/5 rounded-2xl px-3.5 py-2.5 leading-7">{task.details}</p>}
        {task.source === 'resident' && !done && <p className="text-xs text-muted">درخواست ساکن</p>}

        {isUnit && !done && (info ? <QuotaBar info={info} /> : !err && <div className="h-12 rounded-2xl bg-black/5 animate-pulse" />)}
        {err && <ErrBox>{err}</ErrBox>}

        {!done && (
          <>
            <button onClick={() => onStart(task)} disabled={busyId === task.id} className={`${bigBtn} bg-good text-white`}>
              <Play size={22} />
              {busyId === task.id ? 'در حال شروع…' : 'شروع'}
            </button>
            {isUnit && (
              <button
                onClick={() => info && onManual(task, info)}
                disabled={!info}
                className="w-full min-h-[46px] rounded-2xl text-sm font-medium border border-line flex items-center justify-center gap-2 text-ink-text disabled:opacity-50"
              >
                <PencilLine size={18} />
                ساعت شروع را فراموش کردم؛ ثبت دستی
              </button>
            )}
            {isUnit && <p className="text-xs text-muted leading-6 text-center">مدت نظافت به {unitLabel} از سهمیه‌ی همین واحد کم می‌شود.</p>}
          </>
        )}
      </div>
    </Card>
  )
}

function TaskList({ tasks, home, onChanged, onCommit, flash }: {
  tasks: CleaningTask[]
  home: CleaningHome
  onChanged: () => void
  onCommit: (c: CleaningCommit) => void
  flash: (m: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState<{ task: CleaningTask; info: CleaningUnitInfo } | null>(null)

  const open = tasks.filter((t) => t.status === 'assigned')
  const finished = tasks.filter((t) => t.status === 'done')

  async function start(t: CleaningTask) {
    if (busyId) return
    setBusyId(t.id)
    setErr('')
    try {
      await cleaningTasksApi.start(t.id)
      flash(t.kind === 'unit' ? `نظافت واحد ${fa(t.unit_number ?? '')} شروع شد` : 'کار شروع شد')
      onChanged()
    } catch (e) {
      setErr(errText(e, 'شروع کار ممکن نشد'))
    } finally {
      setBusyId(null)
    }
  }

  if (open.length === 0 && finished.length === 0) {
    return (
      <Card>
        <div className="p-10 text-center space-y-2">
          <ListTodo size={34} className="mx-auto text-muted" />
          <p className="font-bold">فعلاً کاری به شما سپرده نشده</p>
          <p className="text-sm text-muted leading-7">مسئول نظافت هر کاری واگذار کند، همین‌جا و با یک اعلان می‌آید.</p>
        </div>
      </Card>
    )
  }
  return (
    <>
      {err && <ErrBox>{err}</ErrBox>}
      {open.length === 0 && <p className="text-sm text-center text-muted py-3">کار بازی ندارید؛ ممنون از زحمت‌تان</p>}
      <div className="space-y-3">
        {open.map((t) => <TaskCard key={t.id} task={t} unitLabel={home.service.unit_label} busyId={busyId} onStart={start} onManual={(task, info) => setManual({ task, info })} />)}
      </div>
      {finished.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted pt-2">انجام‌شده‌های امروز</p>
          {finished.map((t) => <TaskCard key={t.id} task={t} unitLabel={home.service.unit_label} busyId={null} onStart={() => {}} onManual={() => {}} />)}
        </div>
      )}
      <ManualSheet target={manual} onClose={() => setManual(null)} onDone={(c) => { setManual(null); onCommit(c) }} />
    </>
  )
}

/* ───────────── ثبت دستی ───────────── */

function ManualSheet({ target, onClose, onDone }: { target: { task: CleaningTask; info: CleaningUnitInfo } | null; onClose: () => void; onDone: (c: CleaningCommit) => void }) {
  const info = target?.info ?? null
  const [day, setDay] = useState<'today' | 'yesterday'>('today')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [pv, setPv] = useState<CleaningOutcome | null>(null)
  const [pvErr, setPvErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const unitId = info?.unit.id
  const dayIso = day === 'today' ? tehranToday() : addDays(tehranToday(), -1)

  useEffect(() => {
    if (!unitId) return
    setDay('today'); setStart(''); setEnd(''); setNote(''); setPv(null); setPvErr(''); setErr('')
  }, [unitId])

  useEffect(() => {
    setPv(null)
    setPvErr('')
    if (!unitId || !validTime(start) || !validTime(end)) return
    if (end <= start) {
      setPvErr('ساعت پایان باید بعد از ساعت شروع باشد')
      return
    }
    let alive = true
    const t = window.setTimeout(() => {
      cleaningApi
        .preview({ unitId, startedAt: isoAt(dayIso, start), endedAt: isoAt(dayIso, end) })
        .then((r) => alive && setPv(r))
        .catch((e) => alive && setPvErr(errText(e, 'محاسبه ممکن نشد')))
    }, 300)
    return () => { alive = false; window.clearTimeout(t) }
  }, [unitId, start, end, dayIso])

  /** «+۲ ساعت» از ساعت شروع */
  function addHours(h: number) {
    if (!validTime(start)) return
    const [hh, mm] = start.split(':').map(Number)
    const total = hh * 60 + mm + h * 60
    if (total >= 24 * 60) {
      setPvErr('نظافتی که از نیمه‌شب رد می‌شود را در دو بخش ثبت کنید')
      return
    }
    setEnd(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`)
  }

  async function submit() {
    if (!unitId || !target || !pv || busy) return
    setBusy(true)
    setErr('')
    try {
      onDone(await cleaningTasksApi.manual(target!.task.id, { startedAt: isoAt(dayIso, start), endedAt: isoAt(dayIso, end), note: note.trim() || undefined }))
    } catch (e) {
      setErr(errText(e, 'ثبت نظافت ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassSheet open={!!info} onClose={onClose} title={info ? `ثبت دستی نظافت واحد ${fa(info.unit.unit_number)}` : ''}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/5" role="group" aria-label="روز نظافت">
          {(['today', 'yesterday'] as const).map((d) => (
            <button key={d} onClick={() => setDay(d)} aria-pressed={day === d} className={`min-h-[44px] rounded-xl text-sm font-medium ${day === d ? 'bg-card shadow font-bold' : 'text-muted'}`}>
              {d === 'today' ? 'امروز' : 'دیروز'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted">ساعت شروع</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr" className={`${inputCls} mt-1 text-center text-xl`} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">ساعت پایان</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr" className={`${inputCls} mt-1 text-center text-xl`} />
          </label>
        </div>
        {validTime(start) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">پایان را سریع بزن:</span>
            {[1, 2, 3, 4].map((h) => (
              <button key={h} onClick={() => addHours(h)} className="min-h-[40px] px-3.5 rounded-full border border-line text-sm bg-card">{`${fa(h)} ساعت بعد`}</button>
            ))}
          </div>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="توضیح (اختیاری)" className={inputCls} />

        {pvErr && <ErrBox>{pvErr}</ErrBox>}
        {pv ? <OutcomeBox o={pv} /> : !pvErr && <p className="text-sm text-muted text-center py-2">ساعت شروع و پایان را وارد کنید تا سهم سهمیه و مازاد را ببینید</p>}
        {err && <ErrBox>{err}</ErrBox>}

        <button onClick={submit} disabled={!pv || busy} className={`${bigBtn} bg-tile text-white`}>
          <CheckCircle2 size={22} />
          {busy ? 'در حال ثبت…' : 'تأیید و ثبت نظافت'}
        </button>
      </div>
    </GlassSheet>
  )
}

/* ───────────── ۲) نظافتِ در جریان ───────────── */

function FinishSheet({ session, open, onClose, onDone }: { session: CleaningSession; open: boolean; onClose: () => void; onDone: (c: CleaningCommit) => void }) {
  const [custom, setCustom] = useState(false)
  const [endClock, setEndClock] = useState('')
  const [note, setNote] = useState('')
  const [pv, setPv] = useState<CleaningOutcome | null>(null)
  const [pvErr, setPvErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const endedAt = custom && validTime(endClock) ? endIsoFromClock(endClock) : undefined

  useEffect(() => {
    if (!open) return
    let alive = true
    setPv(null)
    setPvErr('')
    cleaningApi
      .preview({ unitId: session.unit_id, startedAt: session.started_at, endedAt })
      .then((r) => alive && setPv(r))
      .catch((e) => alive && setPvErr(errText(e, 'محاسبه ممکن نشد')))
    return () => { alive = false }
  }, [open, session.unit_id, session.started_at, endedAt])

  async function submit() {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      onDone(await cleaningApi.finish(session.id, { endedAt, note: note.trim() || undefined }))
    } catch (e) {
      setErr(errText(e, 'ثبت پایان ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassSheet open={open} onClose={onClose} title={`پایان نظافت واحد ${fa(session.unit_number)}`}>
      <div className="space-y-4">
        {pv ? <OutcomeBox o={pv} /> : pvErr ? <ErrBox>{pvErr}</ErrBox> : <div className="h-40 rounded-2xl bg-black/5 animate-pulse" />}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="توضیح (اختیاری)" className={inputCls} />

        {!custom ? (
          <button onClick={() => setCustom(true)} className="text-sm text-tile font-medium">پایان را به‌موقع نزدم؛ ساعت واقعی پایان را وارد می‌کنم</button>
        ) : (
          <label className="block">
            <span className="text-sm text-muted">ساعت واقعی پایان (امروز)</span>
            <input type="time" value={endClock} onChange={(e) => setEndClock(e.target.value)} dir="ltr" className={`${inputCls} mt-1 text-center text-xl`} />
          </label>
        )}
        {err && <ErrBox>{err}</ErrBox>}
        <button onClick={submit} disabled={!pv || busy || (custom && !validTime(endClock))} className={`${bigBtn} bg-tile text-white`}>
          <CheckCircle2 size={22} />
          {busy ? 'در حال ثبت…' : 'تأیید و ثبت نظافت'}
        </button>
      </div>
    </GlassSheet>
  )
}

function RunningCard({ session, onCommit, onCancelled }: { session: CleaningSession; onCommit: (c: CleaningCommit) => void; onCancelled: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [pv, setPv] = useState<CleaningOutcome | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [cancelAsk, setCancelAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const elapsed = now - new Date(session.started_at).getTime()
  const enough = elapsed >= 5 * 60_000

  // برآورد زنده: هر ۳۰ ثانیه از سرور (همان محاسبه‌ی نهایی) خوانده می‌شود
  const minuteTick = Math.floor(elapsed / 30_000)
  useEffect(() => {
    if (!enough) return
    let alive = true
    cleaningApi.preview({ unitId: session.unit_id, startedAt: session.started_at }).then((r) => alive && setPv(r)).catch(() => {})
    return () => { alive = false }
  }, [enough, minuteTick, session.unit_id, session.started_at])

  async function cancel() {
    setBusy(true)
    setErr('')
    try {
      await cleaningApi.cancel(session.id)
      setCancelAsk(false)
      onCancelled()
    } catch (e) {
      setErr(errText(e, 'لغو ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <div className="p-5 space-y-4 text-center">
          <div className="inline-flex items-center gap-2 text-good bg-good-soft rounded-full px-4 py-1.5 text-sm font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-good animate-pulse" />
            نظافت در جریان است
          </div>
          <div>
            <p className="text-sm text-muted">واحد</p>
            <p className="text-4xl font-extrabold">{fa(session.unit_number)}</p>
          </div>
          <p className="text-4xl font-mono font-bold tracking-wider tabular-nums" dir="ltr" aria-label="مدت سپری‌شده">{stopwatch(elapsed)}</p>
          <p className="text-sm text-muted flex items-center justify-center gap-1.5"><Clock size={16} /> شروع از ساعت {clock(session.started_at)}</p>

          {err && <ErrBox>{err}</ErrBox>}
          <button onClick={() => setFinishing(true)} className={`${bigBtn} bg-bad text-white`}>
            <Square size={20} fill="currentColor" />
            پایان نظافت
          </button>
          {!enough ? (
            <p className="text-sm text-muted bg-black/5 rounded-2xl px-4 py-3">نظافت کمتر از ۵ دقیقه ثبت نمی‌شود</p>
          ) : pv ? (
            <div className="text-right">
              <p className="text-xs text-muted mb-2">اگر همین الان پایان بدهید:</p>
              <OutcomeBox o={pv} />
            </div>
          ) : (
            <div className="h-24 rounded-2xl bg-black/5 animate-pulse" />
          )}

          <button onClick={() => setCancelAsk(true)} className="text-sm text-muted min-h-[44px] px-3">اشتباه شروع شد؛ لغو</button>
        </div>
      </Card>

      <FinishSheet session={session} open={finishing} onClose={() => setFinishing(false)} onDone={(c) => { setFinishing(false); onCommit(c) }} />
      <GlassSheet open={cancelAsk} onClose={() => setCancelAsk(false)} title="لغو نظافت">
        <div className="space-y-4">
          <p className="text-sm leading-7">نظافت واحد {fa(session.unit_number)} لغو می‌شود و هیچ زمانی از سهمیه کم یا به شارژ اضافه نمی‌شود. مطمئن هستید؟</p>
          <button onClick={cancel} disabled={busy} className={`${bigBtn} bg-bad text-white`}>
            <Ban size={20} />
            بله، لغو شود
          </button>
          <button onClick={() => setCancelAsk(false)} className="w-full min-h-[48px] rounded-2xl border border-line text-sm font-medium">نه، ادامه می‌دهم</button>
        </div>
      </GlassSheet>
    </>
  )
}

/** کار مشاعات/موردی در جریان: فقط زمان‌سنج و یادداشت (بدون سهمیه و شارژ) */
function RunningTaskCard({ task, onChanged, flash }: { task: CleaningTask; onChanged: () => void; flash: (m: string) => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const startedAt = task.started_at ?? new Date().toISOString()
  const elapsed = now - new Date(startedAt).getTime()

  async function run(fn: () => Promise<unknown>, okMsg: string, fail: string) {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await fn()
      flash(okMsg)
      onChanged()
    } catch (e) {
      setErr(errText(e, fail))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="p-5 space-y-4 text-center">
        <div className="inline-flex items-center gap-2 text-good bg-good-soft rounded-full px-4 py-1.5 text-sm font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-good animate-pulse" />
          کار در جریان است
        </div>
        <p className="text-2xl font-extrabold leading-9">{task.title}</p>
        <p className="text-4xl font-mono font-bold tracking-wider tabular-nums" dir="ltr" aria-label="مدت سپری‌شده">{stopwatch(elapsed)}</p>
        <p className="text-sm text-muted flex items-center justify-center gap-1.5"><Clock size={16} /> شروع از ساعت {clock(startedAt)}</p>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="توضیح پایان کار (اختیاری)" className={inputCls} />
        {err && <ErrBox>{err}</ErrBox>}
        <button onClick={() => run(() => cleaningTasksApi.finish(task.id, note.trim() || undefined), 'کار انجام‌شده ثبت شد', 'ثبت پایان ممکن نشد')} disabled={busy} className={`${bigBtn} bg-bad text-white`}>
          <Square size={20} fill="currentColor" />
          پایان کار
        </button>
        <button onClick={() => run(() => cleaningTasksApi.undo(task.id), 'شروع برگشت', 'برگرداندن ممکن نشد')} disabled={busy} className="text-sm text-muted min-h-[44px] px-3">اشتباه شروع شد؛ برگردان</button>
      </div>
    </Card>
  )
}

/* ───────────── ۳) نتیجه ───────────── */

function DoneCard({ commit, onNext }: { commit: CleaningCommit; onNext: () => void }) {
  const { session, result } = commit
  return (
    <Card>
      <div className="p-6 space-y-5 text-center">
        <CheckCircle2 size={56} className="mx-auto text-good" />
        <div>
          <p className="text-xl font-extrabold">نظافت ثبت شد</p>
          <p className="text-sm text-muted mt-1">
            واحد {fa(session.unit_number)} · {clock(session.started_at)} تا {session.ended_at ? clock(session.ended_at) : ''}
          </p>
        </div>
        <div className="text-right"><OutcomeBox o={result} done /></div>
        <p className="text-xs text-muted">برای ساکن هم اعلان فرستاده شد.</p>
        <button onClick={onNext} className={`${bigBtn} bg-tile text-white`}>
          <Sparkles size={20} />
          کار بعدی
        </button>
      </div>
    </Card>
  )
}

/* ───────────── تاریخچه ───────────── */

function HistoryTab({ flash, onChanged }: { flash: (m: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<CleaningSession[] | null>(null)
  const [err, setErr] = useState('')
  const [target, setTarget] = useState<CleaningSession | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setRows(await cleaningApi.mine(40)); setErr('') } catch (e) { setErr(errText(e, 'تاریخچه بارگذاری نشد')) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function doVoid() {
    if (!target) return
    setBusy(true)
    try {
      await cleaningApi.voidSession(target.id)
      setTarget(null)
      flash('نظافت باطل شد و از سهمیه و شارژ برگشت')
      await load()
      onChanged()
    } catch (e) {
      setErr(errText(e, 'ابطال ممکن نشد'))
      setTarget(null)
    } finally {
      setBusy(false)
    }
  }

  if (err && !rows) return <ErrBox>{err}</ErrBox>
  if (!rows) return <div className="h-40 rounded-3xl bg-black/5 animate-pulse" />
  if (rows.length === 0) return <Card><p className="p-10 text-center text-sm text-muted">هنوز نظافتی ثبت نکرده‌اید</p></Card>

  return (
    <>
      {err && <ErrBox>{err}</ErrBox>}
      <div className="space-y-2.5">
        {rows.map((r) => {
          const mins = r.ended_at ? (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60000 : 0
          return (
            <Card key={r.id}>
              <div className="p-4 flex items-center gap-3">
                <div className="min-w-[56px] text-center">
                  <p className="text-xl font-extrabold">{fa(r.unit_number)}</p>
                  <p className="text-[11px] text-muted">واحد</p>
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium">{dayWord(r.started_at)} · {clock(r.started_at)}{r.ended_at ? ` تا ${clock(r.ended_at)}` : ''}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {r.status === 'running' ? 'در جریان' : r.status === 'void' ? 'باطل شده' : durLabel(mins)}
                    {r.status === 'done' && (r.overage_qty > 0 ? ` · مازاد ${money(r.amount)}` : ' · داخل سهمیه')}
                    {r.entry === 'manual' && ' · دستی'}
                  </p>
                </div>
                {r.can_void && (
                  <button onClick={() => setTarget(r)} className="min-h-[44px] px-3 rounded-xl border border-line text-xs font-medium flex items-center gap-1.5">
                    <Undo2 size={15} /> ابطال
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      <GlassSheet open={!!target} onClose={() => setTarget(null)} title="ابطال نظافت">
        <div className="space-y-4">
          <p className="text-sm leading-7">نظافت واحد {target ? fa(target.unit_number) : ''} باطل می‌شود؛ زمانش به سهمیه‌ی واحد برمی‌گردد و مازادش (در صورت وجود) از شارژ حذف می‌شود.</p>
          <button onClick={doVoid} disabled={busy} className={`${bigBtn} bg-bad text-white`}>
            <Undo2 size={20} />
            {busy ? 'در حال ابطال…' : 'بله، باطل شود'}
          </button>
          <button onClick={() => setTarget(null)} className="w-full min-h-[48px] rounded-2xl border border-line text-sm font-medium">انصراف</button>
        </div>
      </GlassSheet>
    </>
  )
}

/* ───────────── صفحه ───────────── */

export function StaffHousekeeping() {
  const [home, setHome] = useState<CleaningHome | null>(null)
  const [tasks, setTasks] = useState<CleaningTask[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [tab, setTab] = useState<Tab>('work')
  const [done, setDone] = useState<CleaningCommit | null>(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    try { const [h, t] = await Promise.all([cleaningApi.home(), cleaningTasksApi.mine()]); setHome(h); setTasks(t); setLoadErr('') } catch (e) { setLoadErr(errText(e, 'بارگذاری پنل ممکن نشد')) }
  }, [])
  useEffect(() => { void load() }, [load])

  const flash = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  const committed = (c: CleaningCommit) => { setDone(c); void load() }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-tile/15 text-tile flex items-center justify-center"><Sparkles size={22} /></div>
        <div>
          <h1 className="text-xl font-extrabold">کارهای نظافت من</h1>
          <p className="text-xs text-muted">کارهایی که مسئول نظافت سپرده؛ شروع و پایان را بزنید، بقیه خودکار است</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/5" role="tablist">
        {([['work', 'کارهای من', ListTodo], ['history', 'سابقه‌ی من', History]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-[46px] rounded-xl text-sm flex items-center justify-center gap-2 ${tab === id ? 'bg-card shadow font-bold' : 'text-muted font-medium'}`}>
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>

      {loadErr && <ErrBox>{loadErr}</ErrBox>}
      {!home && !loadErr && <div className="h-64 rounded-3xl bg-black/5 animate-pulse" />}

      {home && tab === 'work' && (
        <>
          {!home.service.configured && tasks.every((t) => t.kind === 'unit') ? (
            <Card>
              <div className="p-8 text-center space-y-2">
                <AlertTriangle size={30} className="mx-auto text-warn" />
                <p className="font-bold">خدمت «خانه‌داری» هنوز تعریف نشده</p>
                <p className="text-sm text-muted leading-7">از مدیر بخواهید در بخش «آفرها و خدمات» سهمیه‌ی ساعت و نرخ نظافت را تعریف کند تا ثبت نظافت فعال شود.</p>
              </div>
            </Card>
          ) : done ? (
            <DoneCard commit={done} onNext={() => setDone(null)} />
          ) : home.active ? (
            <RunningCard session={home.active} onCommit={committed} onCancelled={() => { flash('نظافت لغو شد'); void load() }} />
          ) : tasks.find((t) => t.status === 'in_progress' && t.kind !== 'unit') ? (
            <RunningTaskCard task={tasks.find((t) => t.status === 'in_progress' && t.kind !== 'unit')!} onChanged={() => void load()} flash={flash} />
          ) : (
            <TaskList tasks={tasks} home={home} onChanged={() => void load()} onCommit={committed} flash={flash} />
          )}

          {!home.active && !done && home.service.configured && (
            <p className="text-center text-xs text-muted">
              {home.month.period_label}: {fa(home.month.sessions)} نظافت · {durLabel(home.month.minutes)}
              {home.month.overage_amount > 0 && ` · مازاد ثبت‌شده ${money(home.month.overage_amount)}`}
            </p>
          )}
        </>
      )}

      {home && tab === 'history' && <HistoryTab flash={flash} onChanged={() => void load()} />}

      <GlassToast message={toast} />
    </div>
  )
}
