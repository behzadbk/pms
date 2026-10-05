import { useEffect, useMemo, useState } from 'react'
import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react'
import { amenitiesApi, type Board, type BoardAmenity, type BoardReservation, type DeskReservation } from '../../../lib/api/amenities'
import { errText, fa } from '../../../lib/api/residents'
import { amenityIcon } from '../../../lib/amenityIcons'
import { addDays, dayLabel, hourLabel, relDay, tehranParts, tehranToday } from '../../../lib/tehran'
import { Badge, Cta, ErrorBlock, IconTile, Loading, Sheet, useLoad } from '../../../components/hm'
import { ReasonSheet, ReservationCard, UnitPicker } from './parts'

/** برنامه‌ی روز: هر مشاع یک ردیف ساعتی — ساعت آزاد = ثبت دستی، ساعت پُر = جزئیات/تأیید/لغو */
export function BoardTab({ toast, onChanged }: { toast: (m: string) => void; onChanged: () => void }) {
  const [date, setDate] = useState(tehranToday())
  const { data, loading, error, reload } = useLoad<Board>(() => amenitiesApi.board(date), [date])
  const [manual, setManual] = useState<{ a: BoardAmenity; hour: number } | null>(null)
  const [detail, setDetail] = useState<{ a: BoardAmenity; r: BoardReservation } | null>(null)
  const [reasonFor, setReasonFor] = useState<{ id: string; kind: 'reject' | 'cancel' } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && void reload(true), 30_000)
    return () => window.clearInterval(t)
  }, [reload])

  const nowHour = useMemo(() => (date === tehranToday() ? tehranParts(new Date()).hour : -1), [date, data])
  const today = tehranToday()

  async function approve(id: string) {
    setBusy(true)
    try {
      await amenitiesApi.decide(id, true)
      toast('تأیید شد — اعلان برای ساکن ارسال شد')
      setDetail(null)
      await reload(true)
      onChanged()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hm-card flex items-center gap-2 p-2">
        <button className="hm-back" aria-label="روز قبل" disabled={date <= today} onClick={() => setDate(addDays(date, -1))}>
          <ChevronRight size={20} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-bold">{dayLabel(date, true)}</p>
          <p className="text-xs text-[var(--hm-t2)]">{relDay(date)}</p>
        </div>
        <button className="hm-back" aria-label="روز بعد" onClick={() => setDate(addDays(date, 1))}>
          <ChevronLeft size={20} />
        </button>
        {date !== today && (
          <button className="hm-chip" onClick={() => setDate(today)}>
            امروز
          </button>
        )}
      </div>

      <Legend />

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBlock message={error} retry={() => void reload()} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data!.amenities.map((a) => {
            const Icon = amenityIcon(a.icon)
            return (
              <section key={a.id} className="hm-card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <IconTile icon={Icon} tone={a.closed ? 'mute' : 'pri'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{a.name}</p>
                    <p className="text-xs text-[var(--hm-t2)]">{a.requires_approval ? 'با تأیید مسئول' : 'رزرو فوری'}</p>
                  </div>
                  {a.closed && <Badge tone="mute">{a.closed}</Badge>}
                </div>
                {a.closed ? (
                  <p className="flex items-center gap-2 text-sm text-[var(--hm-t2)]">
                    <CalendarX2 size={16} /> این روز برای رزرو بسته است.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {a.hours.map((h) => {
                      const r = a.reservations.find((x) => {
                        const s = tehranParts(x.start_at)
                        const e = tehranParts(x.end_at)
                        const eh = e.date > s.date || e.hour === 0 ? 24 : e.hour
                        return s.date === date ? h >= s.hour && h < eh : false
                      })
                      const past = h <= nowHour || date < today
                      if (r) {
                        return (
                          <button key={h} onClick={() => setDetail({ a, r })} className={`min-h-[52px] rounded-2xl px-2 text-center ${r.status === 'pending' ? 'hm-tone-warn' : 'hm-tone-ok'}`}>
                            <span className="block text-sm font-bold">{hourLabel(h)}</span>
                            <span className="block text-[11px] opacity-90">واحد {fa(r.unit_no ?? '—')}</span>
                          </button>
                        )
                      }
                      return (
                        <button
                          key={h}
                          disabled={past}
                          onClick={() => setManual({ a, hour: h })}
                          className="min-h-[52px] rounded-2xl text-sm font-bold border border-dashed border-[color-mix(in_srgb,var(--hm-t3)_55%,transparent)] text-[var(--hm-t1)] disabled:opacity-40"
                        >
                          {hourLabel(h)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <ManualSheet
        target={manual}
        date={date}
        onClose={() => setManual(null)}
        onDone={async () => {
          setManual(null)
          toast('رزرو ثبت شد — اعلان برای واحد ارسال شد')
          await reload(true)
          onChanged()
        }}
      />

      <Sheet open={!!detail} onClose={() => setDetail(null)} label="جزئیات رزرو">
        {detail && (
          <ReservationCard
            r={toDesk(detail.a, detail.r)}
            busy={busy}
            onApprove={() => void approve(detail.r.id)}
            onReject={() => setReasonFor({ id: detail.r.id, kind: 'reject' })}
            onCancel={() => setReasonFor({ id: detail.r.id, kind: 'cancel' })}
          />
        )}
      </Sheet>
      <ReasonSheet
        open={!!reasonFor}
        required={reasonFor?.kind === 'reject'}
        title={reasonFor?.kind === 'reject' ? 'دلیل عدم تأیید' : 'لغو رزرو'}
        sub="ساکن همین متن را در اعلان می‌بیند."
        cta={reasonFor?.kind === 'reject' ? 'ثبت و اطلاع به ساکن' : 'لغو و اطلاع به ساکن'}
        onClose={() => setReasonFor(null)}
        onSubmit={async (reason) => {
          if (!reasonFor) return
          if (reasonFor.kind === 'reject') await amenitiesApi.decide(reasonFor.id, false, reason)
          else await amenitiesApi.cancel(reasonFor.id, reason || undefined)
          setReasonFor(null)
          setDetail(null)
          toast('انجام شد — ساکن مطلع شد')
          await reload(true)
          onChanged()
        }}
      />
    </div>
  )
}

function toDesk(a: BoardAmenity, r: BoardReservation): DeskReservation {
  return { ...r, reject_reason: null, created_at: r.start_at, decided_at: null, amenity: a.name, icon: a.icon }
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-[var(--hm-t2)] flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <i className="w-3 h-3 rounded border border-dashed border-[var(--hm-t3)]" /> آزاد
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="w-3 h-3 rounded hm-tone-warn" /> در انتظار تأیید
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="w-3 h-3 rounded hm-tone-ok" /> قطعی
      </span>
    </div>
  )
}

function ManualSheet({ target, date, onClose, onDone }: { target: { a: BoardAmenity; hour: number } | null; date: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [unit, setUnit] = useState<{ id: string; no: string } | null>(null)
  const [hours, setHours] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (target) {
      setUnit(null)
      setHours(1)
      setErr('')
    }
  }, [target])
  async function go() {
    if (!target || !unit) return setErr('واحد را انتخاب کنید')
    setBusy(true)
    try {
      await amenitiesApi.bookManual({
        amenity_id: target.a.id,
        start: `${date}T${String(target.hour).padStart(2, '0')}:00:00+03:30`,
        hours,
        unit_id: unit.id,
      })
      await onDone()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const maxH = Math.min(target?.a.max_hours ?? 1, Math.max(1, (target?.a.hours.filter((h) => h >= (target?.hour ?? 0)).length ?? 1)))
  return (
    <Sheet open={!!target} onClose={onClose} label="ثبت دستی رزرو">
      {target && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-lg font-bold">ثبت دستی رزرو</p>
            <p className="text-sm text-[var(--hm-t2)] mt-1">
              {target.a.name} · {dayLabel(date)} · {hourLabel(target.hour)} — برای هماهنگی تلفنی یا حضوری؛ رزرو بلافاصله قطعی می‌شود.
            </p>
          </div>
          <UnitPicker value={unit} onChange={setUnit} />
          {maxH > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm">مدت</span>
              <div className="flex gap-2">
                {Array.from({ length: maxH }, (_, i) => i + 1).map((h) => (
                  <button key={h} className="hm-chip" data-on={hours === h} onClick={() => setHours(h)}>
                    {fa(h)} ساعت
                  </button>
                ))}
              </div>
            </div>
          )}
          {err && <p className="text-xs text-[var(--hm-bad)]">{err}</p>}
          <Cta busy={busy} onClick={go}>
            ثبت رزرو قطعی
          </Cta>
        </div>
      )}
    </Sheet>
  )
}
