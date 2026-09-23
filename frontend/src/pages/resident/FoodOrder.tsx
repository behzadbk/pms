import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingBag, Wallet, Receipt, ChefHat, Flame, BellRing, CheckCircle2,
  Building2, Minus, Plus, RotateCcw, type LucideIcon,
} from 'lucide-react'
import { GlassCard, GlassPill, GlassSheet, GlassToast } from '../../components/ui/Glass'
import { fnbVenues, menuItems, deliveryZones, toman } from '../../lib/mockData'
import { foodIcon, zoneIcon } from '../../lib/foodIcons'
import type { MenuItem } from '../../lib/types'

type Dest = 'unit' | 'zone'

const ORDER_STEPS: { label: string; icon: LucideIcon }[] = [
  { label: 'ثبت شد', icon: Receipt },
  { label: 'پذیرش آشپزخانه', icon: ChefHat },
  { label: 'در حال آماده‌سازی', icon: Flame },
  { label: 'آماده تحویل', icon: BellRing },
  { label: 'تحویل شد', icon: CheckCircle2 },
]

interface PlacedOrder {
  code: string
  venueName: string
  onCharge: boolean
  prepTimeMinutes: number
  destLabel: string
  rows: { name: string; qty: number; sum: number }[]
  total: number
}

export function ResidentFoodOrder() {
  const [venueId, setVenueId] = useState(fnbVenues[0].id)
  const venue = fnbVenues.find((v) => v.id === venueId) ?? fnbVenues[0]
  const [category, setCategory] = useState('همه')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dest, setDest] = useState<Dest>('unit')
  const [zone, setZone] = useState(deliveryZones[0].name)
  const [zoneNote, setZoneNote] = useState('')
  const [toast, setToast] = useState('')
  const [order, setOrder] = useState<PlacedOrder | null>(null)
  const [stage, setStage] = useState(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stageTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => () => {
    clearTimeout(toastTimer.current)
    clearInterval(stageTimer.current)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }

  function switchVenue(id: string) {
    setVenueId(id)
    setCategory('همه')
    setCart({})
  }

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  function addToCart(item: MenuItem) {
    if (item.availability === 'sold_out') {
      showToast(`${item.name} فعلاً موجود نیست`)
      return
    }
    setQty(item.id, (cart[item.id] ?? 0) + 1)
    showToast(`${item.name} به سبد اضافه شد`)
  }

  const menuList = menuItems.filter(
    (m) => m.venueId === venueId && (category === 'همه' || m.category === category),
  )
  const cartRows = Object.entries(cart)
    .map(([id, qty]) => ({ item: menuItems.find((m) => m.id === id), qty }))
    .filter((r): r is { item: MenuItem; qty: number } => !!r.item && r.qty > 0)
  const cartCount = cartRows.reduce((a, r) => a + r.qty, 0)
  const cartTotal = cartRows.reduce((a, r) => a + r.qty * r.item.price, 0)
  const onCharge = venue.billing === 'monthly_charge'

  function placeOrder() {
    const destLabel = dest === 'unit' ? 'واحد ۱۲' : zone + (zoneNote ? ' — ' + zoneNote : '')
    const code = venue.id === 'v2'
      ? String(2288 + Math.floor(Math.random() * 9))
      : String(1045 + Math.floor(Math.random() * 9))
    setOrder({
      code,
      venueName: venue.name,
      onCharge,
      prepTimeMinutes: venue.prepTimeMinutes,
      destLabel,
      rows: cartRows.map((r) => ({ name: r.item.name, qty: r.qty, sum: r.qty * r.item.price })),
      total: cartTotal,
    })
    setCart({})
    setSheetOpen(false)
    setZoneNote('')
    setStage(0)
    clearInterval(stageTimer.current)
    stageTimer.current = setInterval(() => {
      setStage((s) => {
        if (s >= 4) {
          clearInterval(stageTimer.current)
          return s
        }
        return s + 1
      })
    }, 3200)
    showToast(onCharge ? 'ثبت شد — به شارژ ماهانه واحد ۱۲ اضافه شد' : 'سفارش ثبت شد — پرداخت از کیف پول')
  }

  function newOrder() {
    clearInterval(stageTimer.current)
    setOrder(null)
    setStage(0)
  }

  if (order) {
    return (
      <>
        <OrderTracking order={order} stage={stage} onNew={newOrder} />
        <GlassToast message={toast} />
      </>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">سفارش غذا و کافی‌شاپ</h1>
        <p className="text-[var(--lg-text-secondary)] text-sm mt-1">سفارش از رستوران و کافی‌شاپ داخل مجتمع — تحویل به واحد یا مشاعات</p>
      </div>

      <div className="flex gap-2">
        {fnbVenues.map((v) => {
          const active = v.id === venueId
          return (
            <button
              key={v.id}
              onClick={() => switchVenue(v.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-sm font-bold border transition-colors ${
                active
                  ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]'
                  : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
              }`}
            >
              {(() => { const Icon = foodIcon[v.icon] ?? ShoppingBag; return <Icon size={17} /> })()}
              {v.name}
            </button>
          )
        })}
      </div>

      <div
        className="rounded-2xl p-4 flex items-center gap-3 text-white"
        style={{ background: 'linear-gradient(145deg,#0e5c63,#0b3d47)' }}
      >
        {(() => { const Icon = foodIcon[venue.icon] ?? ShoppingBag; return (
          <span className="rounded-2xl p-2.5 bg-white/15 shrink-0"><Icon size={22} /></span>
        ) })()}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[15px]">{venue.name}</p>
          <p className="text-xs text-white/75 mt-1">
            آماده‌سازی ~{venue.prepTimeMinutes} دقیقه · {onCharge ? 'بدون پرداخت — روی شارژ ماهانه ثبت می‌شود' : 'پرداخت آنلاین یا کیف پول'}
          </p>
        </div>
        <GlassPill tone={venue.isOpen ? 'success' : 'danger'}>{venue.isOpen ? 'باز' : 'بسته'}</GlassPill>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {venue.categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-semibold border transition-colors ${
              category === c
                ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]'
                : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {menuList.map((m) => {
          const Icon = foodIcon[m.icon] ?? ShoppingBag
          const qty = cart[m.id] ?? 0
          const soldOut = m.availability === 'sold_out'
          return (
            <GlassCard key={m.id} className={`p-3 flex items-center gap-3 ${soldOut ? 'opacity-55' : ''}`}>
              <span
                className="rounded-2xl p-2.5 shrink-0"
                style={{ color: soldOut ? 'var(--lg-text-tertiary)' : m.color, background: soldOut ? 'var(--lg-bg-base)' : `${m.color}1a` }}
              >
                <Icon size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-[13.5px] truncate">{m.name}</p>
                  {soldOut && <GlassPill tone="danger">تمام شد</GlassPill>}
                </div>
                <p className="text-[var(--lg-text-secondary)] text-xs mt-1">{toman(m.price)}</p>
              </div>
              {!soldOut && qty > 0 ? (
                <div className="flex items-center gap-2 bg-[var(--lg-bg-base)] rounded-2xl px-2 py-1.5">
                  <button onClick={() => setQty(m.id, qty - 1)} className="text-[var(--lg-primary)] p-1" aria-label="کم کردن">
                    <Minus size={16} />
                  </button>
                  <span className="font-extrabold text-sm min-w-[16px] text-center">{qty}</span>
                  <button onClick={() => setQty(m.id, qty + 1)} className="text-[var(--lg-primary)] p-1" aria-label="زیاد کردن">
                    <Plus size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => addToCart(m)}
                  disabled={soldOut}
                  className={`rounded-2xl px-3.5 py-2.5 text-xs font-bold border ${
                    soldOut
                      ? 'border-[var(--lg-border-hairline)] text-[var(--lg-text-tertiary)] cursor-not-allowed'
                      : 'border-[var(--lg-primary-soft)] bg-[var(--lg-primary-soft)] text-[var(--lg-primary)] cursor-pointer'
                  }`}
                >
                  {soldOut ? 'ناموجود' : 'افزودن'}
                </button>
              )}
            </GlassCard>
          )
        })}
      </div>

      {cartCount > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setSheetOpen(true)}
          className="sticky bottom-4 w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-lg"
          style={{ background: 'var(--lg-primary)', boxShadow: '0 10px 26px rgba(14,92,99,.35)' }}
        >
          <ShoppingBag size={20} />
          <span className="flex-1 text-right text-sm font-bold">{cartCount} قلم در سبد</span>
          <span className="text-sm font-extrabold">{toman(cartTotal)}</span>
        </motion.button>
      )}

      <GlassSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="سبد سفارش">
        <div className="space-y-2 max-h-44 overflow-y-auto">
          {cartRows.map((r) => (
            <div key={r.item.id} className="flex items-center gap-3 bg-[var(--lg-bg-base)] rounded-2xl px-3 py-2.5">
              <span className="flex-1 text-sm font-semibold truncate">{r.item.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(r.item.id, r.qty - 1)} className="text-[var(--lg-primary)] p-1"><Minus size={15} /></button>
                <span className="font-extrabold text-sm min-w-[14px] text-center">{r.qty}</span>
                <button onClick={() => setQty(r.item.id, r.qty + 1)} className="text-[var(--lg-primary)] p-1"><Plus size={15} /></button>
              </div>
              <span className="text-xs font-bold min-w-[86px] text-left" dir="ltr">{toman(r.qty * r.item.price)}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 mb-2.5 text-xs font-bold text-[var(--lg-text-secondary)]">مقصد تحویل</p>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            { key: 'unit' as const, label: 'واحد من', icon: Building2 },
            { key: 'zone' as const, label: 'مشاعات', icon: ShoppingBag },
          ]).map((d) => {
            const active = dest === d.key
            const Icon = d.icon
            return (
              <button
                key={d.key}
                onClick={() => setDest(d.key)}
                className={`rounded-2xl py-3.5 px-2 flex flex-col items-center gap-1.5 border transition-colors ${
                  active ? 'bg-[var(--lg-primary-soft)] border-[var(--lg-primary)] text-[var(--lg-primary)]' : 'bg-[var(--lg-bg-base)] border-[var(--lg-border-hairline)] text-[var(--lg-text-secondary)]'
                }`}
              >
                <Icon size={22} />
                <span className="text-xs font-bold">{d.label}</span>
              </button>
            )
          })}
        </div>

        {dest === 'zone' && (
          <>
            <div className="flex gap-2 flex-wrap mt-3">
              {deliveryZones.map((z) => {
                const active = zone === z.name
                const Icon = zoneIcon[z.name] ?? ShoppingBag
                return (
                  <button
                    key={z.id}
                    onClick={() => setZone(z.name)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold border ${
                      active ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]' : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
                    }`}
                  >
                    <Icon size={15} />
                    {z.name}
                  </button>
                )
              })}
            </div>
            <input
              value={zoneNote}
              onChange={(e) => setZoneNote(e.target.value)}
              placeholder="یادداشت مکان — مثلاً تخت شماره ۷"
              className="mt-2.5 w-full border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-base)] rounded-2xl px-3.5 py-3 text-sm outline-none"
            />
          </>
        )}

        <div className="flex items-center gap-2 mt-3.5 px-3.5 py-3 rounded-2xl bg-[var(--lg-primary-soft)] text-[var(--lg-primary)]">
          {onCharge ? <Receipt size={18} /> : <Wallet size={18} />}
          <span className="text-xs font-bold">{onCharge ? 'افزودن به شارژ شهریور — واحد ۱۲' : 'پرداخت از کیف پول'}</span>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3.5 border-t border-[var(--lg-border-hairline)]">
          <span className="text-[var(--lg-text-secondary)] text-sm">جمع کل</span>
          <span className="text-[var(--lg-primary)] font-extrabold text-lg">{toman(cartTotal)}</span>
        </div>

        <button
          onClick={placeOrder}
          disabled={cartRows.length === 0}
          className="mt-3 w-full rounded-2xl py-4 text-white font-extrabold text-sm disabled:opacity-50"
          style={{ background: 'var(--lg-primary)' }}
        >
          {onCharge ? 'ثبت روی شارژ ماهانه' : 'پرداخت و ثبت سفارش'}
        </button>
      </GlassSheet>

      <GlassToast message={toast} />
    </div>
  )
}

