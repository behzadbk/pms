import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'ink',
  glass = false,
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: 'ink' | 'tile' | 'brass' | 'bad'
  /** استایل شیشه‌ای Liquid Glass v4 به‌جای کارت مات معمولی */
  glass?: boolean
}) {
  const toneBg: Record<string, string> = {
    ink: 'bg-ink text-white',
    tile: 'bg-tile text-white',
    brass: 'bg-brass text-white',
    bad: 'bg-bad text-white',
  }
  const toneFg: Record<string, string> = {
    ink: 'text-[var(--lg4-pri)]',
    tile: 'text-[var(--lg4-pri)]',
    brass: 'text-[var(--lg4-acc)]',
    bad: 'text-bad',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={
        glass
          ? 'lg4-card p-4 sm:p-5'
          : 'bg-card rounded-2xl border border-line shadow-sm p-4 sm:p-5 flex items-start justify-between'
      }
    >
      {glass ? (
        <>
          <Icon size={20} strokeWidth={2} className={toneFg[tone]} />
          <p className="text-lg sm:text-xl font-bold mt-2 truncate" style={{ letterSpacing: '-0.4px' }}>{value}</p>
          <p className="text-xs text-muted mt-1 truncate">{label}</p>
          {sub && <p className="text-xs text-muted mt-0.5 truncate">{sub}</p>}
        </>
      ) : (
        <>
          <div className="min-w-0">
            <p className="text-sm text-muted truncate">{label}</p>
            <p className="text-xl sm:text-2xl font-bold text-ink-text mt-1.5 truncate">{value}</p>
            {sub && <p className="text-xs text-muted mt-1 truncate">{sub}</p>}
          </div>
          <div className={`rounded-xl p-2.5 shrink-0 ${toneBg[tone]}`}>
            <Icon size={20} strokeWidth={2} />
          </div>
        </>
      )}
    </motion.div>
  )
}
