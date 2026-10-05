/**
 * اجزای مشترک صفحات تیکت / دستور کار / سرویس دوره‌ای / اعلانات (سبک hm).
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Tone } from '../../lib/api/residents'
import type { Priority, TicketStatus, WoStatus } from '../../lib/api/maintenance'
import { formatJalali, parseDateInput } from '../../lib/jalali'
import { tehranParts } from '../../lib/tehran'
import { fa } from '../../lib/api/residents'

export const STATUS_TONE: Record<TicketStatus, Tone> = { open: 'warn', assigned: 'acc', in_progress: 'pri', resolved: 'ok', closed: 'mute' }
export const WO_TONE: Record<WoStatus, Tone> = { open: 'warn', in_progress: 'pri', done: 'ok', cancelled: 'mute' }
export const WO_LABEL: Record<WoStatus, string> = { open: 'در انتظار', in_progress: 'در حال انجام', done: 'انجام‌شد', cancelled: 'لغو شد' }
export const PRIORITY_TONE: Record<Priority, Tone> = { urgent: 'bad', high: 'warn', normal: 'mute', low: 'mute' }

/** «۱۴ مهر ۱۴۰۵ · ۱۸:۳۰» (وقت تهران) */
export function whenFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = tehranParts(iso)
  return `${formatJalali(p.date)} · ${fa(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`)}`
}
/** تاریخ تنها (YYYY-MM-DD یا ISO) به جلالی */
export function dateFa(iso: string | null | undefined): string {
  if (!iso) return ''
  return formatJalali(iso.length > 10 ? tehranParts(iso).date : iso)
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(6,12,20,.3)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={onClose}
          />
          <motion.div
            className="relative m-2 mx-auto w-[calc(100%-16px)] max-w-4xl max-h-[92vh] overflow-y-auto p-4 pb-6 md:p-6"
            style={{
              borderRadius: 36,
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
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-1 min-w-0 text-base font-bold leading-7">{title}</div>
              <button className="hm-back" onClick={onClose} aria-label="بستن">
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** ورودی‌های فرم داخل FieldCard */
export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block px-4 py-2">
      <span className="block text-xs text-[var(--hm-t2)]">{label}</span>
      <select className="hm-input mt-0.5" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TextAreaField({ label, value, onChange, placeholder, rows = 3, maxLength }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number }) {
  return (
    <label className="block px-4 py-2">
      <span className="block text-xs text-[var(--hm-t2)]">{label}</span>
      <textarea className="hm-input mt-0.5 resize-none leading-7" rows={rows} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 px-4 py-3 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[var(--hm-pri)]" />
      {children}
    </label>
  )
}

/** تاریخ جلالی به‌صورت متن آزاد («۱۴۰۵/۰۷/۲۰» یا «۲۰ مهر ۱۴۰۵»)؛ برچسب تاریخ فهمیده‌شده زیرش نمایش داده می‌شود */
export function DateField({ label, value, onChange, placeholder = 'مثلاً ۱۴۰۵/۰۷/۲۰' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const iso = parseDateInput(value)
  return (
    <label className="block px-4 py-2">
      <span className="block text-xs text-[var(--hm-t2)]">{label}</span>
      <input className="hm-input mt-0.5" value={value} inputMode="text" placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value.trim() && (
        <span className={`block text-xs mt-1 ${iso ? 'text-[var(--hm-t2)]' : 'text-[var(--hm-bad)]'}`}>{iso ? formatJalali(iso) : 'تاریخ را به شکل ۱۴۰۵/۰۷/۲۰ بنویسید'}</span>
      )}
    </label>
  )
}
