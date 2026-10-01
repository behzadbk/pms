import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CircleCheckBig, RefreshCw, TriangleAlert } from 'lucide-react'
import { residentsApi, ago, errText, fa, toman, type ChildRequest } from '../../../lib/api/residents'
import { formatJalali } from '../../../lib/jalali'
import { placeFnbOrder } from '../../../lib/store'
import { Avatar, EmptyState, ErrorBlock, Loading, PageHeader, useLoad, useToast } from '../../../components/hm'

/** C4 — ورود کودک روی گوشی/تبلت خودش با QR یا کد ۶ رقمی (یک‌بارمصرف، ۵ دقیقه) */
export function ResidentChildLogin() {
  const { id = '' } = useParams()
  const [name, setName] = useState('')
  const [code, setCode] = useState<{ code: string; qr_token: string; subdomain: string; expires_at: string } | null>(null)
  const [left, setLeft] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const issue = useCallback(async () => {
    setErr(null)
    try {
      setCode(await residentsApi.loginCode(id))
    } catch (e) {
      setErr(errText(e))
    }
  }, [id])

  useEffect(() => {
    residentsApi.parentControl(id).then((p) => setName(p.name)).catch(() => undefined)
    void issue()
  }, [id, issue])

  useEffect(() => {
    if (!code) return
    const tick = () => setLeft(Math.max(0, Math.round((new Date(code.expires_at).getTime() - Date.now()) / 1000)))
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [code])

  const steps = [
    `اپ همینو را روی گوشی یا تبلت ${name || 'فرزندتان'} نصب کنید`,
    'در صفحه‌ی ورود «ورود با کد خانواده» را بزنید',
    'این کد را اسکن کنید؛ نیازی به شماره موبایل نیست',
  ]
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col items-center gap-4 hm-fade-in">
      <div className="self-stretch">
        <PageHeader title={`ورود ${name} روی گوشی خودش`} back close />
      </div>
      {err && <ErrorBlock message={err} retry={issue} />}
      {code && (
        <>
          <div className="p-5 mt-4 rounded-3xl bg-white" style={{ boxShadow: 'var(--lg4-shadow)', opacity: left ? 1 : 0.25 }}>
            {/* لینک وب: با دوربین معمولی گوشی هم باز می‌شود و مستقیم وارد اپ کودک می‌شود */}
            <QRCodeSVG value={`${window.location.origin}/family-login?t=${encodeURIComponent(code.subdomain)}&k=${code.qr_token}`} size={189} level="M" />
          </div>
          {left > 0 ? (
            <p className="text-sm font-bold text-[var(--hm-warn)]">اعتبار کد: {fa(mmss)} · یک‌بار مصرف</p>
          ) : (
            <button className="hm-chip inline-flex items-center gap-1" onClick={issue}>
              <RefreshCw size={14} /> کد تازه
            </button>
          )}
          <p className="text-xs text-[var(--hm-t2)]">یا کد عددی را وارد کنید</p>
          <p className="text-[28px] font-bold tracking-[4px]" dir="ltr">
            {code.code.slice(0, 3)} {code.code.slice(3)}
          </p>
        </>
      )}
      <div className="hm-card self-stretch p-4 flex flex-col gap-3">
        {steps.map((t, i) => (
          <div key={i} className="flex gap-3 items-center">
            <span className="hm-avatar hm-tone-pri" style={{ width: 28, height: 28, fontSize: 12 }}>
              {fa(i + 1)}
            </span>
            <p className="text-xs leading-6">{t}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** C5 — برگه‌ی تأیید درخواست کودک (از اعلان یا فهرست) */
export function ResidentChildRequests() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useLoad<ChildRequest[]>(() => residentsApi.childRequests('pending'), [])
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()

  const list = (data ?? []).filter((r) => !id || r.id === id)

  async function decide(r: ChildRequest, approve: boolean) {
    setBusy(true)
    try {
      await residentsApi.decideChild(r.id, approve)
      if (approve && r.type === 'order' && r.payload.items?.length) {
        // سفارش تأییدشده وارد صف آشپزخانه/کافی‌شاپ می‌شود
        const items = r.payload.items.map((i, k) => ({ itemId: i.id ?? `child-${k}`, name: i.n, quantity: i.q, unitPrice: i.p ?? 0, lineTotal: (i.p ?? 0) * i.q }))
        placeFnbOrder({
          venueId: r.payload.venueId ?? 'v1',
          venueName: r.payload.venue ?? 'رستوران ساختمان',
          deliveryType: 'in_unit',
          destinationLabel: r.payload.destination ?? `${r.child_name} · واحد`,
          billing: 'monthly_charge',
          items,
          subtotal: r.amount ?? 0,
          total: r.amount ?? 0,
          prepTimeMinutes: 25,
        })
      }
      toast(approve ? (r.type === 'order' ? 'سفارش تأیید شد و به آشپزخانه رفت' : 'درخواست تأیید شد') : `درخواست رد شد · به ${r.child_name} اطلاع داده شد`)
      await reload(true)
      if (id) window.setTimeout(() => navigate('/resident/family'), 900)
    } catch (e) {
      toast(errText(e))
      await reload(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageHeader title="درخواست‌های کودک" back="/resident/family" />
      {loading && !data && <Loading />}
      {error && <ErrorBlock message={error} retry={() => reload()} />}
      {data && list.length === 0 && <EmptyState icon={CircleCheckBig} title={id ? 'این درخواست دیگر باز نیست' : 'درخواستی در انتظار نیست'} sub="درخواست‌های کودک بعد از ۳۰ دقیقه خودکار لغو می‌شوند" />}
      {list.map((r) => {
        const items = r.payload.items ?? []
        return (
          <div key={r.id} className="hm-card p-4 flex flex-col gap-3" style={{ borderRadius: 24 }}>
            <div className="flex items-center gap-3">
              <Avatar initial={r.child_name.trim()[0] ?? '؟'} tone="acc" />
              <div className="flex-1">
                <p className="text-base font-bold">{r.title}</p>
                <p className="mt-0.5 text-xs text-[var(--hm-t2)]">
                  {r.type === 'order' ? r.payload.venue ?? 'سفارش' : r.type === 'amenity' ? r.payload.amenity : ''} · {ago(r.created_at)}
                </p>
              </div>
            </div>
            {r.type === 'order' && (
              <div className="rounded-2xl px-4 hm-divided" style={{ background: 'var(--lg4-card)', border: '1px solid var(--lg4-card-border)' }}>
                {items.map((i, k) => (
                  <div key={k} className="flex py-2.5 text-sm">
                    <span className="flex-1">
                      {i.n} × {fa(i.q)}
                    </span>
                    {i.p !== undefined && <span className="font-bold">{toman(i.p * i.q)}</span>}
                  </div>
                ))}
                <div className="flex py-2.5 text-sm font-bold">
                  <span className="flex-1">جمع</span>
                  <span>{toman(r.amount ?? 0)} تومان</span>
                </div>
              </div>
            )}
            {r.type === 'amenity' && r.payload.start && (
              <div className="hm-row">
                <span className="text-sm font-bold">
                  {r.payload.amenity} · {formatJalali(r.payload.start, false)} ساعت{' '}
                  {fa(new Date(r.payload.start).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))}
                </span>
              </div>
            )}
            {r.over_cap_by > 0 && (
              <div className="hm-note hm-tone-warn">
                <TriangleAlert size={18} className="shrink-0" />
                <span className="font-bold">
                  {toman(r.over_cap_by)} تومان بیشتر از مانده‌ی سقف این ماه ({toman(r.credit.remaining)})
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <button className="hm-cta-ghost flex-1" disabled={busy} onClick={() => decide(r, false)}>
                رد
              </button>
              <button className="lg4-capsule flex-[2] min-h-[52px] text-sm font-bold" disabled={busy} onClick={() => decide(r, true)}>
                {r.type === 'order' ? 'تأیید همین سفارش' : 'تأیید'}
              </button>
            </div>
            {r.type === 'order' && (
              <button className="text-center text-xs font-bold text-[var(--hm-pri)]" onClick={() => navigate(`/resident/family/${r.child_membership_id}/parent`)}>
                افزایش سقف ماهانه
              </button>
            )}
          </div>
        )
      })}
      {toastNode}
    </div>
  )
}
