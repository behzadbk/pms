import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { tickets as allTickets } from '../../lib/mockData'
import type { TicketStatus } from '../../lib/types'

const filters: { id: TicketStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'open', label: 'باز' },
  { id: 'in_progress', label: 'در حال انجام' },
  { id: 'resolved', label: 'حل‌شده' },
]

export function AdminTickets() {
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all')
  const list = filter === 'all' ? allTickets : allTickets.filter((t) => t.status === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تیکت‌ها و گزارش‌ها</h1>
        <p className="text-muted text-sm mt-1">پیگیری گزارش‌های خرابی، انتقادات و پیشنهادات ساکنین</p>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${
              filter === f.id ? 'bg-ink text-white border-ink' : 'border-line text-ink-text hover:border-ink-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`${list.length} تیکت`} />
        <div className="px-5 pb-5 space-y-3">
          {list.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-line">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{t.subject}</p>
                  <StatusPill status={t.priority} />
                </div>
                <p className="text-xs text-muted mt-1">{t.unit} · {t.category} · {t.createdAt}</p>
              </div>
              <StatusPill status={t.status} />
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-muted text-center py-6">تیکتی در این وضعیت وجود ندارد</p>}
        </div>
      </Card>
    </div>
  )
}
