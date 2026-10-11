import type { LucideIcon } from 'lucide-react'
import { Widget, type WidgetTone } from './Widget'

/**
 * کارت آمار داشبوردها — از Liquid Glass v5 به بعد همان ویجت مربعی است
 * (همه‌ی داشبوردها یک‌شکل، مثل ویجت‌های iPhone). حتماً داخل ‹WidgetGrid› (کلاس lg5-grid) بگذارید.
 * ‹glass› برای سازگاری با کدهای قدیمی ماند و دیگر اثری ندارد.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'ink',
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: 'ink' | 'tile' | 'brass' | 'bad'
  glass?: boolean
}) {
  const map: Record<string, WidgetTone> = { ink: 'pri', tile: 'ok', brass: 'acc', bad: 'bad' }
  // آمار اصلی هر داشبورد در حالت آسان هم دیده می‌شود
  return <Widget icon={icon} label={label} value={value} sub={sub} tone={map[tone]} essential />
}
