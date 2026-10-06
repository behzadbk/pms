import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Clock, Plus, Trash2, Wrench } from 'lucide-react'
import { maintenanceApi, CATEGORY_LABEL, PRIORITY_LABEL, type Asset, type AssetCategory, type Priority, type Schedule, type TeamMember } from '../../lib/api/maintenance'
import { errText, fa } from '../../lib/api/residents'
import { parseDateInput } from '../../lib/jalali'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, Sheet, useLoad, useToast } from '../../components/hm'
import { DateField, SelectField, dateFa } from '../shared/maintenanceUi'

type Tab = 'schedules' | 'assets'

/** برنامه‌ی سرویس دوره‌ای + تجهیزات؛ job روزانه برای هر سررسید یک دستور کار می‌سازد. */
export function ScheduleView({ admin, toast }: { admin?: boolean; toast: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('schedules')
  const sch = useLoad<Schedule[]>(() => maintenanceApi.schedules(), [])
  const ast = useLoad(() => maintenanceApi.assets(), [])
  const [addSch, setAddSch] = useState(false)
  const [addAsset, setAddAsset] = useState(false)

  async function remove(s: Schedule) {
    if (!window.confirm(`برنامه‌ی «${s.title} — ${s.asset_name}» حذف شود؟`)) return
    try {
      await maintenanceApi.deleteSchedule(s.id)
      toast('برنامه حذف شد')
      await sch.reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }
  async function run() {
    try {
      const r = await maintenanceApi.runSchedules()
      toast(r.created ? `${fa(r.created)} دستور کار ساخته شد` : 'سررسیدی برای ساخت دستور کار نیست')
      await sch.reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Seg<Tab> className="flex-1" options={[['schedules', 'سرویس‌های دوره‌ای'], ['assets', 'تجهیزات']]} value={tab} onChange={setTab} />
        <button className="lg4-capsule min-h-[44px] px-4 text-sm font-bold inline-flex items-center gap-1.5" onClick={() => (tab === 'schedules' ? setAddSch(true) : setAddAsset(true))}>
          <Plus size={16} /> {tab === 'schedules' ? 'برنامه جدید' : 'تجهیز جدید'}
        </button>
      </div>

      {tab === 'schedules' &&
        (sch.loading && !sch.data ? (
          <Loading />
        ) : sch.error || !sch.data ? (
          <ErrorBlock message={sch.error ?? ''} retry={() => void sch.reload()} />
        ) : sch.data.length === 0 ? (
          <EmptyState icon={CalendarClock} title="برنامه‌ای تعریف نشده" sub="برای هر تجهیز یک سرویس دوره‌ای تعریف کنید تا دستور کارش خودکار ساخته شود." tone="mute" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sch.data.map((s) => {
              // وضعیت سررسید: days_left منفی = دیرکرد (قرمز)؛ داخل بازه‌ی lead_days = «نزدیک» (هشدار زرد)؛ وگرنه عادی.
              // (job روزانه‌ی بک‌اند وقتی «سررسید − lead_days» برسد خودش دستور کار می‌سازد؛ این رنگ‌ها فقط نمایش‌اند.)
              const late = s.days_left < 0
              const soon = !late && s.days_left <= s.lead_days
              return (
                <article key={s.id} className="hm-card p-4 flex items-start gap-3">
                  <span className={`hm-icon-tile hm-tone-${late ? 'bad' : soon ? 'warn' : 'pri'}`}>{late ? <AlertTriangle size={22} /> : <Clock size={22} />}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px]">{s.asset_name}</p>
                    <p className="text-sm text-[var(--hm-t2)] mt-0.5">
                      {s.title} · هر {fa(s.interval_days)} روز
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                      <Badge tone={late ? 'bad' : soon ? 'warn' : 'mute'}>{late ? `${fa(Math.abs(s.days_left))} روز تأخیر` : s.days_left === 0 ? 'امروز' : `${fa(s.days_left)} روز مانده`}</Badge>
                      <span className="text-[var(--hm-t2)]">سررسید {dateFa(s.next_due)}</span>
                      {s.work_order && <Badge tone="acc">دستور کار صادر شده</Badge>}
                      {s.priority !== 'normal' && <Badge tone={s.priority === 'low' ? 'mute' : 'warn'}>{PRIORITY_LABEL[s.priority]}</Badge>}
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--hm-t2)]">
                      {s.last_done ? `آخرین انجام: ${dateFa(s.last_done)}` : 'هنوز انجام نشده'} · {s.assignee_name ?? 'همه‌ی کارکنان نگهداری'}
                    </p>
                  </div>
                  {admin && (
                    <button className="hm-back" aria-label="حذف برنامه" onClick={() => remove(s)}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        ))}
      {tab === 'schedules' && admin && (
        <button className="hm-chip self-start" onClick={run}>
          ساخت دستور کار سررسیدها همین حالا
        </button>
      )}

      {tab === 'assets' &&
        (ast.loading && !ast.data ? (
          <Loading />
        ) : ast.error || !ast.data ? (
          <ErrorBlock message={ast.error ?? ''} retry={() => void ast.reload()} />
        ) : ast.data.assets.length === 0 ? (
          <EmptyState icon={Wrench} title="تجهیزی ثبت نشده" sub="آسانسور، موتورخانه، روشنایی و … را تعریف کنید تا سابقه‌ی سرویسشان نگه داشته شود." tone="mute" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {ast.data.assets.map((a) => (
              <article key={a.id} className="hm-card p-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-[15px]">{a.name}</p>
                  <Badge tone="mute">{CATEGORY_LABEL[a.category]}</Badge>
                  {a.open_tickets > 0 && <Badge tone="warn">{fa(a.open_tickets)} تیکت باز</Badge>}
                </div>
                <p className="text-xs text-[var(--hm-t2)]">{a.location || '—'}</p>
                <p className="text-xs text-[var(--hm-t2)] leading-6">
                  {a.last_service ? `آخرین ${{ repair: 'تعمیر', replace: 'تعویض', service: 'سرویس', inspection: 'بازدید' }[a.last_service.type]}: ${dateFa(a.last_service.performed_on)} — ${a.last_service.description}` : 'سابقه‌ای ثبت نشده'}
                </p>
                {a.next_due && <p className="text-xs text-[var(--hm-t2)]">سررسید بعدی: {dateFa(a.next_due)}</p>}
              </article>
            ))}
          </div>
        ))}

      <ScheduleSheet
        open={addSch}
        assets={ast.data?.assets ?? []}
        onClose={() => setAddSch(false)}
        onDone={async () => {
          setAddSch(false)
          toast('برنامه‌ی دوره‌ای ثبت شد')
          await sch.reload(true)
          await ast.reload(true)
        }}
      />
      <AssetSheet
        open={addAsset}
        categories={ast.data?.categories ?? []}
        onClose={() => setAddAsset(false)}
        onDone={async () => {
          setAddAsset(false)
          toast('تجهیز ثبت شد')
          await ast.reload(true)
        }}
      />
    </div>
  )
}

function ScheduleSheet({ open, assets, onClose, onDone }: { open: boolean; assets: Asset[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [asset, setAsset] = useState('')
  const [title, setTitle] = useState('سرویس دوره‌ای')
  const [interval, setIntervalDays] = useState('30')
  const [next, setNext] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setAsset(assets[0]?.id ?? '')
    setTitle('سرویس دوره‌ای')
    setIntervalDays('30')
    setNext('')
    setAssignee('')
    setPriority('normal')
    setErr('')
    void maintenanceApi.team().then(setTeam).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  async function go() {
    const n = Number(interval.replace(/[^\d]/g, ''))
    if (!asset) return setErr('تجهیز را انتخاب کنید (ابتدا از تب «تجهیزات» تعریف کنید)')
    if (title.trim().length < 2) return setErr('عنوان را بنویسید')
    if (!n || n < 1) return setErr('فاصله‌ی سرویس را بر حسب روز بنویسید')
    const iso = next.trim() ? parseDateInput(next) : undefined
    if (next.trim() && !iso) return setErr('تاریخ سررسید نامعتبر است')
    setBusy(true)
    try {
      await maintenanceApi.createSchedule({ asset_id: asset, title: title.trim(), interval_days: n, next_due: iso ?? undefined, assignee_login: assignee || null, priority })
      await onDone()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label="برنامه‌ی دوره‌ای جدید">
      <p className="text-lg font-bold">برنامه‌ی سرویس دوره‌ای</p>
      <div className="mt-3">
        <FieldCard>
          <SelectField label="تجهیز" value={asset} onChange={setAsset} options={assets.length ? assets.map((a) => ({ value: a.id, label: a.name })) : [{ value: '', label: 'تجهیزی تعریف نشده' }]} />
          <Field label="عنوان کار" value={title} onChange={setTitle} />
          <Field label="تکرار هر چند روز" value={interval} onChange={setIntervalDays} inputMode="numeric" />
          <DateField label="سررسید اول (خالی = امروز + فاصله)" value={next} onChange={setNext} />
          <SelectField label="کارمند مسئول" value={assignee} onChange={setAssignee} options={[{ value: '', label: '— همه‌ی کارکنان نگهداری —' }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
          <SelectField label="اولویت" value={priority} onChange={(v) => setPriority(v as Priority)} options={(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        </FieldCard>
      </div>
      <p className="mt-2 text-xs text-[var(--hm-t2)] leading-6">۳ روز مانده به سررسید، دستور کار خودکار ساخته و به کارمند اعلان می‌شود.</p>
      {err && <p className="mt-2 text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta className="mt-3" busy={busy} onClick={go}>
        ثبت برنامه
      </Cta>
    </Sheet>
  )
}

function AssetSheet({ open, categories, onClose, onDone }: { open: boolean; categories: { id: AssetCategory; label: string }[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AssetCategory>('elevator')
  const [location, setLocation] = useState('')
  const [interval, setIntervalDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setName('')
      setLocation('')
      setIntervalDays('')
      setErr('')
    }
  }, [open])
  async function go() {
    if (name.trim().length < 2) return setErr('نام تجهیز را بنویسید')
    setBusy(true)
    try {
      await maintenanceApi.createAsset({ name: name.trim(), category, location: location.trim() || undefined, service_interval_days: Number(interval.replace(/[^\d]/g, '')) || undefined })
      await onDone()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label="تجهیز جدید">
      <p className="text-lg font-bold">تجهیز جدید</p>
      <div className="mt-3">
        <FieldCard>
          <Field label="نام" value={name} onChange={setName} placeholder="مثلاً آسانسور B" />
          <SelectField label="دسته" value={category} onChange={(v) => setCategory(v as AssetCategory)} options={categories.map((c) => ({ value: c.id, label: c.label }))} />
          <Field label="محل" value={location} onChange={setLocation} placeholder="مثلاً لابی بلوک B" />
          <Field label="فاصله‌ی سرویس پیشنهادی (روز، اختیاری)" value={interval} onChange={setIntervalDays} inputMode="numeric" />
        </FieldCard>
      </div>
      {err && <p className="mt-2 text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta className="mt-3" busy={busy} onClick={go}>
        ثبت تجهیز
      </Cta>
    </Sheet>
  )
}

export function StaffSchedule() {
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'برنامه سرویس دوره‌ای · همین'
  }, [])
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="نگهداری" title="برنامه سرویس دوره‌ای" />
      <ScheduleView toast={toast} />
      {toastNode}
    </div>
  )
}
