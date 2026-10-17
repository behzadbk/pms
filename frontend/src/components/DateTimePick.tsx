import { useMemo, useState } from 'react'
import { addDays, dayLabel, relDay, tehranParts, tehranToday } from '../lib/tehran'
import { fa } from '../lib/api/residents'

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO با آفست تهران (+۰۳:۳۰؛ ایران ساعت تابستانی ندارد) */
export function composeTehran(date: string, hh: number, mm: number) {
  return new Date(`${date}T${pad(hh)}:${pad(mm)}:00+03:30`).toISOString()
}

/**
 * انتخاب روز + ساعت به وقت تهران: چیپ‌های روز (امروز، فردا، …) و ساعت با گام ۳۰ دقیقه.
 * فقط وقتی هم روز و هم ساعت مشخص است onChange با ISO صدا زده می‌شود.
 */
export function DateTimePick({
  label,
  value,
  onChange,
  days = 14,
  fromHour = 6,
  toHour = 23,
}: {
  label: string
  value: string
  onChange: (iso: string) => void
  days?: number
  fromHour?: number
  toHour?: number
}) {
  const init = value ? tehranParts(value) : null
  const [date, setDate] = useState(init?.date ?? '')
  const [time, setTime] = useState(init ? `${pad(init.hour)}:${init.minute < 30 ? '00' : '30'}` : '')
  const list = useMemo(() => Array.from({ length: days }, (_, i) => addDays(tehranToday(), i)), [days])
  const times = useMemo(() => {
    const out: string[] = []
    for (let h = fromHour; h <= toHour; h++) {
      out.push(`${pad(h)}:00`)
      if (h < toHour) out.push(`${pad(h)}:30`)
    }
    return out
  }, [fromHour, toHour])

  function emit(d: string, t: string) {
    if (!d || !t) return
    const [hh, mm] = t.split(':').map(Number)
    onChange(composeTehran(d, hh, mm))
  }

  return (
    <div className="px-4 py-2">
      <span className="block text-xs text-[var(--hm-t2)]" id="dtp-label">{label}</span>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="radiogroup" aria-labelledby="dtp-label">
        {list.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={date === d}
            data-on={date === d}
            className="hm-chip !min-h-[52px] !px-4 shrink-0 flex flex-col items-center justify-center leading-5"
            onClick={() => {
              setDate(d)
              emit(d, time)
            }}
          >
            <span>{relDay(d)}</span>
            <span className="text-[11px] font-medium opacity-80">{dayLabel(d).split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>
      <label className="block mt-2">
        <span className="block text-xs text-[var(--hm-t2)]">ساعت</span>
        <select
          className="hm-input mt-0.5"
          value={time}
          onChange={(e) => {
            setTime(e.target.value)
            emit(date, e.target.value)
          }}
        >
          <option value="">انتخاب ساعت…</option>
          {times.map((t) => (
            <option key={t} value={t}>
              {fa(t)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
