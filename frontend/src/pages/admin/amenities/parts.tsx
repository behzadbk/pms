import { useEffect, useState, type ReactNode } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { amenitiesApi, type DeskReservation, type ReservationStatus } from '../../../lib/api/amenities'
import { errText, fa } from '../../../lib/api/residents'
import { amenityIcon } from '../../../lib/amenityIcons'
import { whenLabel } from '../../../lib/tehran'
import { ago } from '../../../lib/api/residents'
import { Badge, Cta, IconTile, Sheet } from '../../../components/hm'

export const STATUS: Record<ReservationStatus, { t: string; tone: 'ok' | 'warn' | 'bad' | 'mute' }> = {
  confirmed: { t: 'قطعی', tone: 'ok' },
  pending: { t: 'در انتظار تأیید', tone: 'warn' },
  rejected: { t: 'رد شد', tone: 'bad' },
  cancelled: { t: 'لغو شد', tone: 'mute' },
}

const REJECT_PRESETS = ['ظرفیت این ساعت تکمیل است', 'در این ساعت مراسم یا تعمیرات داریم', 'قوانین استفاده از مشاع رعایت نشده', 'درخواست تکراری است']

/** کارت یک درخواست رزرو (صف درخواست‌ها و جزئیات روی برنامه‌ی روز) */
export function ReservationCard({
  r,
  onApprove,
  onReject,
  onCancel,
  busy,
}: {
  r: DeskReservation
  onApprove?: () => void
  onReject?: () => void
  onCancel?: () => void
  busy?: boolean
}) {
  const st = STATUS[r.status]
  const Icon = amenityIcon(r.icon)
  const upcoming = new Date(r.end_at).getTime() > Date.now()
  return (
    <article className="hm-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Icon} tone={r.status === 'pending' ? 'warn' : r.status === 'confirmed' ? 'ok' : 'mute'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-[15px]">{r.amenity}</p>
            <Badge tone={st.tone}>{st.t}</Badge>
            {r.source === 'manual' && <Badge tone="pri">ثبت دستی</Badge>}
          </div>
          <p className="mt-1 text-sm text-[var(--hm-t1)]">{whenLabel(r.start_at, r.end_at)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-[var(--hm-t2)] flex-wrap">
        <span className="hm-unitno whitespace-nowrap">واحد {fa(r.unit_no ?? '—')}</span>
        {r.requester && <span>{r.requester}</span>}
        <span className="ms-auto">{r.status === 'pending' ? `ثبت ${ago(r.created_at)}` : r.decided_at ? ago(r.decided_at) : ''}</span>
      </div>
      {r.status === 'rejected' && r.reject_reason && <p className="text-xs rounded-xl px-3 py-2 hm-tone-bad leading-6">دلیل: {r.reject_reason}</p>}
      {r.status === 'cancelled' && r.reject_reason && <p className="text-xs rounded-xl px-3 py-2 hm-tone-mute leading-6">{r.reject_reason}</p>}
      {r.status === 'pending' && onApprove && onReject && (
        <div className="grid grid-cols-2 gap-2">
          <button className="lg4-capsule min-h-[44px] text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60" disabled={busy} onClick={onApprove}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            تأیید
          </button>
          <button className="min-h-[44px] rounded-full text-sm font-bold hm-tone-bad disabled:opacity-60" disabled={busy} onClick={onReject}>
            رد کردن
          </button>
        </div>
      )}
      {r.status === 'confirmed' && upcoming && onCancel && (
        <button className="min-h-[44px] rounded-full text-sm font-bold hm-tone-mute disabled:opacity-60" disabled={busy} onClick={onCancel}>
          لغو رزرو
        </button>
      )}
    </article>
  )
}

/** برگه‌ی دلیل: برای «رد کردن» و «لغو» — ساکن همین متن را در اعلان می‌بیند */
export function ReasonSheet({
  open,
  title,
  sub,
  cta,
  required,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  sub: string
  cta: string
  required?: boolean
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setReason('')
      setErr('')
    }
  }, [open])
  async function go() {
    const r = reason.trim()
    if (required && r.length < 2) return setErr('دلیل را بنویسید یا یکی از گزینه‌ها را بزنید')
    setBusy(true)
    try {
      await onSubmit(r)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <p className="text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm text-[var(--hm-t2)] leading-7">{sub}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REJECT_PRESETS.map((p) => (
          <button key={p} className="hm-chip" data-on={reason === p} onClick={() => setReason(p)}>
            {p}
          </button>
        ))}
      </div>
      <textarea
        className="hm-card mt-3 w-full p-3 text-sm bg-transparent outline-none min-h-[88px] resize-none"
        placeholder="توضیح برای ساکن (اختیاری برای لغو)"
        maxLength={200}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value)
          setErr('')
        }}
      />
      {err && <p className="mt-2 text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta className="mt-3" busy={busy} onClick={go}>
        {cta}
      </Cta>
    </Sheet>
  )
}

/** انتخاب واحد با جست‌وجو (ثبت دستی رزرو) */
export function UnitPicker({ value, onChange }: { value: { id: string; no: string } | null; onChange: (u: { id: string; no: string }) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<{ id: string; no: string }[] | null>(null)
  useEffect(() => {
    let live = true
    const t = window.setTimeout(() => {
      amenitiesApi.units(q).then((r) => live && setList(r)).catch(() => live && setList([]))
    }, 200)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [q])
  return (
    <div>
      <label className="hm-card flex items-center gap-2 px-3 min-h-[44px]">
        <Search size={16} className="text-[var(--hm-t3)]" />
        <input className="flex-1 bg-transparent outline-none text-sm" inputMode="numeric" placeholder="شماره‌ی واحد" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
        {list === null && <Loader2 size={18} className="animate-spin text-[var(--hm-t3)]" />}
        {list?.length === 0 && <p className="text-xs text-[var(--hm-t2)]">واحدی پیدا نشد.</p>}
        {list?.map((u) => (
          <button key={u.id} className="hm-chip" data-on={value?.id === u.id} onClick={() => onChange(u)}>
            {fa(u.no)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <p className="text-xs text-[var(--hm-t2)] mt-0.5 leading-6">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function Stepper({ value, min, max, onChange, unit }: { value: number; min: number; max: number; onChange: (v: number) => void; unit: string }) {
  return (
    <div className="inline-flex items-center gap-3">
      <button className="hm-back" aria-label="کمتر" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="min-w-[72px] text-center text-sm font-bold">
        {fa(value)} {unit}
      </span>
      <button className="hm-back" aria-label="بیشتر" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}
