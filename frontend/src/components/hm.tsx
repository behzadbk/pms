/**
 * پریمیتیوهای رابط Hamino v5 (ماژول ساکنین، خانوار، حالت والدین، رزرو مشاعات).
 * ظاهر عیناً از «Hamino - New Modules v2.dc.html»: دکمه‌ی بازگشت گرد ۴۴px، کارت شیشه‌ای ۲۴،
 * سگمنت کپسولی با لنز، برچسب‌های رنگی، سوییچ ۵۱×۳۱، برگه‌ی شیشه‌ای و برگه‌ی موفقیت.
 * کلاس‌ها در styles/liquid-glass.css (بخش Hamino v5) تعریف شده‌اند.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Loader2, X, type LucideIcon } from 'lucide-react'
import type { Tone } from '../lib/api/residents'
import { GlassToast } from './ui/Glass'

export function PageHeader({
  title,
  sub,
  back,
  close,
  action,
}: {
  title: ReactNode
  sub?: ReactNode
  /** true = navigate(-1) */
  back?: true | (() => void) | string
  close?: boolean
  action?: ReactNode
}) {
  const navigate = useNavigate()
  const onBack = () => (typeof back === 'function' ? back() : typeof back === 'string' ? navigate(back) : navigate(-1))
  return (
    <div className="flex items-center gap-3">
      {back && (
        <button onClick={onBack} className="hm-back" aria-label={close ? 'بستن' : 'بازگشت'}>
          {close ? <X size={22} /> : <ArrowRight size={22} />}
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="m-0 text-base font-bold text-[var(--hm-t1)] truncate">{title}</p>
        {sub && <p className="mt-1 text-xs text-[var(--hm-t2)]">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** عنوان سطح اول صفحه (مثل «ساکنین» با زیرعنوان کوچک بالای آن) */
export function PageTitle({ kicker, title, action }: { kicker?: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {kicker && <p className="text-xs text-[var(--hm-t2)]">{kicker}</p>}
        <p className="mt-1 text-xl font-bold text-[var(--hm-t1)]">{title}</p>
      </div>
      {action}
    </div>
  )
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`hm-badge hm-tone-${tone}`}>{children}</span>
}

export function Seg<K extends string>({
  options,
  value,
  onChange,
  small,
  className = '',
  colors,
}: {
  options: [K, string][]
  value: K
  onChange: (k: K) => void
  small?: boolean
  className?: string
  /** رنگ متن گزینه‌ی فعال به ازای هر کلید (مثل «پنهان / با تأیید / آزاد») */
  colors?: Partial<Record<K, string>>
}) {
  return (
    <div className={`hm-seg ${small ? 'hm-seg-sm' : ''} ${className}`} role="radiogroup">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === value}
          data-on={k === value}
          onClick={() => onChange(k)}
          style={k === value && colors?.[k] ? { color: colors[k] } : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} data-on={on} className="hm-toggle" onClick={() => onChange(!on)} />
}

export function Avatar({ initial, tone = 'pri', size = 44 }: { initial: string; tone?: Tone; size?: number }) {
  return (
    <span className={`hm-avatar hm-tone-${tone}`} style={{ width: size, height: size }}>
      {initial}
    </span>
  )
}

export function IconTile({ icon: Icon, size = 24, tone = 'pri' }: { icon: LucideIcon; size?: number; tone?: Tone }) {
  return (
    <span className={`hm-icon-tile hm-tone-${tone}`}>
      <Icon size={size} />
    </span>
  )
}

/** فهرست فیلدهای فرم داخل یک کارت شیشه‌ای (برچسب کوچک + ورودی پررنگ) */
export function FieldCard({ children }: { children: ReactNode }) {
  return <div className="hm-card overflow-hidden hm-divided">{children}</div>
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  dir,
  inputMode,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  dir?: 'ltr' | 'rtl'
  inputMode?: 'text' | 'tel' | 'numeric'
  error?: string | null
}) {
  return (
    <label className="block px-4 py-2">
      <span className="block text-xs text-[var(--hm-t2)]">{label}</span>
      <input
        className="hm-input mt-0.5"
        value={value}
        type={type}
        dir={dir}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span className="block text-xs text-[var(--hm-bad)] mt-1">{error}</span>}
    </label>
  )
}

export function Note({ tone = 'pri', icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className={`hm-note hm-tone-${tone}`} style={tone === 'pri' ? { color: 'var(--hm-t1)' } : undefined}>
      {Icon && <Icon size={18} className="shrink-0 mt-0.5" style={{ color: tone === 'pri' ? 'var(--hm-pri)' : undefined }} />}
      <div className="flex-1 font-bold" style={{ fontWeight: tone === 'pri' ? 400 : 700 }}>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, sub, tone = 'ok' }: { icon: LucideIcon; title: string; sub?: string; tone?: Tone }) {
  return (
    <div className="hm-row-dashed flex-col !items-center text-center py-6">
      <span className={`hm-avatar hm-tone-${tone}`} style={{ width: 56, height: 56 }}>
        <Icon size={28} />
      </span>
      <p className="text-sm font-bold mt-1">{title}</p>
      {sub && <p className="text-xs text-[var(--hm-t2)]">{sub}</p>}
    </div>
  )
}

export function Loading({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--hm-t2)]">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  )
}

export function ErrorBlock({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="hm-row-dashed flex-col !items-center text-center py-6">
      <p className="text-sm font-bold text-[var(--hm-bad)]">{message}</p>
      {retry && (
        <button onClick={retry} className="hm-chip mt-2">
          تلاش دوباره
        </button>
      )}
    </div>
  )
}

/** CTA اصلی چسبیده به پایین (بالای نوار تب) */
export function StickyCta({ children }: { children: ReactNode }) {
  return <div className="hm-sticky">{children}</div>
}
export function Cta({
  children,
  onClick,
  disabled,
  busy,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} className={`lg4-capsule hm-cta ${className}`}>
      {busy && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  )
}

/** برگه‌ی شیشه‌ای از پایین: فاصله‌ی ۸px از لبه‌ها، شعاع ۴۴، scrim ملایم */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  // پورتال به body: والد صفحه transform دارد (انیمیشن ورود) و fixed داخل آن نسبت به خودش جا می‌گیرد،
  // پس بدون پورتال برگه زیر نوار تب می‌ماند.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={label}>
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(6,12,20,.25)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={onClose}
          />
          <motion.div
            className="relative m-2 mx-auto w-[calc(100%-16px)] max-w-lg max-h-[88vh] overflow-y-auto p-4 pb-6"
            style={{
              borderRadius: 44,
              background: 'var(--lg4-sheet)',
              border: '1px solid var(--lg4-card-border)',
              boxShadow: 'var(--lg4-shadow-float)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              marginBottom: 'max(8px, env(safe-area-inset-bottom))',
            }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            exit={{ y: '105%' }}
            transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="w-10 h-1.5 rounded-full mx-auto mb-3" style={{ background: 'var(--hm-hair)' }} />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** «لحظه‌ی اوج»: تیک متحرک روی حلقه‌ی تپنده با هشت جرقه، عنوان، ردیف‌های کلید/مقدار و یک CTA */
export function SuccessSheet({
  open,
  onClose,
  title,
  sub,
  rows,
  cta,
  onCta,
}: {
  open: boolean
  onClose: () => void
  title: string
  sub?: string
  rows?: { k: string; v: ReactNode }[]
  cta: string
  onCta: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="flex flex-col items-center text-center gap-2 pt-4">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full" style={{ background: 'var(--hm-ok-soft)', animation: 'hm-pulse 1.6s ease-out infinite' }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{ background: i % 2 ? 'var(--hm-pri)' : 'var(--hm-acc)', ['--a' as string]: `${i * 45}deg`, animation: 'hm-spark .7s .15s ease-out both' }}
            />
          ))}
          <motion.span
            className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-white"
            style={{ background: 'var(--hm-ok)', boxShadow: '0 12px 30px color-mix(in srgb, var(--hm-ok) 40%, transparent)' }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          >
            <Check size={38} strokeWidth={3} />
          </motion.span>
        </div>
        <p className="mt-3 text-xl font-bold">{title}</p>
        {sub && <p className="text-sm leading-7 text-[var(--hm-t2)]">{sub}</p>}
        {rows && rows.length > 0 && (
          <div className="hm-card w-full px-4 mt-2 hm-divided text-right">
            {rows.map((r) => (
              <div key={r.k} className="flex py-3 text-sm">
                <span className="flex-1 text-[var(--hm-t2)]">{r.k}</span>
                <span className="font-bold">{r.v}</span>
              </div>
            ))}
          </div>
        )}
        <Cta className="mt-3" onClick={onCta}>
          {cta}
        </Cta>
      </div>
    </Sheet>
  )
}

/** پیام کوتاه پایین صفحه */
export function useToast() {
  const [msg, setMsg] = useState('')
  const t = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    window.clearTimeout(t.current)
    setMsg(m)
    t.current = window.setTimeout(() => setMsg(''), 2800)
  }, [])
  useEffect(() => () => window.clearTimeout(t.current), [])
  return { toast: show, toastNode: createPortal(<GlassToast message={msg} />, document.body) }
}

/** بارگذاری ساده‌ی داده با وضعیت loading/error و reload */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const run = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      setData(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    void run()
  }, [run])
  return { data, setData, error, loading, reload: run }
}
