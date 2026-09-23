/**
 * داشبورد لاگ — بخش ۴.۳ سند docs/UPDATE-V2-AUDIT-FNB-DESIGN.md.
 * نوار فیلتر چسبان + نمودار حجم لاگ + ردیف‌های رنگ‌کدشده + پنل «زنجیره رویداد»
 * (Event Chaining، بخش ۳.۱: GET /audit/logs/:id/context) که با کلیک روی هر
 * ردیف باز می‌شود و تمام لاگ‌های همان session_id را حول رویداد هدف نشان می‌دهد.
 */
import { useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Bug, Copy, Info, Search, X } from 'lucide-react'
import { GlassCard, GlassPill } from '../../components/ui/Glass'
import { auditLogs, auditVolume } from '../../lib/mockData'
import type { AuditLogEntry, LogLevel } from '../../lib/types'

const LEVELS: { key: LogLevel | 'all'; label: string }[] = [
  { key: 'all', label: 'همه سطوح' },
  { key: 'error', label: 'خطا' },
  { key: 'warn', label: 'هشدار' },
  { key: 'info', label: 'اطلاعات' },
  { key: 'debug', label: 'دیباگ' },
]

const levelMeta: Record<LogLevel, { color: string; soft: string; icon: typeof Info }> = {
  error: { color: 'var(--lg-danger)', soft: 'var(--lg-danger-soft)', icon: AlertCircle },
  warn: { color: 'var(--lg-warning)', soft: 'var(--lg-warning-soft)', icon: AlertTriangle },
  info: { color: 'var(--lg-success)', soft: 'var(--lg-success-soft)', icon: Info },
  debug: { color: 'var(--lg-text-tertiary)', soft: 'var(--lg-bg-base)', icon: Bug },
}