function OrderTracking({ order, stage, onNew }: { order: PlacedOrder; stage: number; onNew: () => void }) {
  return (
    <div className="space-y-5">
      <div
        className="rounded-3xl p-5 text-white text-center"
        style={{ background: 'linear-gradient(145deg,#0e5c63,#0b3d47)' }}
      >
        <p className="text-xs text-white/75">سفارش #{order.code}</p>
        <p className="text-xl font-extrabold mt-2">{ORDER_STEPS[Math.max(0, stage)].label}</p>
        <p className="text-xs text-white/75 mt-2">
          {stage >= 4 ? 'تحویل انجام شد' : `تحویل تا حدود ${order.prepTimeMinutes} دقیقه`} · تحویل به {order.destLabel}
        </p>
        <span className="inline-block mt-3 text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15">
          {order.onCharge ? 'روی شارژ ماهانه ثبت شد' : 'پرداخت‌شده از کیف پول'}
        </span>
      </div>

      <GlassCard className="p-4">
        {ORDER_STEPS.map((step, i) => {
          const done = i < stage
          const active = i === stage
          const Icon = done ? CheckCircle2 : step.icon
          const color = done ? 'var(--lg-success)' : active ? 'var(--lg-primary)' : 'var(--lg-text-tertiary)'
          return (
            <div key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center w-6 shrink-0">
                <Icon size={20} style={{ color }} className={active && i < 4 ? 'animate-pulse' : ''} />
                {i < ORDER_STEPS.length - 1 && (
                  <span className="w-0.5 flex-1 my-1" style={{ background: done ? 'var(--lg-success)' : 'var(--lg-border-hairline)' }} />
                )}
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm" style={{ color: done || active ? 'var(--lg-text-primary)' : 'var(--lg-text-tertiary)', fontWeight: active ? 800 : 600 }}>
                  {step.label}
                </p>
                <p className="text-[var(--lg-text-tertiary)] text-xs mt-1">{done ? 'انجام شد' : active ? 'در جریان' : '—'}</p>
              </div>
            </div>
          )
        })}
      </GlassCard>

      <GlassCard className="p-4">
        <p className="font-bold text-sm mb-3">اقلام سفارش</p>
        {order.rows.map((it) => (
          <div key={it.name} className="flex justify-between py-2 border-b border-[var(--lg-border-hairline)] last:border-0 text-sm">
            <span>{it.qty}× {it.name}</span>
            <span className="font-bold">{toman(it.sum)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 mt-1">
          <span className="text-[var(--lg-text-secondary)] text-sm">{order.onCharge ? 'افزوده به شارژ' : 'جمع پرداخت‌شده'}</span>
          <span className="text-[var(--lg-primary)] font-extrabold">{toman(order.total)}</span>
        </div>
      </GlassCard>

      <button
        onClick={onNew}
        className="w-full rounded-2xl py-3.5 border border-[var(--lg-border-hairline)] text-[var(--lg-text-secondary)] font-bold text-sm flex items-center justify-center gap-2"
      >
        <RotateCcw size={16} />
        سفارش جدید
      </button>
    </div>
  )
}
