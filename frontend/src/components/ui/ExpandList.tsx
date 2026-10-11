import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * فهرست جمع‌شونده برای داشبوردها: فقط ‹limit› مورد اول دیده می‌شود و دکمه‌ی فلش‌دار «مشاهده‌ی بیشتر»
 * بقیه را باز می‌کند. موارد تازه با fade/translate (compositor) و تأخیر پله‌ای وارد می‌شوند —
 * ارتفاع انیمیت نمی‌شود تا روی لیست‌های بزرگ layout هر فریم تکرار نشود.
 */
export function useExpandable<T>(items: T[], limit = 10) {
  const [open, setOpen] = useState(false)
  const hidden = Math.max(0, items.length - limit)
  return {
    visible: open ? items : items.slice(0, limit),
    /** اندیس اولین مورد تازه‌باز‌شده (برای تأخیر پله‌ای) */
    firstExtra: limit,
    hidden,
    open,
    toggle: () => setOpen((o) => !o),
  }
}

export function ExpandToggle({ hidden, open, onToggle, className = '' }: { hidden: number; open: boolean; onToggle: () => void; className?: string }) {
  if (hidden <= 0) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`lg6-expand w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-[var(--lg4-pri)] ${className}`}
    >
      {open ? 'نمایش کمتر' : `مشاهده‌ی بیشتر (${hidden.toLocaleString('fa-IR')})`}
      <ChevronDown size={18} className="lg6-chev" data-open={open} />
    </button>
  )
}

/** نسخه‌ی آماده برای فهرست‌های ساده: ‹children› تابعی است که هر مورد را رندر می‌کند */
export function ExpandList<T>({
  items,
  limit = 10,
  render,
  className = '',
}: {
  items: T[]
  limit?: number
  render: (item: T, index: number) => ReactNode
  className?: string
}) {
  const { visible, hidden, open, toggle, firstExtra } = useExpandable(items, limit)
  return (
    <div className={className}>
      {visible.map((it, i) => (
        <div key={i} className={i >= firstExtra ? 'lg6-extra' : undefined} style={i >= firstExtra ? { animationDelay: `${Math.min(i - firstExtra, 8) * 40}ms` } : undefined}>
          {render(it, i)}
        </div>
      ))}
      <ExpandToggle hidden={hidden} open={open} onToggle={toggle} className="mt-2" />
    </div>
  )
}
