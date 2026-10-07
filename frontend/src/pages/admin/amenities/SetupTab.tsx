import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarOff, Plus, Trash2 } from 'lucide-react'
import { amenitiesApi, type Closure, type GenderSplit, type ManagedAmenity } from '../../../lib/api/amenities'
import { errText, fa } from '../../../lib/api/residents'
import { AMENITY_ICONS, amenityIcon } from '../../../lib/amenityIcons'
import { formatJalali, parseDateInput } from '../../../lib/jalali'
import { addDays, tehranToday } from '../../../lib/tehran'
import { Badge, Cta, EmptyState, FieldCard, IconTile, Seg, Sheet, Toggle } from '../../../components/hm'
import { ScheduleEditor } from './ScheduleEditor'
import { GenderSplitEditor } from './GenderSplitEditor'
import { Section, Stepper } from './parts'

const DEFAULT_SCHEDULE = () => Array.from({ length: 7 }, () => [16, 17, 18, 19, 20, 21])

interface Draft {
  name: string
  icon: string
  description: string
  rule_text: string
  capacity: string
  requires_approval: boolean
  max_hours: number
  max_advance_days: number
  is_active: boolean
  private_enabled: boolean
  private_rules: string
  gender_split: GenderSplit | null
}
const emptyDraft = (): Draft => ({ name: '', icon: 'groups', description: '', rule_text: '', capacity: '', requires_approval: true, max_hours: 2, max_advance_days: 14, is_active: true, private_enabled: false, private_rules: '', gender_split: null })
const toDraft = (a: ManagedAmenity): Draft => ({
  name: a.name,
  icon: a.icon ?? 'groups',
  description: a.description ?? '',
  rule_text: a.rule_text ?? '',
  capacity: a.capacity ? String(a.capacity) : '',
  requires_approval: a.requires_approval,
  max_hours: a.max_hours,
  max_advance_days: a.max_advance_days,
  is_active: a.is_active,
  private_enabled: a.private_enabled ?? false,
  private_rules: a.private_rules ?? '',
  gender_split: a.gender_split ?? null,
})

/** تعریف مشاعات و تایم‌تیبل — لیست + ویرایشگر (دسکتاپ: کنار هم، موبایل: صفحه‌ی جدا) */
export function SetupTab({ amenities, closures, toast, onChanged }: { amenities: ManagedAmenity[]; closures: Closure[]; toast: (m: string) => void; onChanged: () => Promise<void> | void }) {
  const [sel, setSel] = useState<string | 'new' | null>(null)
  const [globalClosure, setGlobalClosure] = useState(false)
  const current = amenities.find((a) => a.id === sel) ?? null

  // دسکتاپ: اولین مشاع به‌صورت پیش‌فرض باز باشد
  useEffect(() => {
    if (sel === null && amenities.length && window.matchMedia('(min-width: 1024px)').matches) setSel(amenities[0].id)
  }, [sel, amenities])

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <div className={`flex flex-col gap-3 ${sel !== null ? 'hidden lg:flex' : ''}`}>
        <button className="lg4-capsule min-h-[48px] inline-flex items-center justify-center gap-2 text-sm font-bold" onClick={() => setSel('new')}>
          <Plus size={18} /> تعریف مشاع جدید
        </button>
        {amenities.length === 0 && <EmptyState icon={Plus} tone="pri" title="هنوز مشاعی تعریف نشده" />}
        {amenities.map((a) => {
          const Icon = amenityIcon(a.icon)
          return (
            <button key={a.id} onClick={() => setSel(a.id)} className="hm-card p-3 flex items-center gap-3 text-right" style={sel === a.id ? { outline: '2px solid var(--hm-pri)', outlineOffset: -2 } : undefined}>
              <IconTile icon={Icon} tone={a.is_active ? 'pri' : 'mute'} />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{a.name}</p>
                <p className="text-xs text-[var(--hm-t2)] mt-0.5">
                  {a.requires_approval ? 'با تأیید' : 'فوری'} · {a.capacity ? `${fa(a.capacity)} نفر` : 'بدون سقف'}
                </p>
              </div>
              {!a.is_active ? <Badge tone="mute">غیرفعال</Badge> : a.pending_count > 0 ? <Badge tone="warn">{fa(a.pending_count)} درخواست</Badge> : null}
            </button>
          )
        })}
        <button className="hm-card p-3 flex items-center gap-3 text-right" onClick={() => setGlobalClosure(true)}>
          <IconTile icon={CalendarOff} tone="mute" />
          <div className="flex-1">
            <p className="font-bold text-sm">تعطیلی همه‌ی مشاعات</p>
          </div>
        </button>
      </div>

      {sel !== null && (
        <Editor
          key={sel}
          amenity={sel === 'new' ? null : current}
          closures={closures}
          toast={toast}
          onBack={() => setSel(null)}
          onSaved={async (id) => {
            await onChanged()
            setSel(id ?? null)
          }}
        />
      )}
      {sel === null && (
        <div className="hidden lg:grid place-items-center hm-card p-10 text-sm text-[var(--hm-t2)]">یک مشاع را انتخاب کنید یا مشاع جدید بسازید.</div>
      )}

      <Sheet open={globalClosure} onClose={() => setGlobalClosure(false)} label="تعطیلی همه‌ی مشاعات">
        <p className="text-lg font-bold mb-3">تعطیلی همه‌ی مشاعات</p>
        <ClosureForm
          onAdd={async (b) => {
            await amenitiesApi.addClosure(b)
            await onChanged()
            setGlobalClosure(false)
            toast('تعطیلی ثبت شد')
          }}
        />
      </Sheet>
    </div>
  )
}

