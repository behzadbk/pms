/**
 * صفحه Kitchen Display — بخش ۴.۴ سند docs/UPDATE-V2-AUDIT-FNB-DESIGN.md.
 * طراحی برای تبلت آشپزخانه: فونت درشت، اهداف لمسی بزرگ، بدون منوی تودرتو.
 * سه ستون Kanban: سفارش‌های جدید → در حال آماده‌سازی → آماده تحویل.
 * صف از GET /api/fnb/kitchen/queue خوانده می‌شود و هر ۱۰ ثانیه تازه می‌شود؛
 * هر گذار وضعیت یک PATCH /api/fnb/orders/:id/status روی بک‌اند است.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Check, ChefHat, Clock, MapPin, UtensilsCrossed, X } from 'lucide-react'
import { GlassCard, GlassPill, GlassToast } from '../../components/ui/Glass'
import { EmptyState, ErrorBlock, Loading } from '../../components/hm'
import { fnbApi, type KitchenQueue, type Order, type OrderStatus, type Venue, type VenueKind } from '../../lib/api/fnb'
import { errText, fa, toman } from '../../lib/api/residents'

type Column = 'placed' | 'preparing' | 'ready'

const COLUMNS: { key: Column; title: string }[] = [
  { key: 'placed', title: 'سفارش‌های جدید' },
  { key: 'preparing', title: 'در حال آماده‌سازی' },
  { key: 'ready', title: 'آماده تحویل' },
]

const elapsedMinutes = (placedAt: string) => Math.max(0, Math.round((Date.now() - new Date(placedAt).getTime()) / 60000))

/**
 * kind: restaurant (دسترسی kitchen) یا cafe (دسترسی cafe).
 * venueId سازگاری با مسیرهای قدیمی است: v1 = رستوران، v2 = کافی‌شاپ.
 */