export function AdminAuditLog() {
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const [source, setSource] = useState('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)

  const sources = useMemo(() => Array.from(new Set(auditLogs.map((l) => l.source))), [])

  const filtered = auditLogs.filter((l) => {
    if (level !== 'all' && l.level !== level) return false
    if (source !== 'all' && l.source !== source) return false
    if (q && !l.action.toLowerCase().includes(q.toLowerCase()) && !l.httpPath?.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const chain = useMemo(() => {
    if (!selected) return []
    return auditLogs
      .filter((l) => l.sessionId === selected.sessionId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  }, [selected])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">داشبورد لاگ</h1>
        <p className="text-[var(--lg-text-secondary)] text-sm mt-1">جستجو، فیلتر و بازسازی زنجیره‌ی رویداد کاربر — منبع audit-svc</p>
      </div>

      {/* نوار فیلتر چسبان */}
      <div className="lg-glass sticky top-2 z-20 p-3 rounded-2xl flex flex-wrap items-center gap-2">
        {LEVELS.map((lv) => (
          <button
            key={lv.key}
            onClick={() => setLevel(lv.key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              level === lv.key
                ? 'bg-[var(--lg-primary)] text-white border-[var(--lg-primary)]'
                : 'bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)] border-[var(--lg-border-hairline)]'
            }`}
          >
            {lv.label}
          </button>
        ))}
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-bold border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)] text-[var(--lg-text-secondary)]"
        >
          <option value="all">همه سرویس‌ها</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex-1 min-w-[160px] flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)]">
          <Search size={15} className="text-[var(--lg-text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی action یا مسیر…"
            className="flex-1 outline-none text-xs bg-transparent"
          />
        </div>
      </div>

      {/* نمودار حجم لاگ */}
      <GlassCard className="p-4">
        <p className="font-bold text-sm mb-3">حجم لاگ در زمان</p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={auditVolume}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--lg-text-tertiary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid var(--lg-border-hairline)', fontSize: 12 }}
                formatter={(value, name) => [value, name === 'count' ? 'کل لاگ‌ها' : 'خطاها']}
              />
              <Bar dataKey="count" fill="var(--lg-primary)" radius={[6, 6, 2, 2]} />
              <Bar dataKey="errorCount" fill="var(--lg-danger)" radius={[6, 6, 2, 2]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* ردیف‌های لاگ */}
      <GlassCard className="p-2">
        {filtered.length === 0 && (
          <p className="text-center text-[var(--lg-text-tertiary)] text-sm py-8">لاگی با این فیلتر یافت نشد</p>
        )}
        {filtered.map((log) => {
          const meta = levelMeta[log.level]
          const Icon = meta.icon
          return (
            <button
              key={log.id}
              onClick={() => setSelected(log)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--lg-bg-base)] text-right transition-colors"
            >
              <span className="rounded-lg p-1.5 shrink-0" style={{ color: meta.color, background: meta.soft }}>
                <Icon size={15} />
              </span>
              <span className="text-xs text-[var(--lg-text-tertiary)] shrink-0 w-20" dir="ltr">{log.occurredAt}</span>
              <span className="flex-1 min-w-0 text-sm font-semibold truncate">{log.action}</span>
              {log.statusCode !== undefined && (
                <GlassPill tone={log.statusCode >= 500 ? 'danger' : log.statusCode >= 400 ? 'warning' : 'success'}>
                  {log.statusCode}
                </GlassPill>
              )}
              {log.durationMs !== undefined && (
                <span className="text-xs text-[var(--lg-text-tertiary)] shrink-0 hidden sm:inline">{log.durationMs}ms</span>
              )}
              <span className="text-xs text-[var(--lg-text-tertiary)] shrink-0 hidden md:inline">{log.device?.browser}/{log.device?.os}</span>
            </button>
          )
        })}
      </GlassCard>

      {/* پنل جزئیات + زنجیره رویداد */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              className="lg-glass fixed top-0 bottom-0 left-0 z-50 w-full max-w-md p-5 overflow-y-auto"
              style={{ borderRadius: '0 var(--lg-radius-sheet) var(--lg-radius-sheet) 0' }}
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-extrabold text-base">جزئیات و زنجیره رویداد</p>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-full hover:bg-[var(--lg-bg-base)]">
                  <X size={18} />
                </button>
              </div>

              <GlassCard className="p-3.5 mb-4 space-y-1.5 text-sm">
                <Row k="اکشن" v={selected.action} />
                <Row k="سطح" v={selected.level} />
                <Row k="سرویس" v={selected.source} />
                {selected.httpPath && <Row k="مسیر" v={`${selected.httpMethod} ${selected.httpPath}`} />}
                {selected.statusCode !== undefined && <Row k="کد پاسخ" v={String(selected.statusCode)} />}
                {selected.durationMs !== undefined && <Row k="زمان پاسخ" v={`${selected.durationMs}ms`} />}
                {selected.device && <Row k="دستگاه" v={`${selected.device.browser} · ${selected.device.os}`} />}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[var(--lg-text-secondary)] text-xs">trace_id</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(selected.traceId)}
                    className="flex items-center gap-1 text-xs font-mono text-[var(--lg-primary)]"
                  >
                    <Copy size={12} />
                    {selected.traceId}
                  </button>
                </div>
              </GlassCard>

              <p className="font-bold text-sm mb-3">زنجیره رویداد نشست — {chain.length} لاگ</p>
              <div>
                {chain.map((c) => {
                  const isTarget = c.id === selected.id
                  const meta = levelMeta[c.level]
                  return (
                    <div key={c.id} className="flex gap-3 pb-4">
                      <div className="flex flex-col items-center w-2 shrink-0 pt-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: isTarget ? 'var(--lg-primary)' : meta.color }}
                        />
                        <span className="w-px flex-1 bg-[var(--lg-border-hairline)] mt-1" />
                      </div>
                      <div className={`flex-1 -mt-0.5 ${isTarget ? 'rounded-xl bg-[var(--lg-primary-soft)] p-2.5' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm ${isTarget ? 'font-extrabold text-[var(--lg-primary)]' : 'font-medium'}`}>{c.action}</span>
                          <span className="text-xs text-[var(--lg-text-tertiary)]" dir="ltr">{c.occurredAt}</span>
                        </div>
                        {c.statusCode !== undefined && (
                          <span className="text-xs text-[var(--lg-text-tertiary)]">{c.httpMethod} · {c.statusCode}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--lg-text-secondary)] text-xs">{k}</span>
      <span className="font-semibold text-xs">{v}</span>
    </div>
  )
}
