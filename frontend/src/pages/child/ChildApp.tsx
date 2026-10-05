import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Hourglass, IdCard, Megaphone, Minus, MoonStar, Package, Phone, Plus, Clock, UtensilsCrossed, Waves, Wrench, CircleCheck, CircleX, type LucideIcon } from 'lucide-react'
import { ApiError, api } from '../../lib/api/client'
import { residentsApi, errText, fa, toman, type OwnChildRequest } from '../../lib/api/residents'
import { usePermissions } from '../../context/PermissionsContext'
import { Cta, Loading, Seg, Sheet, useToast } from '../../components/hm'
import { BookAmenity } from '../resident/Book'

const fmtHour = (h?: string) => fa(String(Number((h ?? '22:00').split(':')[0])))

/** تماس اضطراری — همیشه، برای همه (قاعده ۱۱) */
export function useEmergency(toast: (m: string) => void) {
  return async () => {
    toast('در حال تماس با نگهبانی…')
    try {
      const r = await residentsApi.emergency()
      if (r.guard_phone) window.location.href = `tel:${r.guard_phone}`
    } catch (e) {
      toast(errText(e))
    }
  }
}

/** D1 — خانه‌ی کودک: اعتبار ماهانه + کاشی بخش‌های مجاز (بخش پنهان اصلاً کاشی ندارد) + تماس اضطراری */
export function ChildHome() {
  const { perms, refresh } = usePermissions()
  const navigate = useNavigate()
  // آخرین اطلاعیه‌ی عمومی از سرور (نه نظرسنجی)
  const [notice, setNotice] = useState<{ id: string; title: string } | undefined>()
  const [orderOpen, setOrderOpen] = useState(false)
  const [ticketOpen, setTicketOpen] = useState(false)
  const { toast, toastNode } = useToast()
  const sos = useEmergency(toast)

  const noticeAllowed = perms ? perms.modules.notice !== 'hidden' : false
  useEffect(() => {
    if (!noticeAllowed) return
    let alive = true
    api.get<{ id: string; title: string; kind: string }[]>('/notification/announcements')
      .then((rows) => alive && setNotice(rows.find((a) => a.kind !== 'poll')))
      .catch(() => undefined)
    return () => { alive = false }
  }, [noticeAllowed])

  if (!perms) return <Loading />
  if (perms.quiet.active) return <ChildQuiet />
  const m = perms.modules
  const credit = perms.credit ?? { cap: 0, spent: 0, remaining: 0 }
  const by = (lv: string) => (lv === 'approval' ? 'با تأیید بابا یا مامان' : '')

  async function request(type: 'guest' | 'ticket', payload: Record<string, unknown> = {}) {
    try {
      const r = await residentsApi.childRequest({ type, payload })
      if (r.status === 'pending' && r.request) navigate(`/child/waiting/${r.request.id}`, { state: { what: type === 'guest' ? 'کارت ورود مهمان' : 'درخواست تعمیر' } })
      return r
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) navigate('/child/quiet')
      else toast(errText(e))
      return null
    }
  }

  const tiles: { icon: LucideIcon; t: string; d: string; tone: string; on: () => void }[] = []
  if (m.food !== 'hidden') tiles.push({ icon: UtensilsCrossed, t: 'سفارش غذا', d: by(m.food) || 'تا سقف ماهانه', tone: 'acc', on: () => setOrderOpen(true) })
  if (m.amenity !== 'hidden') tiles.push({ icon: Waves, t: 'رزرو امکانات', d: by(m.amenity) || 'آزاد', tone: 'pri', on: () => navigate('/child/book') })
  if (m.guest !== 'hidden')
    tiles.push({
      icon: IdCard, t: 'کارت مهمان', d: by(m.guest) || 'آزاد', tone: 'ok',
      on: async () => {
        const r = await request('guest')
        if (r?.status === 'allowed') toast('کارت مهمان از میز لابی صادر می‌شود؛ اسم مهمان را به لابی‌من بگو')
      },
    })
  if (m.ticket !== 'hidden') tiles.push({ icon: Wrench, t: 'درخواست تعمیر', d: by(m.ticket) || 'آزاد', tone: 'pri', on: () => setTicketOpen(true) })
  if (m.parcel !== 'hidden') tiles.push({ icon: Package, t: 'مرسوله‌ها', d: 'در نگهبانی', tone: 'ok', on: () => toast('برای تحویل مرسوله به نگهبانی مراجعه کن') })
  tiles.push({ icon: Phone, t: 'تماس با نگهبانی', d: 'همیشه در دسترس', tone: 'bad', on: sos })


  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      {m.food !== 'hidden' && (
        <div className="lg4-hero p-5">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.85)' }}>
            اعتبار خرید این ماه
          </p>
          <p className="mt-2 text-[28px] font-bold">
            {toman(credit.remaining)} <span className="text-sm">تومان مانده</span>
          </p>
          <div className="mt-3 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.3)' }}>
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.round((credit.spent / Math.max(1, credit.cap)) * 100))}%` }} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((k) => (
          <button key={k.t} onClick={k.on} className="hm-card p-4 flex flex-col gap-3 text-right min-h-[132px]">
            <span className={`hm-icon-tile hm-tone-${k.tone} self-start`} style={{ borderRadius: 16 }}>
              <k.icon size={28} />
            </span>
            <span>
              <span className="block text-base font-bold">{k.t}</span>
              {k.d && <span className="block mt-1 text-xs text-[var(--hm-t2)]">{k.d}</span>}
            </span>
          </button>
        ))}
      </div>
      {notice && (
        <button className="hm-row" onClick={() => navigate('/child/announcements')}>
          <Megaphone size={22} className="text-[var(--hm-acc)] shrink-0" />
          <span className="flex-1 text-sm text-right">{notice.title}</span>
        </button>
      )}
      <ChildOrderSheet
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        onDone={async (msg) => {
          setOrderOpen(false)
          if (msg) toast(msg)
          await refresh()
        }}
      />
      <Sheet open={ticketOpen} onClose={() => setTicketOpen(false)} label="درخواست تعمیر">
        <TicketForm
          onSubmit={async (text) => {
            const r = await request('ticket', { text })
            setTicketOpen(false)
            if (r?.status === 'allowed') {
              try {
                await api.post('/facility/tickets', { kind: 'fault', subject: text.slice(0, 60), body: text, priority: 'normal' })
                toast('درخواست تعمیر ثبت شد')
              } catch (e) {
                toast(errText(e))
              }
            }
          }}
        />
      </Sheet>
      {toastNode}
    </div>
  )
}

function TicketForm({ onSubmit }: { onSubmit: (t: string) => Promise<void> }) {
  const [t, setT] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="mx-2 text-base font-bold">درخواست تعمیر</p>
      <textarea className="hm-card p-4 text-sm min-h-[110px] outline-none" value={t} onChange={(e) => setT(e.target.value)} placeholder="مثلاً لامپ اتاقم سوخته" />
      <Cta
        busy={busy}
        disabled={t.trim().length < 3}
        onClick={async () => {
          setBusy(true)
          await onSubmit(t.trim())
          setBusy(false)
        }}
      >
        ارسال
      </Cta>
    </div>
  )
}

/** سفارش کودک از منوی رستوران/کافی‌شاپ — تا سقف ماهانه مستقیم، وگرنه درخواست برای والد */
function ChildOrderSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg?: string) => void }) {
  const { perms } = usePermissions()
  const navigate = useNavigate()
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [venue, setVenue] = useState('')
  const [menu, setMenu] = useState<MenuRow[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setCart({})
    setErr(null)
    api.get<VenueRow[]>('/fnb/venues')
      .then((v) => {
        setVenues(v)
        setVenue((cur) => (v.some((x) => x.id === cur) ? cur : v[0]?.id ?? ''))
      })
      .catch((e) => setErr(errText(e)))
  }, [open])
  useEffect(() => {
    if (!open || !venue) return
    setCart({})
    api.get<{ items: MenuRow[] }>(`/fnb/venues/${venue}/menu`)
      .then((r) => setMenu(r.items.map((x) => ({ ...x, price: Number(x.price) }))))
      .catch((e) => setErr(errText(e)))
  }, [open, venue])
  const items = menu.filter((x) => x.availability !== 'hidden')
  const lines = menu.filter((x) => cart[x.id])
  const total = lines.reduce((s, x) => s + x.price * cart[x.id], 0)
  const remaining = perms?.credit?.remaining ?? 0
  const current = venues.find((v) => v.id === venue)
  const venueName = current?.name ?? 'رستوران ساختمان'
  const needsApproval = total > remaining || perms?.modules.food === 'approval'

  async function submit() {
    setBusy(true)
    setErr(null)
    const payload = {
      venue: venueName, venueId: venue, delivery_type: 'in_unit',
      destination: `${perms?.name ?? ''} · واحد ${fa(perms?.unit?.no ?? '')}`,
      items: lines.map((x) => ({ id: x.id, n: x.name, q: cart[x.id], p: x.price })),
    }
    try {
      if (!needsApproval) {
        // سفارش مستقیم: اول سفارش واقعی (باز بودن مجموعه/موجودی را سرور می‌سنجد)، بعد کسر از سقف ماهانه
        await api.post('/fnb/orders', { venue_id: venue, delivery_type: 'in_unit', items: lines.map((x) => ({ item_id: x.id, quantity: cart[x.id] })) }, { idempotencyKey: crypto.randomUUID() })
      }
      const r = await residentsApi.childRequest({ type: 'order', amount: total, payload })
      if (r.status === 'placed') {
        onDone(`سفارش ثبت شد · ${toman(total)} تومان`)
      } else if (r.request) {
        onDone()
        navigate(`/child/waiting/${r.request.id}`, { state: { what: lines.map((x) => x.name).join('، '), amount: total } })
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) {
        onDone()
        navigate('/child/quiet')
      } else setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="سفارش غذا">
      <div className="flex flex-col gap-3">
        <p className="mx-2 text-base font-bold">سفارش غذا</p>
        {venues.length > 1 && <Seg<string> options={venues.map((v) => [v.id, v.name] as [string, string])} value={venue} onChange={setVenue} />}
        {venues.length === 0 && !err && <p className="text-xs text-center text-[var(--hm-t2)]">مجموعه‌ای برای سفارش تعریف نشده است</p>}
        {current && !current.open_now && <p className="text-xs text-center font-bold text-[var(--hm-warn)]">«{current.name}» الان بسته است</p>}
        <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto">
          {items.map((x) => {
            const q = cart[x.id] ?? 0
            const sold = x.availability !== 'available'
            return (
              <div key={x.id} className="hm-row" style={{ opacity: sold ? 0.55 : 1 }}>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{x.name}</span>
                  <span className="block text-xs text-[var(--hm-t2)]">{sold ? 'ناموجود' : `${toman(x.price)} تومان`}</span>
                </span>
                {!sold && (
                  <span className="flex items-center gap-2">
                    {q > 0 && (
                      <button className="hm-back !w-8 !h-8" aria-label="کم کردن" onClick={() => setCart((c) => ({ ...c, [x.id]: q - 1 }))}>
                        <Minus size={16} />
                      </button>
                    )}
                    {q > 0 && <span className="text-sm font-bold w-4 text-center">{fa(q)}</span>}
                    <button className="hm-back !w-8 !h-8" aria-label="افزودن" onClick={() => setCart((c) => ({ ...c, [x.id]: q + 1 }))}>
                      <Plus size={16} />
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {total > 0 && (
          <p className="text-xs text-center text-[var(--hm-t2)]">
            جمع {toman(total)} تومان · مانده‌ی سقف این ماه {toman(remaining)}
            {needsApproval && ' · برای بابا یا مامان فرستاده می‌شود'}
          </p>
        )}
        {err && <p className="text-xs font-bold text-[var(--hm-bad)] text-center">{err}</p>}
        <Cta onClick={submit} busy={busy} disabled={total === 0}>
          {needsApproval ? 'ارسال برای تأیید' : 'ثبت سفارش'}
        </Cta>
      </div>
    </Sheet>
  )
}

interface VenueRow { id: string; name: string; kind: string; open_now: boolean }
interface MenuRow { id: string; name: string; price: number; availability: string }

/** D2 — منتظر تأیید والد (هر ۵ ثانیه وضعیت را می‌پرسد) */
export function ChildWaiting() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as { what?: string; amount?: number }
  const [req, setReq] = useState<OwnChildRequest | null>(null)
  const { refresh } = usePermissions()

  useEffect(() => {
    let alive = true
    const load = () =>
      residentsApi
        .myChildRequests()
        .then((l) => {
          if (!alive) return
          const r = l.find((x) => x.id === id) ?? null
          setReq(r)
          if (r && r.status !== 'pending') void refresh()
        })
        .catch(() => undefined)
    void load()
    const t = window.setInterval(load, 5000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [id, refresh])

  const what = useMemo(() => {
    if (state.what) return state.what
    const p = req?.payload
    return p?.items?.map((i) => i.n).join('، ') ?? p?.amenity ?? 'درخواست'
  }, [req, state.what])
  const amount = state.amount ?? req?.amount ?? null
  const status = req?.status ?? 'pending'
  const done = status !== 'pending'
  const Icon = status === 'approved' ? CircleCheck : status === 'pending' ? Hourglass : CircleX
  const color = status === 'approved' ? 'var(--hm-ok)' : status === 'pending' ? 'var(--hm-warn)' : 'var(--hm-bad)'
  const title = {
    pending: 'درخواستت برای بابا یا مامان فرستاده شد',
    approved: req?.type === 'order' ? 'تأیید شد! سفارشت به آشپزخانه رفت' : 'تأیید شد!',
    rejected: 'این بار تأیید نشد',
    expired: 'پاسخی نیامد و درخواست لغو شد',
  }[status]

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <div className="hm-card p-6 flex flex-col items-center text-center gap-3" style={{ borderRadius: 32 }}>
        <span className="hm-avatar" style={{ width: 104, height: 104, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          <Icon size={52} />
        </span>
        <p className="mt-4 text-xl font-bold">{title}</p>
        {!done && <p className="text-sm leading-8 text-[var(--hm-t2)]">وقتی تأیید کند، سفارش به آشپزخانه می‌رود و همین‌جا خبرت می‌کنیم.</p>}
        <div className="w-full hm-divided rounded-2xl px-4 text-right" style={{ background: 'var(--lg4-inner)' }}>
          <div className="flex py-3 gap-2">
            <span className="flex-1 text-sm">{what}</span>
            {amount !== null && <span className="text-sm font-bold">{toman(amount)}</span>}
          </div>
          {!done && (
            <div className="flex py-3 items-center gap-2">
              <Clock size={18} className="text-[var(--hm-warn)]" />
              <span className="flex-1 text-xs text-[var(--hm-t2)]">اگر تا ۳۰ دقیقه پاسخی نیاید، درخواست لغو می‌شود</span>
            </div>
          )}
        </div>
      </div>
      <Cta onClick={() => navigate('/child', { replace: true })}>باشه</Cta>
    </div>
  )
}

/** D3 — ساعت سکوت: سفارش و رزرو بسته، تماس اضطراری باز */
export function ChildQuiet() {
  const { perms } = usePermissions()
  const { toast, toastNode } = useToast()
  const sos = useEmergency(toast)
  const q = perms?.quiet.hours
  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <div className="hm-card p-6 flex flex-col items-center text-center gap-3" style={{ borderRadius: 32 }}>
        <span className="hm-avatar hm-tone-pri" style={{ width: 104, height: 104 }}>
          <MoonStar size={52} />
        </span>
        <p className="mt-4 text-xl font-bold">الان وقت استراحت است</p>
        <p className="text-sm leading-8 text-[var(--hm-t2)]">
          سفارش و رزرو از ساعت {fmtHour(q?.from)} تا {fmtHour(q?.to)} صبح بسته است.
        </p>
      </div>
      <button className="hm-cta-danger w-full" onClick={sos}>
        <Phone size={22} />
        تماس اضطراری با نگهبانی
      </button>
      <p className="text-center text-xs text-[var(--hm-t2)]">تماس اضطراری همیشه فعال است</p>
      {toastNode}
    </div>
  )
}

export function ChildBook() {
  const { perms } = usePermissions()
  if (perms?.quiet.active) return <ChildQuiet />
  return <BookAmenity child />
}
