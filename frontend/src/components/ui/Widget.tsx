import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'

/**
 * ویجت مربعی داشبورد (مثل ویجت‌های iPhone) — شیشه‌ی Liquid Glass v5.
 * ‹WidgetGrid› آن‌ها را کنار هم می‌چیند: ۲ ستون موبایل، ۳ تبلت، ۴ دسکتاپ.
 *
 * حالت آسان: ویجت‌های «essential» نشان داده می‌شوند و بقیه پنهان؛ ظاهر هم از مربع به
 * ردیف تمام‌عرض با آیکن درشت عوض می‌شود (CSS در liquid-glass-v5.css).
 */

export type WidgetTone = 'pri' | 'acc' | 'ok' | 'bad' | 'ink'

export function WidgetGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`lg5-grid ${className}`}>{children}</div>
}

interface WidgetProps {
  icon: LucideIcon
  label: string
  /** عدد/مبلغ اصلی ویجت. اگر نباشد ویجت از نوع «اقدام» است و عنوان درشت می‌شود */
  value?: string
  sub?: string
  tone?: WidgetTone
  /** مسیر داخلی؛ ویجت لینک می‌شود */
  to?: string
  onClick?: () => void
  /** ۲×۱ (دو خانه‌ی کنار هم) */
  wide?: boolean
  /** گرادیان رنگ اصلی پالت (برای مهم‌ترین عدد صفحه) */
  hero?: boolean
  /** دکمه‌ی اصلی صفحه: پُر با رنگ پالت */
  solid?: boolean
  /** متن کپسول داخل ویجت قهرمان (مثلاً «پرداخت آنلاین») */
  cta?: string
  /** در حالت آسان هم نمایش داده شود (پیش‌فرض: نه) */
  essential?: boolean
}

export function Widget({ icon: Icon, label, value, sub, tone = 'pri', to, onClick, wide, hero, solid, cta, essential = false }: WidgetProps) {
  const { easy } = useTheme()
  if (easy && !essential) return null

  const cls = [
    'lg5-widget',
    `lg5-tone-${tone}`,
    wide || hero ? 'lg5-widget-wide' : '',
    hero ? 'lg5-widget-hero' : '',
    solid ? 'lg5-widget-solid' : '',
    value === undefined ? 'lg5-w-action' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <div className="lg5-w-body">
      <span className="lg5-w-icon">
        <Icon strokeWidth={2.1} />
      </span>
      <div className="lg5-w-text">
        {value !== undefined && <p className="lg5-w-value">{value}</p>}
        <p className="lg5-w-label">{label}</p>
        {sub && <p className="lg5-w-sub">{sub}</p>}
        {cta && <span className="lg5-w-cta inline-block mt-2">{cta}</span>}
      </div>
    </div>
  )

  if (to) return <Link to={to} className={cls}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

/** محتوای کم‌اهمیت (لیست‌ها، نمودارها، جدول‌ها) که در «حالت آسان» پنهان می‌شود */
export function EasyHide({ children }: { children: ReactNode }) {
  const { easy } = useTheme()
  return easy ? null : <>{children}</>
}
