import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Building2, ChevronLeft, FileUp, MessageSquare, PencilLine, QrCode, Search, UserPlus, Users } from 'lucide-react'
import { useResidentsScope } from '../../../lib/residentsScope'
import { residentsApi, errText, fa, type UnitCategory, type UnitListItem, type UnitsResponse } from '../../../lib/api/residents'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, Sheet, StickyCta, useLoad, useToast } from '../../../components/hm'
import { AreaOffersHint } from '../../../components/AreaOffersHint'

type Filter = 'all' | UnitCategory
const FILTERS: [Filter, string][] = [['all', 'همه'], ['owner', 'مالک'], ['tenant', 'مستأجر'], ['pending', 'در انتظار'], ['vacant', 'خالی']]

/** شناسه‌ی ساختمانِ مدیر = tenant خودش */
export function useBuildingId() {
  return useResidentsScope().buildingId
}

/** A1 — فهرست ساکنین با فیلتر، جست‌وجو و دکمه‌ی «افزودن ساکن» */
export function AdminResidents({ readOnly }: { readOnly?: boolean } = {}) {
  const sc = useResidentsScope()
  const buildingId = sc.buildingId
  const [unitsOpen, setUnitsOpen] = useState(false)
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [methodsOpen, setMethodsOpen] = useState(false)
  const [picker, setPicker] = useState<null | 'invite' | 'swap'>(null)
  const { toast, toastNode } = useToast()
  const location = useLocation()

  // پیام موفقیت صفحه‌ی قبل (ثبت ساکن، تخلیه، …)
  useEffect(() => {
    const t = (location.state as { toast?: string } | null)?.toast
    if (t) {
      toast(t)
      window.history.replaceState({}, '')
    }
  }, [location.state, toast])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  const { data, error, loading, reload } = useLoad<UnitsResponse>(() => residentsApi.units(buildingId, filter, debounced), [buildingId, filter, debounced])

  function open(u: UnitListItem) {
    if (readOnly) return
    if (u.category === 'vacant') navigate(`${sc.newResident}?unit=${u.id}`)
    else if (u.category === 'pending') navigate(sc.requests)
    else navigate(sc.unit(u.id))
  }

  const counts = data?.counts
  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageTitle
        kicker={data ? `${data.building.name} · ${fa(data.counts.all)} واحد` : ' '}
        title="ساکنین"
        action={
          !readOnly && (
            <span className="flex items-center gap-1">
            <button className="hm-back" onClick={() => setUnitsOpen(true)} aria-label="افزودن واحد">
              <Building2 size={22} />
            </button>
            <button className="hm-back" onClick={() => navigate(sc.requests)} aria-label="درخواست‌های عضویت و ورود از اکسل">
              <FileUp size={22} />
            </button>
            </span>
          )
        }
      />
      <label className="hm-row !py-2.5">
        <Search size={20} className="text-[var(--hm-t3)] shrink-0" />
        <input className="hm-input !font-normal" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، موبایل یا شماره واحد" aria-label="جست‌وجو" />
      </label>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} className="hm-chip" data-on={filter === k} onClick={() => setFilter(k)}>
            {label} {counts ? fa(counts[k]) : ''}
          </button>
        ))}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBlock message={error} retry={() => reload()} />}
      {data && data.counts.all === 0 && (
        <div className="hm-card p-5 flex flex-col items-center gap-3 text-center">
          <Building2 size={36} className="text-[var(--hm-pri)]" />
          <p className="text-base font-bold">هنوز واحدی برای این ساختمان تعریف نشده</p>
          <p className="text-xs leading-6 text-[var(--hm-t2)]">ابتدا واحدها را بسازید (مثلاً «۵ طبقه × ۴ واحد» با یک بار زدن)، سپس برای هر واحد ساکن ثبت کنید.</p>
          <button className="hm-cta lg4-capsule px-5" onClick={() => setUnitsOpen(true)}>
            ساخت واحدها
          </button>
        </div>
      )}
      {data && data.counts.all > 0 && data.units.length === 0 && <EmptyState icon={Users} title="واحدی با این مشخصات نیست" tone="mute" />}
      <div className="flex flex-col gap-2">
        {data?.units.map((u) =>
          u.category === 'vacant' ? (
            <button key={u.id} className="hm-row-dashed" onClick={() => open(u)}>
              <span className="hm-unitno hm-tone-mute">{fa(u.no)}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-[var(--hm-t2)]">واحد خالی</span>
                <span className="block mt-1 text-xs text-[var(--hm-t2)]">{u.meta}</span>
              </span>
              {!readOnly && <span className="hm-badge hm-tone-pri">ثبت ساکن</span>}
            </button>
          ) : (
            <button key={u.id} className="hm-row" onClick={() => open(u)}>
              <span className="hm-unitno">{fa(u.no)}</span>
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-sm font-bold truncate">{u.name}</span>
                <span className="text-xs text-[var(--hm-t2)]">{u.meta}</span>
                {u.badges.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {u.badges.map((b) => (
                      <Badge key={b.t} tone={b.tone}>
                        {b.t}
                      </Badge>
                    ))}
                  </span>
                )}
              </span>
              {!readOnly && <ChevronLeft size={20} className="text-[var(--hm-t3)] shrink-0" />}
            </button>
          ),
        )}
      </div>

      {!readOnly && (
        <StickyCta>
          <Cta onClick={() => setMethodsOpen(true)}>
            <UserPlus size={22} />
            افزودن ساکن
          </Cta>
        </StickyCta>
      )}

      <UnitsSheet
        open={unitsOpen}
        buildingId={buildingId}
        onClose={() => setUnitsOpen(false)}
        onDone={(msg) => {
          setUnitsOpen(false)
          toast(msg)
          void reload(true)
        }}
      />
      <MethodsSheet
        open={methodsOpen}
        onClose={() => setMethodsOpen(false)}
        onPick={(i) => {
          setMethodsOpen(false)
          if (i === 0) setPicker('invite')
          else if (i === 1) navigate(sc.newResident)
          else if (i === 2) navigate(`${sc.requests}?tab=qr`)
          else if (i === 3) navigate(`${sc.requests}?tab=import`)
          else setPicker('swap')
        }}
      />
      <InviteSheet
        open={picker === 'invite'}
        units={data?.units ?? []}
        buildingId={buildingId}
        onClose={() => setPicker(null)}
        onUnitsChanged={() => void reload(true)}
        onDone={(msg) => {
          setPicker(null)
          toast(msg)
          void reload(true)
        }}
      />
      <UnitPickSheet
        open={picker === 'swap'}
        title="تغییر مستأجر · انتخاب واحد"
        units={(data?.units ?? []).filter((u) => u.category === 'tenant' || u.category === 'owner')}
        onClose={() => setPicker(null)}
        onPick={(u) => navigate(`${sc.moveOut(u.id)}?then=new`)}
      />
      {toastNode}
    </div>
  )
}