function Editor({ amenity, closures, toast, onBack, onSaved }: { amenity: ManagedAmenity | null; closures: Closure[]; toast: (m: string) => void; onBack: () => void; onSaved: (id?: string) => Promise<void> }) {
  const [d, setD] = useState<Draft>(() => (amenity ? toDraft(amenity) : emptyDraft()))
  const [sched, setSched] = useState<number[][]>(() => (amenity ? amenity.schedule.map((s) => [...s.hours]) : DEFAULT_SCHEDULE()))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const mine = useMemo(() => closures.filter((c) => amenity && (c.amenity_id === amenity.id || c.amenity_id === null)), [closures, amenity])

  async function save() {
    if (d.name.trim().length < 2) return setErr('نام مشاع را بنویسید')
    if (sched.every((h) => h.length === 0)) return setErr('حداقل یک ساعت در هفته باید قابل رزرو باشد')
    setBusy(true)
    setErr('')
    try {
      const body = {
        name: d.name.trim(),
        icon: d.icon,
        description: d.description.trim() || undefined,
        rule_text: d.rule_text.trim() || undefined,
        capacity: d.capacity ? Number(d.capacity) : amenity ? null : undefined,
        requires_approval: d.requires_approval,
        max_hours: d.max_hours,
        max_advance_days: d.max_advance_days,
        is_active: d.is_active,
        private_enabled: d.private_enabled,
        private_rules: d.private_rules.trim(),
        gender_split: d.gender_split,
      }
      const saved = amenity ? await amenitiesApi.update(amenity.id, body) : await amenitiesApi.create(body)
      await amenitiesApi.setSchedule(saved.id, sched.map((hours, weekday) => ({ weekday, hours })))
      toast(amenity ? 'تغییرات ذخیره شد' : 'مشاع تعریف شد')
      await onSaved(saved.id)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!amenity) return
    setBusy(true)
    try {
      const r = await amenitiesApi.remove(amenity.id)
      toast(r.archived ? 'به‌دلیل داشتن سابقه‌ی رزرو، غیرفعال شد' : 'مشاع حذف شد')
      setConfirmDel(false)
      await onSaved(undefined)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hm-card p-4 sm:p-5 flex flex-col gap-6 min-w-0">
      <div className="flex items-center gap-3">
        <div className="lg:hidden">
          <button className="hm-back" onClick={onBack} aria-label="بازگشت">
            <ArrowRight size={22} />
          </button>
        </div>
        <h2 className="text-lg font-bold flex-1">{amenity ? `ویرایش «${amenity.name}»` : 'مشاع جدید'}</h2>
      </div>

      <Section title="مشخصات">
        <FieldCard>
          <label className="block px-4 py-2">
            <span className="block text-xs text-[var(--hm-t2)]">نام مشاع</span>
            <input className="hm-input mt-0.5" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="مثلاً سالن بیلیارد" maxLength={60} />
          </label>
          <label className="block px-4 py-2">
            <span className="block text-xs text-[var(--hm-t2)]">توضیح کوتاه (اختیاری)</span>
            <input className="hm-input mt-0.5" value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="طبقه‌ی همکف، کنار لابی" maxLength={400} />
          </label>
          <label className="block px-4 py-2">
            <span className="block text-xs text-[var(--hm-t2)]">قوانین استفاده (به ساکن نشان داده می‌شود)</span>
            <textarea className="hm-input mt-0.5 min-h-[64px] resize-none" value={d.rule_text} onChange={(e) => set('rule_text', e.target.value)} placeholder="مثلاً: حداکثر ۶ نفر؛ لطفاً پس از استفاده سالن را مرتب کنید." maxLength={600} />
          </label>
        </FieldCard>
        <p className="text-xs text-[var(--hm-t2)] mt-2">آیکن</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(AMENITY_ICONS).map(([id, { icon: I, label }]) => (
            <button key={id} aria-label={label} title={label} aria-pressed={d.icon === id} onClick={() => set('icon', id)} className="hm-chip !min-h-[44px] !w-[44px] !px-0 grid place-items-center" data-on={d.icon === id}>
              <I size={20} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="نوع مشاع">
        <Seg<'general' | 'private'> options={[['general', 'عمومی'], ['private', 'رزرو خصوصی']]} value={d.private_enabled ? 'private' : 'general'} onChange={(v) => set('private_enabled', v === 'private')} />
        {d.private_enabled && (
          <label className="hm-card block px-4 py-2">
            <span className="block text-xs text-[var(--hm-t2)]">قوانین رزرو خصوصی</span>
            <textarea className="hm-input mt-0.5 min-h-[96px] resize-none" value={d.private_rules} onChange={(e) => set('private_rules', e.target.value)} maxLength={1500} />
          </label>
        )}
      </Section>

      <Section title="تفکیک بانوان و آقایان">
        <GenderSplitEditor value={d.gender_split} onChange={(v) => set('gender_split', v)} />
      </Section>

      <Section title="قوانین رزرو">
        <div className="hm-card hm-divided">
          <Row label="نیاز به تأیید مسئول">
            <Toggle on={d.requires_approval} onChange={(v) => set('requires_approval', v)} label="نیاز به تأیید" />
          </Row>
          <Row label="حداکثر مدت هر رزرو">
            <Stepper value={d.max_hours} min={1} max={12} unit="ساعت" onChange={(v) => set('max_hours', v)} />
          </Row>
          <Row label="رزرو تا چند روز جلوتر">
            <Stepper value={d.max_advance_days} min={1} max={90} unit="روز" onChange={(v) => set('max_advance_days', v)} />
          </Row>
          <Row label="ظرفیت (نفر)">
            <input className="hm-input !w-24 text-center rounded-xl border border-[var(--hm-hair)] min-h-[40px]" inputMode="numeric" value={d.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </Row>
          {amenity && (
            <Row label="فعال برای رزرو">
              <Toggle on={d.is_active} onChange={(v) => set('is_active', v)} label="فعال" />
            </Row>
          )}
        </div>
      </Section>

      <Section title="تایم‌تیبل هفتگی">
        <ScheduleEditor value={sched} onChange={setSched} />
      </Section>

      {amenity && (
        <Section title="تعطیلی‌ها">
          <div className="flex flex-col gap-2">
            {mine.length === 0 && <p className="text-sm text-[var(--hm-t2)]">تعطیلی ثبت نشده.</p>}
            {mine.map((c) => (
              <div key={c.id} className="hm-card flex items-center gap-3 px-3 py-2">
                <CalendarOff size={18} className="text-[var(--hm-t2)]" />
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-bold">{c.date_from === c.date_to ? formatJalali(c.date_from) : `${formatJalali(c.date_from)} تا ${formatJalali(c.date_to)}`}</p>
                  <p className="text-xs text-[var(--hm-t2)]">
                    {c.reason || '—'}
                    {c.amenity_id === null && ' · همه‌ی مشاعات'}
                  </p>
                </div>
                <button
                  className="hm-back"
                  aria-label="حذف تعطیلی"
                  onClick={async () => {
                    try {
                      await amenitiesApi.removeClosure(c.id)
                      toast('تعطیلی حذف شد')
                      await onSaved(amenity.id)
                    } catch (e) {
                      toast(errText(e))
                    }
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <ClosureForm
              compact
              onAdd={async (b) => {
                await amenitiesApi.addClosure({ ...b, amenity_id: amenity.id })
                toast('تعطیلی ثبت شد')
                await onSaved(amenity.id)
              }}
            />
          </div>
        </Section>
      )}

      {err && <p className="text-sm text-[var(--hm-bad)]">{err}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
        {amenity && (
          <button className="min-h-[48px] rounded-full px-5 text-sm font-bold hm-tone-bad" onClick={() => setConfirmDel(true)}>
            حذف مشاع
          </button>
        )}
        <Cta className="sm:ms-auto sm:!w-auto sm:min-w-[200px]" busy={busy} onClick={save}>
          {amenity ? 'ذخیره‌ی تغییرات' : 'تعریف مشاع'}
        </Cta>
      </div>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} label="حذف مشاع">
        <p className="text-lg font-bold">حذف «{amenity?.name}»؟</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button className="min-h-[48px] rounded-full hm-tone-mute font-bold text-sm" onClick={() => setConfirmDel(false)}>
            انصراف
          </button>
          <button className="min-h-[48px] rounded-full hm-tone-bad font-bold text-sm disabled:opacity-60" disabled={busy} onClick={remove}>
            بله، حذف
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function Row({ label, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">{label}</p>
      </div>
      {children}
    </div>
  )
}

/** ثبت تعطیلی: تاریخ شمسی (مثل ۱۴۰۵/۷/۲۰) با پیش‌نمایش و میان‌بُر امروز/فردا */
function ClosureForm({ onAdd, compact }: { onAdd: (b: { date_from: string; date_to: string; reason?: string }) => Promise<void>; compact?: boolean }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const f = parseDateInput(from)
  const t = parseDateInput(to) ?? f
  async function go() {
    if (!f || !t) return setErr('تاریخ را مثل ۱۴۰۵/۷/۲۰ بنویسید')
    if (t < f) return setErr('تاریخ پایان قبل از شروع است')
    setBusy(true)
    try {
      await onAdd({ date_from: f, date_to: t, reason: reason.trim() || undefined })
      setFrom('')
      setTo('')
      setReason('')
      setErr('')
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const today = tehranToday()
  return (
    <div className={compact ? 'hm-card p-3 flex flex-col gap-2' : 'flex flex-col gap-3'}>
      <div className="grid grid-cols-2 gap-2">
        <label className="hm-card px-3 py-2 block">
          <span className="block text-xs text-[var(--hm-t2)]">از تاریخ</span>
          <input className="hm-input" dir="ltr" inputMode="numeric" placeholder="1405/07/20" value={from} onChange={(e) => setFrom(e.target.value)} />
          {f && <span className="text-[11px] text-[var(--hm-t2)]">{formatJalali(f)}</span>}
        </label>
        <label className="hm-card px-3 py-2 block">
          <span className="block text-xs text-[var(--hm-t2)]">تا تاریخ (اختیاری)</span>
          <input className="hm-input" dir="ltr" inputMode="numeric" placeholder="همان روز" value={to} onChange={(e) => setTo(e.target.value)} />
          {parseDateInput(to) && <span className="text-[11px] text-[var(--hm-t2)]">{formatJalali(parseDateInput(to))}</span>}
        </label>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="hm-chip" onClick={() => setFrom(today)}>
          امروز
        </button>
        <button className="hm-chip" onClick={() => setFrom(addDays(today, 1))}>
          فردا
        </button>
      </div>
      <input className="hm-card px-3 min-h-[44px] bg-transparent outline-none text-sm" placeholder="دلیل (مثلاً تعمیرات)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
      {err && <p className="text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta busy={busy} onClick={go}>
        ثبت تعطیلی
      </Cta>
    </div>
  )
}
