import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'

/**
 * دیالوگ عمومی پنل‌ها — روی موبایل از پایین بالا می‌آید (bottom sheet) و روی دسکتاپ وسط صفحه است.
 * Escape و کلیک روی پس‌زمینه دیالوگ را می‌بندند.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  const width = size === 'xl' ? 'sm:max-w-4xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`bg-card w-full ${width} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-line shadow-xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink-text p-1" aria-label="بستن">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-line flex flex-wrap gap-2 justify-end shrink-0 pb-safe">{footer}</div>}
      </div>
    </div>
  )
}

const inputCls =
  'mt-1.5 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile'

export function TextField({ label, hint, className = '', ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted">{label}</span>
      <input {...props} className={inputCls} />
      {hint && <span className="text-[11px] text-muted/80 mt-1 block">{hint}</span>}
    </label>
  )
}

export function TextArea({ label, className = '', ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted">{label}</span>
      <textarea rows={3} {...props} className={`${inputCls} resize-none`} />
    </label>
  )
}

export function SelectField({
  label,
  options,
  className = '',
  ...props
}: { label: string; options: { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted">{label}</span>
      <select {...props} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PrimaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 border border-line px-4 py-2.5 rounded-xl text-sm font-medium hover:border-ink-soft disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}