const METHODS = [
  { icon: MessageSquare, t: 'ارسال لینک دعوت', d: 'فقط واحد و موبایل؛ ساکن بقیه را خودش تکمیل می‌کند.', rec: true },
  { icon: PencilLine, t: 'ثبت دستی', d: 'مدیر همه‌ی اطلاعات را وارد می‌کند؛ مناسب ساکن سالمند.', rec: false },
  { icon: QrCode, t: 'کد QR ساختمان', d: 'در لابی نصب می‌شود؛ ثبت‌نام با تأیید مدیر.', rec: false },
  { icon: FileUp, t: 'ورود گروهی از اکسل', d: 'برای راه‌اندازی اولیه؛ قالب آماده دارد.', rec: false },
  { icon: ArrowLeftRight, t: 'تغییر مستأجر', d: 'تخلیه‌ی ساکن قبلی و ثبت ساکن جدید در یک مسیر.', rec: false },
]

/** A2 — برگه‌ی انتخاب روش ثبت (۵ روش) */
function MethodsSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (i: number) => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="ثبت ساکن جدید">
      <p className="mx-2 text-xl font-bold">ثبت ساکن جدید</p>
      <p className="mx-2 mt-1 mb-4 text-sm text-[var(--hm-t2)]">روش ثبت را انتخاب کنید</p>
      <div className="flex flex-col gap-2">
        {METHODS.map((m, i) => (
          <button
            key={m.t}
            onClick={() => onPick(i)}
            className="hm-row !items-start"
            style={m.rec ? { borderColor: 'var(--hm-pri)', background: 'color-mix(in srgb, var(--lg4-card) 60%, white)' } : undefined}
          >
            <span className="hm-icon-tile">
              <m.icon size={24} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold">{m.t}</span>
                {m.rec && <Badge tone="acc">پیشنهادی</Badge>}
              </span>
              <span className="block mt-1 text-xs leading-6 text-[var(--hm-t2)]">{m.d}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function UnitPickSheet({
  open,
  title,
  units,
  onClose,
  onPick,
  onCreated,
}: {
  open: boolean
  title: string
  units: UnitListItem[]
  onClose: () => void
  onPick: (u: UnitListItem) => void
  /** اگر داده شود، مدیر می‌تواند واحد جدید را دستی بسازد؛ بعد از ساخت فراخوانی می‌شود (برای بارگذاری دوباره‌ی فهرست) */
  onCreated?: (created: { id: string; no: string }[]) => void | Promise<void>
}) {
  const buildingId = useBuildingId()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [numbers, setNumbers] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function create() {
    setErr(null)
    setBusy(true)
    try {
      const r = await residentsApi.createUnits(buildingId, { unit_numbers: numbers.trim() || q.trim() })
      await onCreated?.(r.created)
      setNumbers('')
      setAdding(false)
      setQ('')
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const list = useMemo(() => units.filter((u) => !q || u.no.includes(q.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || (u.name ?? '').includes(q)), [units, q])
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <p className="mx-2 mb-3 text-base font-bold">{title}</p>
      <label className="hm-row !py-2 mb-3">
        <Search size={18} className="text-[var(--hm-t3)]" />
        <input className="hm-input !font-normal" value={q} onChange={(e) => setQ(e.target.value)} placeholder="شماره واحد یا نام" />
      </label>
      <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
        {list.map((u) => (
          <button key={u.id} className="hm-row" onClick={() => onPick(u)}>
            <span className="hm-unitno" style={{ width: 44, height: 44 }}>
              {fa(u.no)}
            </span>
            <span className="flex-1 min-w-0 text-right">
              <span className="block text-sm font-bold">{u.name ?? 'واحد خالی'}</span>
              <span className="block text-xs text-[var(--hm-t2)]">{u.meta}</span>
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="text-center text-sm text-[var(--hm-t2)] py-6">واحدی پیدا نشد</p>}
      </div>
      {onCreated && (
        <div className="mt-3 flex flex-col gap-2">
          {adding || list.length === 0 ? (
            <div className="hm-card p-3 flex flex-col gap-2">
              <p className="text-sm font-bold">افزودن واحد جدید</p>
              <input
                className="hm-input !font-normal hm-row !py-2"
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder={q.trim() ? q.trim() : 'مثلاً ۱۲۰۴ — یا چند واحد: ۱۰۱، ۱۰۲، ۱۰۳'}
                inputMode="text"
                dir="rtl"
                aria-label="شماره‌ی واحد جدید"
              />
              <p className="text-xs text-[var(--hm-t2)]">طبقه از روی شماره حدس زده می‌شود (۱۲۰۴ ← طبقه ۱۲) و بعداً قابل ویرایش است.</p>
              {err && <p className="text-xs font-bold text-[var(--hm-bad)]">{err}</p>}
              <Cta onClick={create} busy={busy} disabled={!numbers.trim() && !q.trim()}>
                ساخت واحد
              </Cta>
            </div>
          ) : (
            <button className="hm-cta-ghost w-full" onClick={() => setAdding(true)}>
              <UserPlus size={18} /> افزودن واحد جدید
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** «ارسال لینک دعوت»: فقط واحد و موبایل */
function InviteSheet({
  open,
  units,
  onClose,
  onDone,
  onUnitsChanged,
}: {
  open: boolean
  units: UnitListItem[]
  buildingId: string
  onClose: () => void
  onDone: (msg: string) => void
  onUnitsChanged?: () => void
}) {
  const [unit, setUnit] = useState<UnitListItem | null>(null)
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    if (open) {
      setUnit(null)
      setPhone('')
      setErr(null)
    }
  }, [open])
  async function send() {
    if (!unit) return setErr('واحد را انتخاب کنید')
    setBusy(true)
    setErr(null)
    try {
      const r = await residentsApi.invite(unit.id, phone)
      onDone(r.resent ? 'لینک دعوت دوباره ارسال شد' : `لینک دعوت برای واحد ${fa(unit.no)} ارسال شد`)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Sheet open={open && !picking} onClose={onClose} label="ارسال لینک دعوت">
        <p className="mx-2 text-xl font-bold">ارسال لینک دعوت</p>
        <p className="mx-2 mt-1 mb-4 text-sm text-[var(--hm-t2)]">فقط واحد و موبایل؛ ساکن بقیه را خودش تکمیل می‌کند.</p>
        <div className="flex flex-col gap-3">
          <button className="hm-row" onClick={() => setPicking(true)}>
            <span className="flex-1 text-right">
              <span className="block text-xs text-[var(--hm-t2)]">واحد</span>
              <span className="block mt-0.5 text-sm font-bold">{unit ? `${fa(unit.no)} · طبقه ${fa(unit.floor ?? '')}` : 'انتخاب واحد'}</span>
            </span>
            <span className="text-sm font-bold text-[var(--hm-pri)]">تغییر</span>
          </button>
          <FieldCard>
            <Field label="شماره موبایل" value={phone} onChange={setPhone} placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" inputMode="tel" dir="ltr" />
          </FieldCard>
          {err && <p className="text-xs font-bold text-[var(--hm-bad)] px-2">{err}</p>}
          <Cta onClick={send} busy={busy} disabled={!unit || phone.trim().length < 10}>
            ارسال پیامک دعوت
          </Cta>
          <p className="text-center text-xs text-[var(--hm-t2)]">لینک دعوت ۷ روز معتبر است، قابل ارسال دوباره و لغو.</p>
        </div>
      </Sheet>
      <UnitPickSheet
        open={open && picking}
        title="انتخاب واحد"
        units={units}
        onClose={() => setPicking(false)}
        onPick={(u) => {
          setUnit(u)
          setPicking(false)
        }}
        onCreated={() => onUnitsChanged?.()}
      />
    </>
  )
}

/** ساخت واحد: «n طبقه × m واحد» یکجا، یا یک واحد با مشخصات */
function UnitsSheet({ open, buildingId, onClose, onDone }: { open: boolean; buildingId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [tab, setTab] = useState<'bulk' | 'one'>('bulk')
  const [floors, setFloors] = useState('5')
  const [per, setPer] = useState('4')
  const [startFloor, setStartFloor] = useState('1')
  const [no, setNo] = useState('')
  const [floor, setFloor] = useState('')
  const [area, setArea] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setErr(null)
  }, [open])
  const n = (v: string) => Number(v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
  const total = n(floors) * n(per)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      if (tab === 'bulk') {
        const r = await residentsApi.bulkUnits(buildingId, { floors: n(floors), units_per_floor: n(per), start_floor: n(startFloor) || 1 })
        onDone(r.created ? `${fa(r.created)} واحد ساخته شد${r.skipped ? ` (${fa(r.skipped)} واحد از قبل بود)` : ''}` : 'همه‌ی این واحدها از قبل وجود داشتند')
      } else {
        await residentsApi.createUnit(buildingId, { unit_number: no.trim(), floor: floor ? n(floor) : undefined, area: area ? n(area) : undefined })
        onDone(`واحد ${fa(no.trim())} ساخته شد`)
        setNo('')
      }
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="ساخت واحد">
      <p className="mx-2 text-xl font-bold">ساخت واحد</p>
      <p className="mx-2 mt-1 mb-3 text-sm text-[var(--hm-t2)]">شماره‌ها خودکار طبقه‌ای می‌شوند: طبقه ۳ ← ۳۰۱، ۳۰۲، …</p>
      <Seg<'bulk' | 'one'> options={[['bulk', 'چند واحد یکجا'], ['one', 'یک واحد']]} value={tab} onChange={setTab} />
      <div className="mt-3 flex flex-col gap-3">
        {tab === 'bulk' ? (
          <>
            <FieldCard>
              <Field label="تعداد طبقه" value={floors} onChange={setFloors} inputMode="numeric" />
              <Field label="تعداد واحد در هر طبقه" value={per} onChange={setPer} inputMode="numeric" />
              <Field label="شروع از طبقه" value={startFloor} onChange={setStartFloor} inputMode="numeric" />
            </FieldCard>
            <p className="text-xs text-[var(--hm-t2)] px-2">{total > 0 ? `${fa(total)} واحد ساخته می‌شود · واحدهای تکراری نادیده گرفته می‌شوند (حداکثر ۵۰۰ واحد در هر بار)` : ' '}</p>
          </>
        ) : (
          <>
          <FieldCard>
            <Field label="شماره واحد" value={no} onChange={setNo} placeholder="مثلاً ۴۰۲" inputMode="numeric" />
            <Field label="طبقه (اختیاری)" value={floor} onChange={setFloor} inputMode="numeric" />
            <Field label="متراژ (اختیاری)" value={area} onChange={setArea} inputMode="numeric" />
          </FieldCard>
          <AreaOffersHint area={area ? n(area) : 0} />
          </>
        )}
        {err && <p className="text-xs font-bold text-[var(--hm-bad)] px-2">{err}</p>}
        <Cta onClick={submit} busy={busy} disabled={tab === 'bulk' ? !(total > 0) : !no.trim()}>
          {tab === 'bulk' ? 'ساخت واحدها' : 'افزودن واحد'}
        </Cta>
      </div>
    </Sheet>
  )
}
