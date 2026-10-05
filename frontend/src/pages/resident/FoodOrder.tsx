import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingBag, Receipt, ChefHat, Flame, BellRing, CheckCircle2, XCircle, Star,
  Building2, Minus, Plus, RotateCcw, UtensilsCrossed, Coffee, Clock, type LucideIcon,
} from 'lucide-react'
import { GlassCard, GlassPill, GlassSheet, GlassToast } from '../../components/ui/Glass'
import { EmptyState, ErrorBlock, Loading } from '../../components/hm'
import { fnbApi, type DeliveryZone, type MenuItem, type MenuResponse, type Order, type OrderStatus, type Venue } from '../../lib/api/fnb'
import { ago, errText, fa, toman } from '../../lib/api/residents'
import { zoneIcon } from '../../lib/foodIcons'

type Dest = 'unit' | 'zone'

const ORDER_STEPS: { label: string; icon: LucideIcon }[] = [
  { label: 'ثبت شد', icon: Receipt },
  { label: 'پذیرش آشپزخانه', icon: ChefHat },
  { label: 'در حال آماده‌سازی', icon: Flame },
  { label: 'آماده تحویل', icon: BellRing },
  { label: 'تحویل شد', icon: CheckCircle2 },
]

/** وضعیت سفارش در آشپزخانه → مرحله‌ی نمایش برای ساکن */
const STAGE_OF: Partial<Record<OrderStatus, number>> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 3,
  delivered: 4,
}
const LIVE: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery']
const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'ثبت شد', accepted: 'پذیرفته شد', preparing: 'در حال آماده‌سازی', ready: 'آماده تحویل',
  out_for_delivery: 'در راه', delivered: 'تحویل شد', rejected: 'پذیرفته نشد', cancelled: 'لغو شد',
}

const kindIcon = (k: Venue['kind']) => (k === 'cafe' ? Coffee : UtensilsCrossed)

export function ResidentFoodOrder() {
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const initialOrderPicked = useRef(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const loadAll = useCallback(async () => {
    try {
      const [v, z, o] = await Promise.all([fnbApi.venues(), fnbApi.zones(), fnbApi.myOrders()])
      setVenues(v)
      setZones(z.filter((x) => x.zone_type === 'amenity_zone'))
      setOrders(o)
      setVenueId((cur) => (cur && v.some((x) => x.id === cur) ? cur : v[0]?.id ?? null))
      // اگر سفارش در جریانی دارد، مستقیم صفحه‌ی پیگیری را نشان بده
      if (!initialOrderPicked.current) {
        initialOrderPicked.current = true
        const live = o.find((x) => LIVE.includes(x.status))
        if (live) setOrderId(live.id)
      }
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت اطلاعات ناموفق بود'))
    }
  }, [])
  useEffect(() => { void loadAll() }, [loadAll])

  // پیگیری زنده: هر ۱۰ ثانیه وضعیت سفارش‌ها
  useEffect(() => {
    const t = setInterval(() => {
      fnbApi.myOrders().then(setOrders).catch(() => undefined)
    }, 10_000)
    return () => clearInterval(t)
  }, [])

  const order = orders.find((o) => o.id === orderId) ?? null

  if (error && !venues) return <ErrorBlock message={error} retry={loadAll} />
  if (!venues) return <Loading />

  if (order) {
    return (
      <>
        <OrderTracking
          order={order}
          onNew={() => setOrderId(null)}
          onCancel={async () => {
            try {
              await fnbApi.cancelOrder(order.id)
              showToast('سفارش لغو شد')
              await loadAll()
            } catch (e) {
              showToast(errText(e, 'لغو سفارش ممکن نشد'))
            }
          }}
        />
        <GlassToast message={toast} />
      </>
    )
  }

  const venue = venues.find((v) => v.id === venueId) ?? null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">سفارش غذا و کافی‌شاپ</h1>
        <p className="text-[var(--lg-text-secondary)] text-sm mt-1">سفارش از رستوران و کافی‌شاپ داخل مجتمع — تحویل به واحد یا مشاعات</p>
      </div>

      {venues.length === 0 || !venue ? (
        <EmptyState icon={UtensilsCrossed} tone="mute" title="هنوز رستورانی تعریف نشده" sub="وقتی مدیر ساختمان رستوران یا کافی‌شاپ را اضافه کند، منو اینجا نمایش داده می‌شود." />
      ) : (
        <VenueOrdering
          key={venue.id}
          venues={venues}
          venue={venue}
          zones={zones}
          recent={orders}
          onPickVenue={setVenueId}
          onOpenOrder={setOrderId}
          onPlaced={async (o) => {
            setOrderId(o.id)
            setOrders((prev) => [o, ...prev.filter((x) => x.id !== o.id)])
            showToast('سفارش شما ثبت شد')
          }}
          toast={showToast}
        />
      )}
      <GlassToast message={toast} />
    </div>
  )
}

