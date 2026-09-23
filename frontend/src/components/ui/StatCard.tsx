import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'ink',
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: 'ink' | 'tile' | 'brass' | 'bad'
}) {
  const toneBg: Record<string, string> = {
    ink: 'bg-ink text-white',
    tile: 'bg-tile text-white',
    brass: 'bg-brass text-white',
    bad: 'bg-bad text-white',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="bg-card rounded-2xl border border-line shadow-sm p-4 sm:p-5 flex items-start justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm text-muted truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-ink-text mt-1.5 truncate">{value}</p>
        {sub && <p className="text-xs text-muted mt-1 truncate">{sub}</p>}
      </div>
      <div className={`rounded-xl p-2.5 shrink-0 ${toneBg[tone]}`}>
        <Icon size={20} strokeWidth={2} />
      </div>
    </motion.div>
  )
}
