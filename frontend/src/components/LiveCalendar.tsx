import { useState } from 'react'
import { Radio } from 'lucide-react'
import type { Amenity, CalendarSlot } from '../lib/types'
import { generateDaySlots } from '../lib/mockData'

const statusStyle: Record<CalendarSlot['status'], string> = {
  available: 'bg-good-soft text-good border-good/30 hover:border-good cursor-pointer',
  pending_approval: 'bg-warn-soft text-warn border-warn/30',
  confirmed: 'bg-bad-soft text-bad border-bad/30',
  maintenance: 'bg-slate-200 text-slate-500 border-slate-300',
  past: 'bg-canvas text-muted/50 border-line',
}

const statusLabel: Record<CalendarSlot['status'], string> = {
  available: 'خالی',
  pending_approval: 'در انتظار تایید',
  confirmed: 'رزروشده',
  maintenance: 'تعمیرات',
  past: 'گذشته',
}

const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

interface LiveCalendarProps {
  amenity: Amenity
  onSelectSlot?: (slot: CalendarSlot, dayIndex: number) => void
  selectable?: boolean
}

export function LiveCalendar({ amenity, onSelectSlot, selectable = true }: LiveCalendarProps) {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [dayIndex, setDayIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)

  const weekData = days.map((_, i) => generateDaySlots(amenity.id, i))

  function pick(slot: CalendarSlot, dIdx: number = dayIndex) {
    if (!selectable || slot.status !== 'available') return
    setSelected(slot.id)
    onSelectSlot?.(slot, dIdx)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-tile bg-tile-soft px-2.5 py-1 rounded-full">
          <Radio size={12} className="animate-pulse" />
          تقویم زنده — به‌روزرسانی آنی
        </div>
        <div className="flex gap-1.5 bg-canvas rounded-xl p-1">
          <button
            onClick={() => setView('day')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === 'day' ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}
          >
            روزانه
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === 'week' ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}
          >
            هفتگی
          </button>
        </div>
      </div>

      {view === 'day' && (
        <>
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
            {days.map((d, i) => (
              <button
                key={d}
                onClick={() => setDayIndex(i)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium border ${
                  dayIndex === i ? 'bg-ink text-white border-ink' : 'border-line text-muted hover:border-ink-soft'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {weekData[dayIndex].map((slot) => (
              <button
                key={slot.id}
                onClick={() => pick(slot)}
                disabled={!selectable || slot.status !== 'available'}
                className={`rounded-xl border px-2 py-3 text-center transition-all ${statusStyle[slot.status]} ${
                  selected === slot.id ? 'ring-2 ring-ink' : ''
                }`}
              >
                <p className="text-sm font-semibold">{slot.startHour}:۰۰</p>
                <p className="text-[10px] mt-1">{slot.unitLabel ?? statusLabel[slot.status]}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'week' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th className="w-16"></th>
                {days.map((d) => <th key={d} className="font-medium text-muted pb-1">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {generateDaySlots(amenity.id, 0).map((_, hourIdx) => (
                <tr key={hourIdx}>
                  <td className="text-muted text-[11px] pl-2 whitespace-nowrap">
                    {generateDaySlots(amenity.id, 0)[hourIdx].startHour}:۰۰
                  </td>
                  {days.map((_, dIdx) => {
                    const slot = weekData[dIdx][hourIdx]
                    return (
                      <td key={dIdx}>
                        <div
                          title={statusLabel[slot.status]}
                          className={`h-6 rounded-md border ${statusStyle[slot.status]} ${selectable && slot.status === 'available' ? '' : 'cursor-default'}`}
                          onClick={() => pick(slot, dIdx)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-muted">
        {(['available', 'pending_approval', 'confirmed', 'maintenance'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full border ${statusStyle[s].split(' ')[0]} ${statusStyle[s].split(' ')[2]}`} />
            {statusLabel[s]}
          </span>
        ))}
      </div>
    </div>
  )
}
