import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, Dumbbell, Info, Trees, Users, Waves, type LucideIcon } from 'lucide-react'
import { ApiError } from '../../lib/api/client'
import { residentsApi, errText, fa, type Amenity, type ReservationRow, type Slot } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { Badge, Cta, ErrorBlock, Loading, Seg, StickyCta, SuccessSheet, useLoad, useToast } from '../../components/hm'

const ICONS: Record<string, LucideIcon> = { pool: Waves, groups: Users, deck: Trees, fitness_center: Dumbbell, movie: Clapperboard }
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

/** تاریخ امروز به وقت تهران + n روز (YYYY-MM-DD) */
function tehranDate(plus: number) {
  const base = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
  const d = new Date(base + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + plus)
  return d.toISOString().slice(0, 10)
}
function dayLabel(i: number, iso: string) {
  if (i === 0) return 'امروز'
  if (i === 1) return 'فردا'
  return WEEKDAYS[new Date(iso + 'T12:00:00Z').getUTCDay()]
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
  const { data: amenities, error, loading } = useLoad<Amenity[]>(() => residentsApi.amenities(), [])
  const { data: mine, reload: reloadMine } = useLoad<ReservationRow[]>(() => residentsApi.myReservations().catch(() => []), [])
  const [am, setAm] = useState<string>('')
  const [day, setDay] = useState(0)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<{ title: string; sub: string; rows: { k: string; v: string }[] } | null>(null)
  const { toast, toastNode } = useToast()
  const days = useMemo(() => [0, 1, 2, 3].map((i) => ({ i, iso: tehranDate(i) })), [])
  const a = amenities?.find((x) => x.id === am) ?? amenities?.[0]

  useEffect(() => {
    if (!a) return
    setSlot(null)
    setSlots(null)
    residentsApi
      .slots(a.id, days[day].iso)
      .then((r) => setSlots(r.slots))
      .catch((e) => toast(errText(e)))
  }, [a, day, days, toast])

  async function submit() {
    if (!a || !slot) return toast('یک ساعت آزاد انتخاب کنید')
    setBusy(true)
    try {
      const r = await residentsApi.book({ amenity_id: a.id, start: slot.start })
      const when = `${dayLabel(day, days[day].iso)} ${fa(slot.label)}`
      if (r.status === 'pending_parent') {
        navigate(`/child/waiting/${r.id}`, { state: { what: `${a.name} · ${when}` } })
        return
      }
      setSuccess({
        title: r.status === 'pending' ? 'درخواست رزرو ثبت شد' : 'رزرو قطعی شد',
        sub: r.status === 'pending' ? 'پس از تأیید مسئول مشاعات اعلان می‌گیرید.' : 'در «رزروهای من» در صفحه خانه دیده می‌شود.',
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
  const cta = slot ? (a?.needs_approval ? `ارسال درخواست رزرو · ${fa(slot.label)}` : `رزرو قطعی · ${fa(slot.label)}`) : 'یک ساعت انتخاب کنید'

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <p className="text-xl font-bold">رزرو مشاعات</p>
      <div className="grid grid-cols-2 gap-2">
        {amenities.map((x) => {
          const Icon = ICONS[x.icon ?? ''] ?? Waves
          return (
            <button key={x.id} className="hm-chip !min-h-[44px] inline-flex items-center justify-center gap-2" data-on={x.id === a?.id} onClick={() => setAm(x.id)}>
              <Icon size={18} />
              {x.name}
            </button>
          )
        })}
      </div>
      {a && (
        <div className="hm-note hm-tone-pri" style={{ color: 'var(--hm-t1)', borderRadius: 16 }}>
          <Info size={18} className="shrink-0 text-[var(--hm-pri)]" />
          <p>
            {a.rule_text ?? (a.needs_approval ? 'نیاز به تأیید مسئول مشاعات' : 'رزرو فوری، بدون نیاز به تأیید')}
          </p>
        </div>
      )}
      <Seg<string> options={days.map((d) => [String(d.i), dayLabel(d.i, d.iso)])} value={String(day)} onChange={(v) => setDay(Number(v))} />
      <div className="hm-card p-4">
        <p className="mb-3 text-sm font-bold">ساعت‌های آزاد</p>
        {!slots ? (
          <Loading />
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
                  className="min-h-[44px] rounded-full text-sm font-bold"
                  style={{
                    textDecoration: taken ? 'line-through' : 'none',
                    background: sel ? 'var(--hm-pri)' : taken || past ? 'transparent' : 'var(--lg4-inner)',
                    color: sel ? '#fff' : taken || past ? 'var(--hm-t3)' : 'var(--hm-t1)',
                    border: `1px solid ${sel ? 'var(--hm-pri)' : 'var(--lg4-card-border)'}`,
                    opacity: past ? 0.55 : 1,
                  }}
                >
                  {fa(s.label)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!child && mine && mine.length > 0 && (
        <>
          <p className="text-sm font-bold">رزروهای من</p>
          <div className="hm-card px-4 py-1 hm-divided">
            {mine.slice(0, 8).map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{r.amenity}</p>
                  <p className="mt-0.5 text-xs text-[var(--hm-t2)]">
                    {formatJalali(r.start_at, false)} ·{' '}
                    {new Date(r.start_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })}
                    {r.reject_reason ? ` · ${r.reject_reason}` : ''}
                  </p>
                </div>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].t}</Badge>
              </div>
            ))}
          </div>
        </>
      )}

      <StickyCta>
        <Cta onClick={submit} busy={busy} disabled={!slot}>
          {cta}
        </Cta>
      </StickyCta>
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
