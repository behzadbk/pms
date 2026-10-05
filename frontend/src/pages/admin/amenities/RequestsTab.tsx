import { useEffect, useState } from 'react'
import { Inbox } from 'lucide-react'
import { amenitiesApi, type DeskReservation, type ManagedAmenity } from '../../../lib/api/amenities'
import { errText } from '../../../lib/api/residents'
import { EmptyState, ErrorBlock, Loading, useLoad } from '../../../components/hm'
import { ReasonSheet, ReservationCard } from './parts'

const FILTERS: [string, string][] = [
  ['pending', 'در انتظار'],
  ['confirmed', 'قطعی'],
  ['rejected', 'رد شده'],
  ['cancelled', 'لغو شده'],
  ['all', 'همه'],
]

/** صف درخواست‌ها: تأیید / رد با دلیل / لغو — هر تصمیم برای رزروکننده اعلان (درون‌برنامه + پوش) می‌فرستد */
export function RequestsTab({ amenities, toast, onChanged }: { amenities: ManagedAmenity[]; toast: (m: string) => void; onChanged: () => void }) {
  const [status, setStatus] = useState('pending')
  const [amenity, setAmenity] = useState('')
  const { data, loading, error, reload } = useLoad<DeskReservation[]>(() => amenitiesApi.queue({ status, amenity_id: amenity || undefined }), [status, amenity])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reasonFor, setReasonFor] = useState<{ r: DeskReservation; kind: 'reject' | 'cancel' } | null>(null)

  // صف زنده: هر ۳۰ ثانیه و با برگشتن به برنامه تازه می‌شود
  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && void reload(true)
    const t = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [reload])

  async function approve(r: DeskReservation) {
    setBusyId(r.id)
    try {
      await amenitiesApi.decide(r.id, true)
      toast('تأیید شد — اعلان برای ساکن ارسال شد')
      await reload(true)
      onChanged()
    } catch (e) {
      toast(errText(e))
      void reload(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
        {FILTERS.map(([k, l]) => (
          <button key={k} className="hm-chip !min-h-[40px]" data-on={status === k} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
        <select
          aria-label="فیلتر مشاع"
          className="hm-chip !min-h-[40px] ms-auto"
          value={amenity}
          onChange={(e) => setAmenity(e.target.value)}
        >
          <option value="">همه‌ی مشاعات</option>
          {amenities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBlock message={error} retry={() => void reload()} />
      ) : !data?.length ? (
        <EmptyState icon={Inbox} title={status === 'pending' ? 'درخواستی در انتظار نیست' : 'موردی پیدا نشد'} sub={status === 'pending' ? 'درخواست‌های جدید همین‌جا و با اعلان روی گوشی می‌رسند.' : 'فیلتر دیگری را امتحان کنید.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => (
            <ReservationCard
              key={r.id}
              r={r}
              busy={busyId === r.id}
              onApprove={() => void approve(r)}
              onReject={() => setReasonFor({ r, kind: 'reject' })}
              onCancel={() => setReasonFor({ r, kind: 'cancel' })}
            />
          ))}
        </div>
      )}

      <ReasonSheet
        open={!!reasonFor}
        required={reasonFor?.kind === 'reject'}
        title={reasonFor?.kind === 'reject' ? 'دلیل عدم تأیید' : 'لغو رزرو'}
        sub={reasonFor ? `${reasonFor.r.amenity} · واحد ${reasonFor.r.unit_no ?? ''} — ساکن همین متن را در اعلان می‌بیند.` : ''}
        cta={reasonFor?.kind === 'reject' ? 'ثبت و اطلاع به ساکن' : 'لغو و اطلاع به ساکن'}
        onClose={() => setReasonFor(null)}
        onSubmit={async (reason) => {
          if (!reasonFor) return
          if (reasonFor.kind === 'reject') await amenitiesApi.decide(reasonFor.r.id, false, reason)
          else await amenitiesApi.cancel(reasonFor.r.id, reason || undefined)
          setReasonFor(null)
          toast(reasonFor.kind === 'reject' ? 'رد شد — اعلان برای ساکن ارسال شد' : 'رزرو لغو شد — ساکن مطلع شد')
          await reload(true)
          onChanged()
        }}
      />
    </div>
  )
}
