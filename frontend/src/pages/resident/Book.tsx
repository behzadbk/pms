import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarX2, Lock, ShieldCheck } from 'lucide-react'
import { ApiError } from '../../lib/api/client'
import { usePermissions } from '../../context/PermissionsContext'
import { DebtorLock } from '../../components/DebtorLock'
import { residentsApi, errText, fa, type Amenity, type ReservationRow, type Slot } from '../../lib/api/residents'
import { amenityIcon } from '../../lib/amenityIcons'
import { amenitiesApi, GENDER_LABEL } from '../../lib/api/amenities'
import { dayLabel as fullDayLabel, whenLabel, relDay } from '../../lib/tehran'
import { Badge, Cta, ErrorBlock, Loading, Sheet, StickyCta, SuccessSheet, useLoad, useToast } from '../../components/hm'


/** تاریخ امروز به وقت تهران + n روز (YYYY-MM-DD) */
function tehranDate(plus: number) {
  const base = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
  const d = new Date(base + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + plus)
  return d.toISOString().slice(0, 10)
}
/** برچسب کوتاه روز برای چیپ: امروز / فردا / نام روز؛ زیرش تاریخ شمسی */
function dayLabel(_i: number, iso: string) {
  return relDay(iso)
}
const STATUS: Record<ReservationRow['status'], { t: string; tone: 'ok' | 'warn' | 'bad' | 'mute' }> = {
  confirmed: { t: 'قطعی', tone: 'ok' },
  pending: { t: 'در انتظار تأیید', tone: 'warn' },
  rejected: { t: 'تأیید نشد', tone: 'bad' },
  cancelled: { t: 'لغو شد', tone: 'mute' },
}

/**
 * رزرو مشاعات: مشاع → روز → ساعت آزاد → ثبت → صفحه‌ی موفقیت.
 * ساعت پُر (در انتظار یا قطعی) خط خورده و قابل انتخاب نیست. در اپ کودک، «با تأیید من» به‌جای رزرو
 * درخواست برای والد می‌سازد و ساعت سکوت صفحه‌ی استراحت را نشان می‌دهد.
 */
