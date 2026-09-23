/**
 * پریمیتیوهای رابط کاربری برای صفحات نسل ۲ (Liquid Glass) — سفارش غذا، داشبورد لاگ،
 * Kitchen Display. طبق docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۴: کلاس lg-glass
 * فقط روی لایه‌های ثابت (Sheet/Header) استفاده می‌شود، نه روی کارت‌های اسکرول‌شونده —
 * برای همین GlassCard از پس‌زمینه‌ی مات var(--lg-bg-elevated) استفاده می‌کند و فقط
 * GlassSheet از کلاس lg-glass با بلور واقعی بهره می‌برد.
 */
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className={`bg-[var(--lg-bg-elevated)] border border-[var(--lg-border-hairline)] rounded-[var(--lg-radius-card)] shadow-[0_6px_20px_rgba(16,32,52,0.06)] ${className}`}
    >
      {children}
    </motion.div>
  )
}

type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

const toneClasses: Record<Tone, string> = {
  primary: 'bg-[var(--lg-primary-soft)] text-[var(--lg-primary)]',
  accent: 'bg-[var(--lg-accent-soft)] text-[var(--lg-accent)]',
  success: 'bg-[var(--lg-success-soft)] text-[var(--lg-success)]',
  warning: 'bg-[var(--lg-warning-soft)] text-[var(--lg-warning)]',
  danger: 'bg-[var(--lg-danger-soft)] text-[var(--lg-danger)]',
  neutral: 'bg-[var(--lg-bg-base)] text-[var(--lg-text-secondary)]',
}

export function GlassPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}

export function GlassSheet({
  open, onClose, title, children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="lg-glass fixed bottom-0 inset-x-0 z-50 lg-sheet px-5 pt-3 pb-8 max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="w-10 h-1.5 rounded-full bg-[var(--lg-border-hairline)] mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <p className="font-extrabold text-[15px] text-[var(--lg-text-primary)]">{title}</p>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-[var(--lg-text-tertiary)] hover:bg-[var(--lg-bg-base)]"
                aria-label="بستن"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function GlassToast({ message }: { message: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="fixed bottom-24 lg:bottom-6 inset-x-4 lg:inset-x-auto lg:left-6 lg:max-w-sm z-[70] flex items-center gap-2.5 rounded-2xl bg-[#121a24] text-white px-4 py-3 shadow-xl"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        >
          <span className="text-[var(--lg-success)] text-base">●</span>
          <p className="text-sm font-medium">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
