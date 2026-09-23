import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`bg-card rounded-2xl border border-line shadow-sm ${className}`}
    >
      {children}
    </motion.div>
  )
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3 gap-3">
      <h3 className="font-semibold text-ink-text">{title}</h3>
      {action}
    </div>
  )
}
