import { useState } from 'react'
import { CalendarCheck2 } from 'lucide-react'
import { residentsApi, errText, fa, type ReservationRow } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { EmptyState, ErrorBlock, Loading, Sheet, Cta, useLoad, useToast } from '../hm'

const REASONS = ['استخر در حال تعمیر است', 'سانس برای جلسه‌ی ساختمان رزرو شده', 'سقف رزرو ماهانه‌ی واحد تکمیل است', 'بدهی شارژ تسویه نشده']

/**
 * صف درخواست‌های رزرو روی سرور (facility-svc) — رزرو مشاعی که «نیاز به تأیید» دارد
 * اینجا برای مسئول مشاعات و مدیر می‌آید: تأیید، یا عدم تأیید با دلیل آماده یا دلخواه.
 */
export function ReservationQueue() {
  const { data, error, loading, reload } = useLoad<ReservationRow[]>(() => residentsApi.reservationQueue('pending'), [])
  const [rejecting, setRejecting] = useState<ReservationRow | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()

  async function decide(r: ReservationRow, approve: boolean, why?: string) {
    setBusy(true)
    try {
      await residentsApi.decideReservation(r.id, approve, why)
      toast(approve ? `رزرو ${r.amenity} تأیید شد` : 'عدم تأیید ثبت شد و به ساکن اعلان رفت')
      setRejecting(null)
      setReason('')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-bold">درخواست‌های رزرو منتظر تأیید</p>
      {loading && !data && <Loading />}
      {error && <ErrorBlock message={error} retry={() => reload()} />}
      {data && data.length === 0 && <EmptyState icon={CalendarCheck2} title="درخواستی در انتظار نیست" />}
      {data?.map((r) => (
        <div key={r.id} className="hm-row flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-bold">
              {r.amenity} · واحد {fa(r.unit_no ?? '—')}
            </p>
            <p className="mt-0.5 text-xs text-[var(--hm-t2)]">
              {formatJalali(r.start_at, false)} ساعت {new Date(r.start_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })}
              {r.requester ? ` · ${r.requester}` : ''}
              {r.source === 'child_request' ? ' · با تأیید والد' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="hm-cta-ghost !min-h-[40px] px-4" disabled={busy} onClick={() => setRejecting(r)}>
              عدم تایید
            </button>
            <button className="lg4-capsule min-h-[40px] px-5 text-sm font-bold" disabled={busy} onClick={() => decide(r, true)}>
              تأیید
            </button>
          </div>
        </div>
      ))}
      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} label="دلیل عدم تایید">
        <p className="mx-2 mb-3 text-base font-bold">دلیل عدم تایید</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {REASONS.map((x) => (
            <button key={x} className="hm-chip" data-on={reason === x} onClick={() => setReason(x)}>
              {x}
            </button>
          ))}
        </div>
        <textarea className="hm-card w-full p-4 text-sm min-h-[90px] outline-none mb-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل دلخواه" />
        <Cta busy={busy} disabled={reason.trim().length < 2} onClick={() => rejecting && decide(rejecting, false, reason.trim())}>
          ثبت عدم تایید
        </Cta>
      </Sheet>
      {toastNode}
    </section>
  )
}
