import { useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, Wallet, ShieldCheck } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { LiveCalendar } from '../../components/LiveCalendar'
import { myBookingCounts, toman } from '../../lib/mockData'
import { useStore, addReservation, defaultRule, DEMO_RESIDENT_UNIT } from '../../lib/store'
import { checkBookingRules } from '../../lib/bookingValidation'
import type { CalendarSlot } from '../../lib/types'

type FlowState = 'idle' | 'checking' | 'blocked' | 'confirm' | 'processing' | 'success'

export function ResidentReservations() {
  const { amenities: amenitiesList, rules, reservations } = useStore()
  const [activeId, setActiveId] = useState(amenitiesList[0]?.id ?? '')
  const [flow, setFlow] = useState<FlowState>('idle')
  const [violations, setViolations] = useState<string[]>([])
  const [pickedSlot, setPickedSlot] = useState<CalendarSlot | null>(null)
  const [depositRequired, setDepositRequired] = useState(0)
  const [needsApproval, setNeedsApproval] = useState(false)

  const amenity = amenitiesList.find((a) => a.id === activeId) ?? amenitiesList[0]
  const rule = amenity ? rules[amenity.id] ?? defaultRule(amenity.id) : defaultRule('')
  const mine = reservations.filter((r) => r.unit === DEMO_RESIDENT_UNIT)

  function handleSelectSlot(slot: CalendarSlot, dayIndex: number) {
    setPickedSlot(slot)
    setFlow('checking')

    // اجرای الگوریتم بررسی قوانین رزرو هوشمند (lib/bookingValidation.ts)
    const result = checkBookingRules({
      rule,
      amenity,
      slot,
      existingBookingsThisPeriod: myBookingCounts[activeId] ?? 0,
      dayOffsetFromToday: dayIndex,
    })

    setTimeout(() => {
      if (!result.ok) {
        setViolations(result.violations)
        setFlow('blocked')
      } else {
        setDepositRequired(result.depositRequired)
        setNeedsApproval(result.requiresApproval)
        setFlow('confirm')
      }
    }, 500)
  }

  function confirmBooking() {
    if (pickedSlot && amenity) {
      const h = pickedSlot.startHour
      const fa = (n: number) => `${n.toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}:۰۰`
      addReservation({
        amenityId: amenity.id,
        amenity: amenity.name,
        unit: DEMO_RESIDENT_UNIT,
        date: new Date().toLocaleDateString('fa-IR'),
        time: `${fa(h)} - ${fa(h + 1)}`,
        status: needsApproval ? 'pending' : 'confirmed',
        source: 'app',
      })
    }
    setFlow('processing')
    setTimeout(() => setFlow('success'), 1300)
  }

  function reset() {
    setFlow('idle')
    setPickedSlot(null)
    setViolations([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">رزرو مشاعات</h1>
        <p className="text-muted text-sm mt-1">تقویم زنده مشاعات را ببینید و بر اساس قوانین فعال هر فضا رزرو کنید</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {amenitiesList.map((a) => (
          <button
            key={a.id}
            onClick={() => { setActiveId(a.id); reset() }}
            className={`px-4 py-2.5 rounded-xl text-sm border transition-colors ${
              activeId === a.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`تقویم «${amenity.name}»`}
            action={
              <span className="text-xs text-muted">
                رزرو شما در این ماه: {myBookingCounts[activeId] ?? 0} از {rule.maxBookingsPerUnitPerPeriod}
              </span>
            }
          />
          <div className="px-5 pb-5">
            <LiveCalendar amenity={amenity} onSelectSlot={handleSelectSlot} />
          </div>
        </Card>

        <Card>
          <CardHeader title="وضعیت رزرو" />
          <div className="px-5 pb-6 min-h-[220px] flex flex-col items-center justify-center text-center gap-3">
            {flow === 'idle' && <p className="text-sm text-muted">یک بازه خالی از تقویم انتخاب کنید</p>}

            {flow === 'checking' && (
              <>
                <Loader2 size={30} className="text-tile animate-spin" />
                <p className="text-sm text-muted">در حال بررسی قوانین رزرو...</p>
              </>
            )}

            {flow === 'blocked' && (
              <>
                <AlertTriangle size={36} className="text-bad" />
                <p className="font-semibold text-bad text-sm">این رزرو مجاز نیست</p>
                <ul className="text-xs text-bad/90 bg-bad-soft rounded-xl p-3 space-y-1.5 text-right">
                  {violations.map((v, i) => <li key={i}>• {v}</li>)}
                </ul>
                <button onClick={reset} className="text-xs font-medium text-tile hover:underline">انتخاب بازه دیگر</button>
              </>
            )}

            {flow === 'confirm' && pickedSlot && (
              <div className="w-full text-right space-y-3">
                <div className="flex items-center gap-2 text-good justify-center">
                  <CheckCircle2 size={20} />
                  <span className="text-sm font-medium">این بازه با قوانین مطابقت دارد</span>
                </div>
                <div className="text-sm bg-canvas rounded-xl p-3 space-y-1.5">
                  <p>ساعت {pickedSlot.startHour}:۰۰ — {amenity.name}</p>
                  {needsApproval && (
                    <p className="flex items-center gap-1.5 text-warn text-xs">
                      <ShieldCheck size={13} /> این رزرو تا تایید مدیر ساختمان «در انتظار» می‌ماند
                    </p>
                  )}
                  {depositRequired > 0 && (
                    <p className="flex items-center gap-1.5 text-xs">
                      <Wallet size={13} /> بیعانه لازم: {toman(depositRequired)}
                    </p>
                  )}
                </div>
                <button
                  onClick={confirmBooking}
                  className="w-full bg-tile text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90"
                >
                  {depositRequired > 0 ? 'پرداخت بیعانه و ثبت رزرو' : 'تایید نهایی رزرو'}
                </button>
              </div>
            )}

            {flow === 'processing' && (
              <>
                <Loader2 size={30} className="text-tile animate-spin" />
                <p className="text-sm text-muted">در حال ثبت رزرو...</p>
              </>
            )}

            {flow === 'success' && (
              <>
                <CheckCircle2 size={36} className="text-good" />
                <p className="font-semibold text-good text-sm">
                  {needsApproval ? 'درخواست رزرو ثبت شد' : 'رزرو با موفقیت انجام شد'}
                </p>
                <p className="text-xs text-muted">
                  {needsApproval ? 'پس از تایید مدیر ساختمان، اعلان دریافت خواهید کرد.' : 'یادآوری این رزرو در تقویم شما ثبت شد.'}
                </p>
                <button onClick={reset} className="text-xs font-medium text-tile hover:underline">رزرو جدید</button>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="رزروهای من" />
        <div className="px-5 pb-5 space-y-3">
          {mine.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-line">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.amenity}</p>
                  <p className="text-xs text-muted mt-0.5">{r.date} · {r.time}{r.source === 'manual' && ' · ثبت توسط مدیریت'}</p>
                </div>
                <StatusPill status={r.status} />
              </div>
              {r.status === 'rejected' && r.rejectReason && (
                <p className="text-xs text-bad bg-bad-soft rounded-lg px-3 py-2 mt-2">دلیل عدم تایید: {r.rejectReason}</p>
              )}
            </div>
          ))}
          {mine.length === 0 && <p className="text-sm text-muted text-center py-4">رزروی ندارید</p>}
        </div>
      </Card>
    </div>
  )
}
