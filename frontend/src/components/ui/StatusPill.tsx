type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'tile'

const toneClasses: Record<Tone, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  neutral: 'bg-canvas text-muted',
  tile: 'bg-tile-soft text-tile',
}

const statusMap: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'پرداخت‌شده', tone: 'good' },
  failed: { label: 'ناموفق', tone: 'bad' },
  pending: { label: 'در انتظار', tone: 'warn' },
  overdue: { label: 'معوق', tone: 'bad' },
  open: { label: 'باز', tone: 'bad' },
  in_progress: { label: 'در حال انجام', tone: 'warn' },
  assigned: { label: 'واگذارشده', tone: 'tile' },
  resolved: { label: 'حل‌شده', tone: 'good' },
  done: { label: 'انجام‌شده', tone: 'good' },
  confirmed: { label: 'تایید‌شده', tone: 'good' },
  cancelled: { label: 'لغوشده', tone: 'neutral' },
  active: { label: 'فعال', tone: 'good' },
  trial: { label: 'دوره آزمایشی', tone: 'tile' },
  suspended: { label: 'معلق', tone: 'bad' },
  used: { label: 'استفاده‌شده', tone: 'neutral' },
  expired: { label: 'منقضی', tone: 'neutral' },
  pending_pickup: { label: 'در انتظار تحویل', tone: 'warn' },
  picked_up: { label: 'تحویل‌شده', tone: 'good' },
  low: { label: 'کم', tone: 'neutral' },
  normal: { label: 'عادی', tone: 'tile' },
  high: { label: 'بالا', tone: 'warn' },
  urgent: { label: 'فوری', tone: 'bad' },
}

export function StatusPill({ status }: { status: string }) {
  const info = statusMap[status] ?? { label: status, tone: 'neutral' as Tone }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[info.tone]}`}>
      {info.label}
    </span>
  )
}