export function BookAmenity({ child = false }: { child?: boolean }) {
  const navigate = useNavigate()
  const { data: amenities, error, loading, reload: reloadAmenities } = useLoad<Amenity[]>(() => residentsApi.amenities(), [])
  const { data: mine, reload: reloadMine } = useLoad<ReservationRow[]>(() => residentsApi.myReservations().catch(() => []), [])
  const [am, setAm] = useState<string>('')
  const [day, setDay] = useState(0)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState<string | null>(null)
  const [acked, setAcked] = useState<Record<string, boolean>>({})
  const [rulesFor, setRulesFor] = useState<Amenity | null>(null)
  const [cancelFor, setCancelFor] = useState<ReservationRow | null>(null)
  const [success, setSuccess] = useState<{ title: string; sub?: string; rows: { k: string; v: string }[] } | null>(null)
  const { toast, toastNode } = useToast()
  const { perms } = usePermissions()
  const a = amenities?.find((x) => x.id === am) ?? amenities?.[0]
  const span = Math.min(14, Math.max(1, a?.max_advance_days ?? 4))
  const days = useMemo(() => Array.from({ length: span }, (_, i) => ({ i, iso: tehranDate(i) })), [span])
  const gated = !!a?.private_enabled && !acked[a.id]
  const locked = !!a?.locked || (!!a && !!perms?.locked_amenities?.includes(a.id))

  useEffect(() => {
    if (!a) return
    setSlot(null)
    setSlots(null)
    setClosed(null)
    residentsApi
      .slots(a.id, days[Math.min(day, days.length - 1)].iso)
      .then((r) => {
        setSlots(r.slots)
        setClosed(r.closed)
      })
      .catch((e) => toast(errText(e)))
  }, [a, day, days, toast])

  async function submit() {
    if (!a || !slot) return toast('یک ساعت آزاد انتخاب کنید')
    setBusy(true)
    try {
      const r = await residentsApi.book({ amenity_id: a.id, start: slot.start, ...(a.private_enabled ? { private: true } : {}) })
      const when = `${fullDayLabel(days[day].iso)} ${fa(slot.label)}`
      if (r.status === 'pending_parent') {
        navigate(`/child/waiting/${r.id}`, { state: { what: `${a.name} · ${when}` } })
        return
      }
      setSuccess({
        title: r.status === 'pending' ? 'درخواست رزرو ثبت شد' : a.private_enabled ? 'رزرو خصوصی قطعی شد' : 'رزرو قطعی شد',
        sub: r.status === 'pending' ? 'پس از تأیید مسئول مشاعات اعلان می‌گیرید.' : undefined,
        rows: [
          { k: 'مشاع', v: a.name },
          { k: 'زمان', v: when },
        ],
      })
      void reloadMine(true)
      const fresh = await residentsApi.slots(a.id, days[day].iso)
      setSlots(fresh.slots)
      setSlot(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) return navigate('/child/quiet')
      toast(errText(e))
      if (e instanceof ApiError && e.status === 403) void reloadAmenities(true)
      if (e instanceof ApiError && e.status === 409) {
        const fresh = await residentsApi.slots(a.id, days[day].iso).catch(() => null)
        if (fresh) setSlots(fresh.slots)
        setSlot(null)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (error || !amenities) return <ErrorBlock message={error ?? ''} />
  const cta = gated ? 'رزرو خصوصی' : locked ? 'بسته برای واحد بدهکار' : slot ? (a?.needs_approval ? `ارسال درخواست رزرو · ${fa(slot.label)}` : `رزرو قطعی · ${fa(slot.label)}`) : 'یک ساعت انتخاب کنید'

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <p className="text-xl font-bold">رزرو مشاعات</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {amenities.map((x) => {
          const Icon = amenityIcon(x.icon)
          return (
            <button key={x.id} className="hm-chip !min-h-[44px] inline-flex items-center justify-center gap-2" data-on={x.id === a?.id} onClick={() => setAm(x.id)}>
              {x.locked ? <Lock size={18} /> : <Icon size={18} />}
              {x.name}
            </button>
          )
        })}
      </div>
      {locked && <DebtorLock debtor={perms?.debtor} child={child} />}
      {gated && (
        <button
          className="hm-card p-4 flex items-center gap-3 text-right min-h-[72px]"
          onClick={() => (a?.private_rules ? setRulesFor(a) : a && setAcked((m) => ({ ...m, [a.id]: true })))}
        >
          <span className="grid place-items-center w-12 h-12 rounded-2xl hm-tone-pri"><ShieldCheck size={24} /></span>
          <span className="flex-1 font-bold">رزرو خصوصی</span>
        </button>
      )}
      {!gated && <>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="روز">
        {days.map((d) => (
          <button key={d.iso} role="radio" aria-checked={day === d.i} data-on={day === d.i} className="hm-chip !min-h-[52px] !px-4 flex flex-col items-center justify-center leading-5" onClick={() => setDay(d.i)}>
            <span>{dayLabel(d.i, d.iso)}</span>
            <span className="text-[11px] font-medium opacity-80">{fullDayLabel(d.iso).split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>
      <div className="hm-card p-4">
        <p className="mb-3 text-sm font-bold">ساعت‌های آزاد</p>
        {!slots ? (
          <Loading />
        ) : closed ? (
          <p className="flex items-center gap-2 text-sm text-[var(--hm-t2)] py-2">
            <CalendarX2 size={18} /> این روز برای رزرو بسته است ({closed}). روز دیگری را انتخاب کنید.
          </p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-[var(--hm-t2)] py-2">برای این روز ساعتی تعریف نشده است.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const sel = slot?.hour === s.hour
              const taken = s.status === 'taken'
              const past = s.status === 'past'
              return (
                <button
                  key={s.hour}
                  aria-disabled={taken || past}
                  aria-pressed={sel}
                  onClick={() => (taken ? toast('این ساعت رزرو شده است') : past ? toast('این ساعت گذشته است') : setSlot(s))}
                  className="min-h-[48px] rounded-3xl text-sm font-bold py-1"
                  style={{
                    textDecoration: taken ? 'line-through' : 'none',
                    background: sel ? 'var(--hm-pri)' : taken || past ? 'transparent' : 'var(--lg4-inner)',
                    color: sel ? '#fff' : taken || past ? 'var(--hm-t3)' : 'var(--hm-t1)',
                    border: `1px solid ${sel ? 'var(--hm-pri)' : 'var(--lg4-card-border)'}`,
                    opacity: past ? 0.55 : 1,
                  }}
                >
                  {fa(s.label)}
                  {s.gender && <span className="block text-[11px] font-medium opacity-80">{GENDER_LABEL[s.gender]}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      </>}

      {!child && mine && mine.length > 0 && (
        <>
          <p className="text-sm font-bold">رزروهای من</p>
          <div className="hm-card px-4 py-1 hm-divided">
            {mine.slice(0, 8).map((r) => {
              const upcoming = new Date(r.end_at).getTime() > Date.now() && (r.status === 'pending' || r.status === 'confirmed')
              return (
                <div key={r.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{r.amenity}</p>
                    <p className="mt-0.5 text-xs text-[var(--hm-t2)]">
                      {whenLabel(r.start_at, r.end_at)}
                      {r.reject_reason ? ` · ${r.reject_reason}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].t}</Badge>
                  {upcoming && (
                    <button className="text-xs font-bold text-[var(--hm-bad)] min-h-[44px] px-2" onClick={() => setCancelFor(r)}>
                      لغو
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <Sheet open={!!rulesFor} onClose={() => setRulesFor(null)} label="قوانین رزرو خصوصی">
        <p className="text-lg font-bold">قوانین رزرو خصوصی</p>
        <p className="text-sm leading-7 mt-2 whitespace-pre-line">{rulesFor?.private_rules}</p>
        <Cta className="mt-4" onClick={() => { if (rulesFor) setAcked((m) => ({ ...m, [rulesFor.id]: true })); setRulesFor(null) }}>
          فهمیدم
        </Cta>
      </Sheet>

      <Sheet open={!!cancelFor} onClose={() => setCancelFor(null)} label="لغو رزرو">
        <p className="text-lg font-bold">لغو رزرو {cancelFor?.amenity}؟</p>
        <p className="text-sm text-[var(--hm-t2)] mt-1">{cancelFor ? whenLabel(cancelFor.start_at, cancelFor.end_at) : ''}</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button className="min-h-[48px] rounded-full hm-tone-mute font-bold text-sm" onClick={() => setCancelFor(null)}>
            نگه‌داشتن
          </button>
          <button
            className="min-h-[48px] rounded-full hm-tone-bad font-bold text-sm"
            onClick={async () => {
              if (!cancelFor) return
              try {
                await amenitiesApi.cancelMine(cancelFor.id)
                toast('رزرو لغو شد')
                setCancelFor(null)
                void reloadMine(true)
                if (a) setSlots((await residentsApi.slots(a.id, days[day].iso)).slots)
              } catch (e) {
                toast(errText(e))
              }
            }}
          >
            بله، لغو شود
          </button>
        </div>
      </Sheet>

      {!gated && <StickyCta>
        <Cta
          onClick={gated && a ? () => (a.private_rules ? setRulesFor(a) : setAcked((m) => ({ ...m, [a.id]: true }))) : submit}
          busy={busy}
          disabled={!gated && (!slot || locked)}
        >
          {cta}
        </Cta>
      </StickyCta>}
      <SuccessSheet
        open={!!success}
        onClose={() => setSuccess(null)}
        title={success?.title ?? ''}
        sub={success?.sub}
        rows={success?.rows}
        cta="بازگشت به خانه"
        onCta={() => navigate(child ? '/child' : '/resident')}
      />
      {toastNode}
    </div>
  )
}

export function ResidentBook() {
  return <BookAmenity />
}