export function StaffKitchenDisplay({ kind, venueId, title }: { kind?: VenueKind; venueId?: string; title?: string }) {
  const k: VenueKind = kind ?? (venueId === 'v2' ? 'cafe' : 'restaurant')
  const [queue, setQueue] = useState<KitchenQueue | null>(null)
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [, tick] = useState(0)

  const load = useCallback(async () => {
    try {
      const [q, v] = await Promise.all([fnbApi.queue(k, pick || undefined), fnbApi.manageVenues(k)])
      setQueue(q)
      setVenues(v)
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت صف سفارش‌ها ناموفق بود'))
    }
  }, [k, pick])

  useEffect(() => {
    setQueue(null)
    void load()
    // به‌روزرسانی زنده: هر ۱۰ ثانیه صف دوباره خوانده می‌شود؛ تایمرهای نمایشی هم با همین تیک جلو می‌روند
    const t = setInterval(() => {
      void load()
      tick((n) => n + 1)
    }, 10_000)
    return () => clearInterval(t)
  }, [load])

  async function transition(id: string, status: OrderStatus) {
    setBusyId(id)
    try {
      await fnbApi.setStatus(id, status)
      await load()
    } catch (e) {
      setToast(errText(e, 'تغییر وضعیت ممکن نشد'))
      setTimeout(() => setToast(''), 2600)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (error && !queue) return <ErrorBlock message={error} retry={load} />
  if (!queue || !venues) return <Loading />

  const label = k === 'cafe' ? 'کافی‌شاپ' : 'رستوران'
  if (venues.filter((v) => v.is_active).length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold">{title ?? 'صف زنده آشپزخانه'}</h1>
        <EmptyState icon={UtensilsCrossed} tone="mute" title={`هنوز ${label}ی تعریف نشده`} sub="اول مجموعه و منوی آن را بسازید تا ساکنین بتوانند سفارش بدهند." />
        <div className="text-center">
          <Link to={`/staff/menu/${k}`} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[var(--lg-primary)] text-white font-bold text-sm">
            تعریف {label} و منو
          </Link>
        </div>
      </div>
    )
  }

  const orders = queue.orders
  const byColumn: Record<Column, Order[]> = {
    placed: orders.filter((o) => o.status === 'placed'),
    // «accepted» یک زیر-مرحله‌ی گذرا قبل از preparing است — در همین ستون نمایش داده می‌شود
    preparing: orders.filter((o) => o.status === 'preparing' || o.status === 'accepted'),
    ready: orders.filter((o) => o.status === 'ready' || o.status === 'out_for_delivery'),
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{title ?? 'صف زنده آشپزخانه'}</h1>
          <p className="text-[var(--lg-text-secondary)] text-sm mt-1">
            سفارش‌های فعال — هر ۱۰ ثانیه به‌روز می‌شود · تحویل‌شده امروز: {fa(queue.delivered_today)}
          </p>
        </div>
        {venues.length > 1 && (
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-xl border border-line bg-card px-3 py-2 text-sm min-h-[44px]" aria-label="مجموعه">
            <option value="">همه‌ی مجموعه‌ها</option>
            {venues.filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="font-bold text-sm">{col.title}</p>
              <GlassPill tone="neutral">{fa(byColumn[col.key].length)}</GlassPill>
            </div>
            <div className="space-y-3 min-h-[80px]">
              {byColumn[col.key].length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--lg-border-hairline)] py-8 text-center text-[var(--lg-text-tertiary)] text-xs">سفارشی در این مرحله نیست</div>
              )}
              {byColumn[col.key].map((o) => (
                <OrderCard key={o.id} order={o} busy={busyId === o.id} onTransition={transition} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <GlassToast message={toast} />
    </div>
  )
}

function OrderCard({ order, busy, onTransition }: { order: Order; busy: boolean; onTransition: (id: string, status: OrderStatus) => void }) {
  const mins = elapsedMinutes(order.placed_at)
  const overPrep = mins >= order.prep_time_minutes && order.status !== 'ready'
  const DestIcon = order.delivery_type === 'in_unit' ? Building2 : MapPin
  const destination = order.delivery_type === 'in_unit' ? `واحد ${fa(order.unit_number ?? '')}` : `${order.zone_name ?? 'مشاعات'}${order.delivery_note ? ' — ' + order.delivery_note : ''} (واحد ${fa(order.unit_number ?? '')})`

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-extrabold text-base">#{fa(order.order_number)}</p>
        <span
          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
          style={{
            color: overPrep ? 'var(--lg-danger)' : 'var(--lg-text-secondary)',
            background: overPrep ? 'var(--lg-danger-soft)' : 'var(--lg-bg-base)',
          }}
        >
          <Clock size={13} />
          {fa(String(Math.floor(mins / 60)).padStart(2, '0'))}:{fa(String(mins % 60).padStart(2, '0'))}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[var(--lg-text-secondary)] text-sm">
        <DestIcon size={15} />
        {destination}
      </div>

      <div className="space-y-1">
        {order.items.map((it, i) => (
          <p key={`${it.item_id}-${i}`} className="text-sm">{fa(it.quantity)}× {it.name}</p>
        ))}
      </div>

      <p className="text-xs text-[var(--lg-text-tertiary)]">{order.venue_name} · {toman(order.total)} تومان</p>

      <div className="flex gap-2 pt-1">
        {order.status === 'placed' && (
          <>
            <button
              disabled={busy} onClick={() => onTransition(order.id, 'accepted')}
              className="flex-1 min-h-[56px] rounded-2xl disabled:opacity-60 bg-[var(--lg-primary)] text-white font-extrabold text-sm flex items-center justify-center gap-2"
            >
              <ChefHat size={18} />
              پذیرش
            </button>
            <button
              disabled={busy} onClick={() => onTransition(order.id, 'rejected')}
              className="min-h-[56px] px-4 rounded-2xl border border-[var(--lg-border-hairline)] text-[var(--lg-text-secondary)] font-bold text-sm flex items-center justify-center gap-2"
            >
              <X size={18} />
              رد
            </button>
          </>
        )}
        {order.status === 'accepted' && (
          <button
            disabled={busy} onClick={() => onTransition(order.id, 'preparing')}
            className="flex-1 min-h-[56px] rounded-2xl bg-[var(--lg-warning)] text-white font-extrabold text-sm"
          >
            شروع آماده‌سازی
          </button>
        )}
        {order.status === 'preparing' && (
          <button
            disabled={busy} onClick={() => onTransition(order.id, 'ready')}
            className="flex-1 min-h-[56px] rounded-2xl bg-[var(--lg-warning)] text-white font-extrabold text-sm"
          >
            آماده شد
          </button>
        )}
        {(order.status === 'ready' || order.status === 'out_for_delivery') && (
          <button
            disabled={busy} onClick={() => onTransition(order.id, 'delivered')}
            className="flex-1 min-h-[56px] rounded-2xl bg-[var(--lg-success)] text-white font-extrabold text-sm flex items-center justify-center gap-2"
          >
            <Check size={18} />
            تحویل شد
          </button>
        )}
      </div>
    </GlassCard>
  )
}