function VenueOrdering({
  venues, venue, zones, recent, onPickVenue, onOpenOrder, onPlaced, toast,
}: {
  venues: Venue[]
  venue: Venue
  zones: DeliveryZone[]
  recent: Order[]
  onPickVenue: (id: string) => void
  onOpenOrder: (id: string) => void
  onPlaced: (o: Order) => Promise<void>
  toast: (m: string) => void
}) {
  const [menu, setMenu] = useState<MenuResponse | null>(null)
  const [menuErr, setMenuErr] = useState<string | null>(null)
  const [category, setCategory] = useState('همه')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dest, setDest] = useState<Dest>(venue.accepts_delivery ? 'unit' : 'zone')
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '')
  const [zoneNote, setZoneNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const loadMenu = useCallback(async () => {
    try {
      setMenu(await fnbApi.menu(venue.id))
      setMenuErr(null)
    } catch (e) {
      setMenuErr(errText(e, 'دریافت منو ناموفق بود'))
    }
  }, [venue.id])
  useEffect(() => { void loadMenu() }, [loadMenu])
  // موجودی لحظه‌ای: هر ۳۰ ثانیه منو دوباره خوانده می‌شود
  useEffect(() => {
    const t = setInterval(loadMenu, 30_000)
    return () => clearInterval(t)
  }, [loadMenu])

  const items = useMemo(() => menu?.items ?? [], [menu])
  const categories = useMemo(() => ['همه', ...new Set(items.map((m) => m.category_name ?? 'سایر'))], [items])
  const list = items.filter((m) => category === 'همه' || (m.category_name ?? 'سایر') === category)
  const cartRows = Object.entries(cart)
    .map(([id, qty]) => ({ item: items.find((m) => m.id === id), qty }))
    .filter((r): r is { item: MenuItem; qty: number } => !!r.item && r.qty > 0)
  const cartCount = cartRows.reduce((a, r) => a + r.qty, 0)
  const cartTotal = cartRows.reduce((a, r) => a + r.qty * r.item.price, 0)
  const zone = zones.find((z) => z.id === zoneId)
  const surcharge = dest === 'zone' ? zone?.surcharge ?? 0 : 0
  const belowMin = cartTotal < venue.min_order

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = Math.min(qty, 50)
      return next
    })
  }
  function addToCart(item: MenuItem) {
    if (item.availability === 'sold_out') return toast(`${item.name} فعلاً موجود نیست`)
    setQty(item.id, (cart[item.id] ?? 0) + 1)
    toast(`${item.name} به سبد اضافه شد`)
  }

  async function placeOrder() {
    setBusy(true)
    setFormErr('')
    try {
      const o = await fnbApi.placeOrder({
        venue_id: venue.id,
        delivery_type: dest === 'unit' ? 'in_unit' : 'amenity_zone',
        delivery_zone_id: dest === 'zone' ? zoneId : undefined,
        delivery_note: dest === 'zone' ? zoneNote.trim() || undefined : undefined,
        items: cartRows.map((r) => ({ item_id: r.item.id, quantity: r.qty })),
      })
      setCart({})
      setSheetOpen(false)
      await onPlaced(o)
    } catch (e) {
      setFormErr(errText(e, 'ثبت سفارش ممکن نشد'))
      void loadMenu()
    } finally {
      setBusy(false)
    }
  }

  const VIcon = kindIcon(venue.kind)
  const past = recent.filter((o) => !LIVE.includes(o.status)).slice(0, 5)

  return (
    <>
      {venues.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {venues.map((v) => {
            const Icon = kindIcon(v.kind)
            const active = v.id === venue.id
            return (
              <button
                key={v.id}
                onClick={() => onPickVenue(v.id)}
                className={`shrink-0 flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-sm font-bold border transition-colors ${
                  active ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]' : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
                }`}
              >
                <Icon size={17} />
                {v.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-2xl p-4 flex items-center gap-3 text-white" style={{ background: 'linear-gradient(145deg,#0e5c63,#0b3d47)' }}>
        <span className="rounded-2xl p-2.5 bg-white/15 shrink-0"><VIcon size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[15px]">{venue.name}</p>
          <p className="text-xs text-white/75 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>آماده‌سازی حدود {fa(venue.prep_time_minutes)} دقیقه</span>
            {venue.opens_at && venue.closes_at && <span>ساعت {fa(venue.opens_at)} تا {fa(venue.closes_at)}</span>}
            {venue.min_order > 0 && <span>حداقل سفارش {toman(venue.min_order)} تومان</span>}
          </p>
          {venue.description && <p className="text-xs text-white/75 mt-1">{venue.description}</p>}
        </div>
        <GlassPill tone={venue.open_now ? 'success' : 'danger'}>{venue.open_now ? 'باز' : 'بسته'}</GlassPill>
      </div>

      {menuErr && !menu && <ErrorBlock message={menuErr} retry={loadMenu} />}
      {!menu && !menuErr && <Loading label="در حال دریافت منو…" />}

      {menu && items.length === 0 && (
        <EmptyState icon={UtensilsCrossed} tone="mute" title="منوی این مجموعه هنوز خالی است" sub="به‌زودی آیتم‌ها اضافه می‌شود." />
      )}

      {menu && items.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-semibold border transition-colors ${
                  category === c ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]' : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-2.5 md:grid-cols-2">
            {list.map((m) => {
              const qty = cart[m.id] ?? 0
              const soldOut = m.availability === 'sold_out' || (m.stock_count !== null && m.stock_count - m.reserved_count <= 0)
              return (
                <GlassCard key={m.id} className={`p-3 flex items-center gap-3 ${soldOut ? 'opacity-55' : ''}`}>
                  {m.image_url ? (
                    <img src={m.image_url} alt="" className={`w-14 h-14 rounded-2xl object-cover shrink-0 ${soldOut ? 'grayscale' : ''}`} />
                  ) : (
                    <span className="rounded-2xl p-2.5 shrink-0 w-14 h-14 grid place-items-center" style={{ color: 'var(--lg-primary)', background: 'var(--lg-primary-soft)' }}>
                      <VIcon size={22} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-[13.5px]">{m.name}</p>
                      {m.is_daily_special && !soldOut && (
                        <GlassPill tone="warning"><Star size={11} className="inline -mt-0.5 ml-0.5" />غذای روز</GlassPill>
                      )}
                      {soldOut && <GlassPill tone="danger">تمام شد</GlassPill>}
                    </div>
                    {m.description && <p className="text-[var(--lg-text-tertiary)] text-[11px] mt-0.5 line-clamp-2">{m.description}</p>}
                    <p className="text-[var(--lg-text-secondary)] text-xs mt-1">
                      {m.price > 0 ? `${toman(m.price)} تومان` : 'رایگان'}
                      {m.prep_time_minutes ? ` · ${fa(m.prep_time_minutes)} دقیقه` : ''}
                    </p>
                  </div>
                  {!soldOut && qty > 0 ? (
                    <div className="flex items-center gap-2 bg-[var(--lg-bg-base)] rounded-2xl px-2 py-1.5">
                      <button onClick={() => setQty(m.id, qty - 1)} className="text-[var(--lg-primary)] p-1" aria-label="کم کردن"><Minus size={16} /></button>
                      <span className="font-extrabold text-sm min-w-[16px] text-center">{fa(qty)}</span>
                      <button onClick={() => setQty(m.id, qty + 1)} className="text-[var(--lg-primary)] p-1" aria-label="زیاد کردن"><Plus size={16} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(m)}
                      disabled={soldOut}
                      className={`rounded-2xl px-3.5 py-2.5 text-xs font-bold border ${
                        soldOut ? 'border-[var(--lg-border-hairline)] text-[var(--lg-text-tertiary)] cursor-not-allowed' : 'border-[var(--lg-primary-soft)] bg-[var(--lg-primary-soft)] text-[var(--lg-primary)] cursor-pointer'
                      }`}
                    >
                      {soldOut ? 'ناموجود' : 'افزودن'}
                    </button>
                  )}
                </GlassCard>
              )
            })}
          </div>
        </>
      )}

      {past.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold text-[var(--lg-text-secondary)]">سفارش‌های قبلی</p>
          {past.map((o) => (
            <button key={o.id} onClick={() => onOpenOrder(o.id)} className="w-full text-right">
              <GlassCard className="p-3 flex items-center gap-3">
                <Receipt size={18} className="text-[var(--lg-text-tertiary)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">#{fa(o.order_number)} · {o.venue_name}</p>
                  <p className="text-[11px] text-[var(--lg-text-tertiary)] mt-0.5">{ago(o.placed_at)} · {toman(o.total)} تومان</p>
                </div>
                <GlassPill tone={o.status === 'delivered' ? 'success' : 'danger'}>{STATUS_LABEL[o.status]}</GlassPill>
              </GlassCard>
            </button>
          ))}
        </div>
      )}

      {cartCount > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setSheetOpen(true)}
          className="sticky bottom-24 md:bottom-4 w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-lg"
          style={{ background: 'var(--lg-primary)', boxShadow: '0 10px 26px rgba(14,92,99,.35)' }}
        >
          <ShoppingBag size={20} />
          <span className="flex-1 text-right text-sm font-bold">{fa(cartCount)} قلم در سبد</span>
          <span className="text-sm font-extrabold">{toman(cartTotal)} تومان</span>
        </motion.button>
      )}

      <GlassSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="سبد سفارش">
        <div className="space-y-2 max-h-44 overflow-y-auto">
          {cartRows.map((r) => (
            <div key={r.item.id} className="flex items-center gap-3 bg-[var(--lg-bg-base)] rounded-2xl px-3 py-2.5">
              <span className="flex-1 text-sm font-semibold truncate">{r.item.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(r.item.id, r.qty - 1)} className="text-[var(--lg-primary)] p-1" aria-label="کم کردن"><Minus size={15} /></button>
                <span className="font-extrabold text-sm min-w-[14px] text-center">{fa(r.qty)}</span>
                <button onClick={() => setQty(r.item.id, r.qty + 1)} className="text-[var(--lg-primary)] p-1" aria-label="زیاد کردن"><Plus size={15} /></button>
              </div>
              <span className="text-xs font-bold min-w-[72px] text-left">{toman(r.qty * r.item.price)}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 mb-2.5 text-xs font-bold text-[var(--lg-text-secondary)]">مقصد تحویل</p>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            { key: 'unit' as const, label: 'واحد من', icon: Building2, off: !venue.accepts_delivery },
            { key: 'zone' as const, label: 'مشاعات', icon: ShoppingBag, off: zones.length === 0 },
          ]).map((d) => {
            const active = dest === d.key
            const Icon = d.icon
            return (
              <button
                key={d.key}
                disabled={d.off}
                onClick={() => setDest(d.key)}
                className={`rounded-2xl py-3.5 px-2 flex flex-col items-center gap-1.5 border transition-colors disabled:opacity-40 ${
                  active ? 'bg-[var(--lg-primary-soft)] border-[var(--lg-primary)] text-[var(--lg-primary)]' : 'bg-[var(--lg-bg-base)] border-[var(--lg-border-hairline)] text-[var(--lg-text-secondary)]'
                }`}
              >
                <Icon size={22} />
                <span className="text-xs font-bold">{d.label}</span>
                {d.off && <span className="text-[10px]">{d.key === 'unit' ? 'تحویل در واحد ندارد' : 'منطقه‌ای تعریف نشده'}</span>}
              </button>
            )
          })}
        </div>

        {dest === 'zone' && (
          <>
            <div className="flex gap-2 flex-wrap mt-3">
              {zones.map((z) => {
                const active = zoneId === z.id
                const Icon = zoneIcon[z.name] ?? ShoppingBag
                return (
                  <button
                    key={z.id}
                    onClick={() => setZoneId(z.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold border ${
                      active ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]' : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
                    }`}
                  >
                    <Icon size={15} />
                    {z.name}
                    {z.surcharge > 0 && <span className="opacity-80">+{toman(z.surcharge)}</span>}
                  </button>
                )
              })}
            </div>
            <input
              value={zoneNote}
              onChange={(e) => setZoneNote(e.target.value)}
              maxLength={120}
              placeholder="یادداشت مکان — مثلاً تخت شماره ۷"
              className="mt-2.5 w-full border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-base)] rounded-2xl px-3.5 py-3 text-sm outline-none"
            />
          </>
        )}

        <div className="mt-3 pt-3.5 border-t border-[var(--lg-border-hairline)] space-y-1.5 text-sm">
          <div className="flex justify-between text-[var(--lg-text-secondary)]"><span>جمع اقلام</span><span>{toman(cartTotal)} تومان</span></div>
          {surcharge > 0 && <div className="flex justify-between text-[var(--lg-text-secondary)]"><span>هزینه‌ی تحویل</span><span>{toman(surcharge)} تومان</span></div>}
          <div className="flex justify-between items-center">
            <span className="text-[var(--lg-text-secondary)]">جمع کل</span>
            <span className="text-[var(--lg-primary)] font-extrabold text-lg">{toman(cartTotal + surcharge)} تومان</span>
          </div>
        </div>

        {!venue.open_now && <p className="text-xs text-[var(--lg-danger)] mt-2">{venue.name} الان بسته است.</p>}
        {venue.open_now && belowMin && <p className="text-xs text-[var(--lg-danger)] mt-2">حداقل مبلغ سفارش {toman(venue.min_order)} تومان است.</p>}
        {formErr && <p className="text-xs text-[var(--lg-danger)] mt-2">{formErr}</p>}

        <button
          onClick={placeOrder}
          disabled={busy || cartRows.length === 0 || !venue.open_now || belowMin || (dest === 'zone' && !zoneId)}
          className="mt-3 w-full rounded-2xl py-4 text-white font-extrabold text-sm disabled:opacity-50"
          style={{ background: 'var(--lg-primary)' }}
        >
          {busy ? 'در حال ثبت…' : 'ثبت سفارش'}
        </button>
      </GlassSheet>
    </>
  )
}

function OrderTracking({ order, onNew, onCancel }: { order: Order; onNew: () => void; onCancel: () => void }) {
  const rejected = order.status === 'rejected' || order.status === 'cancelled'
  const stage = STAGE_OF[order.status] ?? 0
  const dest = order.delivery_type === 'in_unit' ? `واحد ${fa(order.unit_number ?? '')}` : `${order.zone_name ?? 'مشاعات'}${order.delivery_note ? ' — ' + order.delivery_note : ''}`
  return (
    <div className="space-y-5">
      <div
        className="rounded-3xl p-5 text-white text-center"
        style={{ background: rejected ? 'linear-gradient(145deg,#8a2f22,#5e1f17)' : 'linear-gradient(145deg,#0e5c63,#0b3d47)' }}
      >
        <p className="text-xs text-white/75">سفارش #{fa(order.order_number)} · {order.venue_name}</p>
        <p className="text-xl font-extrabold mt-2">
          {rejected ? (order.status === 'cancelled' ? 'سفارش لغو شد' : 'سفارش پذیرفته نشد') : stage === 0 ? 'سفارش شما ثبت شد' : ORDER_STEPS[stage].label}
        </p>
        <p className="text-xs text-white/75 mt-2 flex items-center justify-center gap-1.5">
          {rejected ? (
            order.cancellation_reason ?? 'برای جزئیات با پذیرش تماس بگیرید'
          ) : stage >= 4 ? (
            'تحویل انجام شد'
          ) : (
            <>
              <Clock size={13} />
              تحویل حدود {fa(order.prep_time_minutes)} دقیقه · به {dest}
            </>
          )}
        </p>
      </div>

      {!rejected && (
        <GlassCard className="p-4">
          {ORDER_STEPS.map((step, i) => {
            const done = i < stage || stage === 4
            const active = i === stage && stage < 4
            const Icon = done ? CheckCircle2 : step.icon
            const color = done ? 'var(--lg-success)' : active ? 'var(--lg-primary)' : 'var(--lg-text-tertiary)'
            return (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center w-6 shrink-0">
                  <Icon size={20} style={{ color }} className={active ? 'animate-pulse' : ''} />
                  {i < ORDER_STEPS.length - 1 && <span className="w-0.5 flex-1 my-1" style={{ background: done ? 'var(--lg-success)' : 'var(--lg-border-hairline)' }} />}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-sm" style={{ color: done || active ? 'var(--lg-text-primary)' : 'var(--lg-text-tertiary)', fontWeight: active ? 800 : 600 }}>{step.label}</p>
                  <p className="text-[var(--lg-text-tertiary)] text-xs mt-1">{done ? 'انجام شد' : active ? 'در جریان' : '—'}</p>
                </div>
              </div>
            )
          })}
        </GlassCard>
      )}

      {rejected && (
        <GlassCard className="p-4 flex items-center gap-3 text-sm">
          <XCircle size={20} className="text-[var(--lg-danger)] shrink-0" />
          {order.status === 'cancelled' ? 'این سفارش لغو شد.' : 'آشپزخانه این سفارش را نپذیرفت.'}
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <p className="font-bold text-sm mb-3 flex items-center gap-1.5"><Receipt size={15} /> اقلام سفارش</p>
        {order.items.map((it, i) => (
          <div key={`${it.item_id}-${i}`} className="flex justify-between py-2 border-b border-[var(--lg-border-hairline)] last:border-0 text-sm">
            <span>{fa(it.quantity)}× {it.name}</span>
            <span className="font-bold">{toman(it.line_total)}</span>
          </div>
        ))}
        {order.surcharge > 0 && (
          <div className="flex justify-between pt-2 text-sm text-[var(--lg-text-secondary)]"><span>هزینه‌ی تحویل</span><span>{toman(order.surcharge)}</span></div>
        )}
        <div className="flex justify-between pt-3 mt-1">
          <span className="text-[var(--lg-text-secondary)] text-sm">جمع سفارش</span>
          <span className="text-[var(--lg-primary)] font-extrabold">{toman(order.total)} تومان</span>
        </div>
      </GlassCard>

      {(order.status === 'placed' || order.status === 'accepted') && (
        <button onClick={onCancel} className="w-full rounded-2xl py-3.5 border border-[var(--lg-danger)] text-[var(--lg-danger)] font-bold text-sm">
          لغو سفارش
        </button>
      )}
      <button
        onClick={onNew}
        className="w-full rounded-2xl py-3.5 border border-[var(--lg-border-hairline)] text-[var(--lg-text-secondary)] font-bold text-sm flex items-center justify-center gap-2"
      >
        <RotateCcw size={16} />
        {LIVE.includes(order.status) ? 'بازگشت به منو' : 'سفارش جدید'}
      </button>
    </div>
  )
}
