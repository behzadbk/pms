/**
 * صفحه Kitchen Display — بخش ۴.۴ سند docs/UPDATE-V2-AUDIT-FNB-DESIGN.md.
 * طراحی برای تبلت آشپزخانه: فونت درشت، اهداف لمسی بزرگ، بدون منوی تودرتو.
 * سه ستون Kanban: سفارش‌های جدید → در حال آماده‌سازی → آماده تحویل.
 * هر گذار وضعیت معادل یک PATCH /api/fnb/orders/:id/status روی بک‌اند است
 * (Roles: staff, admin — src/lib/api/fnb.ts:updateOrderStatus).
 */
import { useEffect, useState } from 'react'
import { Building2, Check, ChefHat, Clock, MapPin, X } from 'lucide-react'
import { GlassCard, GlassPill } from '../../components/ui/Glass'
import { toman } from '../../lib/mockData'
import { useStore, setOrderStatus } from '../../lib/store'
import type { FnbOrder, OrderStatus } from '../../lib/types'

type Column = 'placed' | 'preparing' | 'ready'

const COLUMNS: { key: Column; title: string }[] = [
  { key: 'placed', title: 'سفارش‌های جدید' },
  { key: 'preparing', title: 'در حال آماده‌سازی' },
  { key: 'ready', title: 'آماده تحویل' },
]

function elapsedMinutes(placedAt: string): number {
  // داده‌ی نمایشی: placedAt به‌صورت "HH:MM" است — تفاوت با اکنون را تخمین می‌زنیم
  const [h, m] = placedAt.split(':').map(Number)
  const now = new Date()
  const placed = new Date(now)
  placed.setHours(h, m, 0, 0)
  const diffMs = now.getTime() - placed.getTime()
  return Math.max(0, Math.round(diffMs / 60000))
}

/**
 * venueId: v1 = رستوران (دسترسی kitchen)، v2 = کافی‌شاپ (دسترسی cafe).
 * سفارش‌ها از استور مشترک خوانده می‌شوند؛ سفارشی که ساکن ثبت می‌کند فوراً اینجا می‌آید
 * و تغییر وضعیت اینجا در صفحه‌ی پیگیری سفارش ساکن دیده می‌شود.
 */
export function StaffKitchenDisplay({ venueId, title }: { venueId?: string; title?: string }) {
  const { orders: all } = useStore()
  const orders = all.filter((o) => !venueId || o.venueId === venueId)
  const [, forceTick] = useState(0)

  // تیک هر ۳۰ ثانیه فقط برای به‌روزرسانی تایمرهای نمایشی
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  function transition(id: string, status: OrderStatus) {
    setOrderStatus(id, status)
  }
  const deliveredToday = orders.filter((o) => o.status === 'delivered').length

  const byColumn: Record<Column, FnbOrder[]> = {
    placed: orders.filter((o) => o.status === 'placed'),
    // «accepted» یک زیر-مرحله‌ی گذرا قبل از preparing است — در همین ستون نمایش داده می‌شود
    preparing: orders.filter((o) => o.status === 'preparing' || o.status === 'accepted'),
    ready: orders.filter((o) => o.status === 'ready'),
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{title ?? 'صف زنده آشپزخانه'}</h1>
        <p className="text-[var(--lg-text-secondary)] text-sm mt-1">
          سفارش‌های فعال — طراحی‌شده برای تبلت · تحویل‌شده امروز: {deliveredToday.toLocaleString('fa-IR')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="font-bold text-sm">{col.title}</p>
              <GlassPill tone="neutral">{byColumn[col.key].length}</GlassPill>
            </div>

            <div className="space-y-3 min-h-[80px]">
              {byColumn[col.key].length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--lg-border-hairline)] py-8 text-center text-[var(--lg-text-tertiary)] text-xs">
                  سفارشی در این مرحله نیست
                </div>
              )}
              {byColumn[col.key].map((o) => (
                <OrderCard key={o.id} order={o} onTransition={transition} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrderCard({ order, onTransition }: { order: FnbOrder; onTransition: (id: string, status: OrderStatus) => void }) {
  const mins = elapsedMinutes(order.placedAt)
  const overPrep = mins >= order.prepTimeMinutes
  const DestIcon = order.deliveryType === 'in_unit' ? Building2 : MapPin

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-extrabold text-base">#{order.orderNumber}</p>
        <span
          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
          style={{
            color: overPrep ? 'var(--lg-danger)' : 'var(--lg-text-secondary)',
            background: overPrep ? 'var(--lg-danger-soft)' : 'var(--lg-bg-base)',
          }}
        >
          <Clock size={13} />
          {String(Math.floor(mins / 60)).padStart(2, '0')}:{String(mins % 60).padStart(2, '0')}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[var(--lg-text-secondary)] text-sm">
        <DestIcon size={15} />
        {order.destinationLabel}
      </div>

      <div className="space-y-1">
        {order.items.map((it) => (
          <p key={it.itemId} className="text-sm">{it.quantity}× {it.name}</p>
        ))}
      </div>

      <p className="text-xs text-[var(--lg-text-tertiary)]">{order.venueName} · {toman(order.total)}</p>

      <div className="flex gap-2 pt-1">
        {order.status === 'placed' && (
          <>
            <button
              onClick={() => onTransition(order.id, 'accepted')}
              className="flex-1 min-h-[56px] rounded-2xl bg-[var(--lg-primary)] text-white font-extrabold text-sm flex items-center justify-center gap-2"
            >
              <ChefHat size={18} />
              پذیرش
            </button>
            <button
              onClick={() => onTransition(order.id, 'rejected')}
              className="min-h-[56px] px-4 rounded-2xl border border-[var(--lg-border-hairline)] text-[var(--lg-text-secondary)] font-bold text-sm flex items-center justify-center gap-2"
            >
              <X size={18} />
              رد
            </button>
          </>
        )}
        {order.status === 'accepted' && (
          <button
            onClick={() => onTransition(order.id, 'preparing')}
            className="flex-1 min-h-[56px] rounded-2xl bg-[var(--lg-warning)] text-white font-extrabold text-sm"
          >
            شروع آماده‌سازی
          </button>
        )}
        {order.status === 'preparing' && (
          <button
            onClick={() => onTransition(order.id, 'ready')}
            className="flex-1 min-h-[56px] rounded-2xl bg-[var(--lg-warning)] text-white font-extrabold text-sm"
          >
            آماده شد
          </button>
        )}
        {order.status === 'ready' && (
          <button
            onClick={() => onTransition(order.id, 'delivered')}
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
