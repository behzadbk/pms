import { useState } from 'react'
import { Copy } from 'lucide-react'
import { fa } from '../../../lib/api/residents'
import { WEEKDAYS_FA, hourLabel } from '../../../lib/tehran'

export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // ۰۶ تا ۲۳

const PRESETS: [string, number[]][] = [
  ['صبح ۸–۱۲', [8, 9, 10, 11]],
  ['عصر ۱۶–۲۲', [16, 17, 18, 19, 20, 21]],
  ['تمام روز ۸–۲۲', Array.from({ length: 14 }, (_, i) => i + 8)],
  ['بسته', []],
]

/** برنامه‌ی هفتگی: ۷ روز × ساعت‌های قابل رزرو. روی موبایل روز-به-روز، روی دسکتاپ ماتریس کامل. */
export function ScheduleEditor({ value, onChange }: { value: number[][]; onChange: (v: number[][]) => void }) {
  const [day, setDay] = useState(0)
  const toggle = (d: number, h: number) => onChange(value.map((hs, i) => (i !== d ? hs : hs.includes(h) ? hs.filter((x) => x !== h) : [...hs, h].sort((a, b) => a - b))))
  const setDayHours = (d: number, hs: number[]) => onChange(value.map((x, i) => (i === d ? hs : x)))
  const copyToAll = (d: number) => onChange(value.map(() => [...value[d]]))

  return (
    <div className="flex flex-col gap-3">
      {/* موبایل/تبلت: انتخاب روز + شبکه‌ی ساعت */}
      <div className="xl:hidden flex flex-col gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {WEEKDAYS_FA.map((n, i) => (
            <button key={n} className="hm-chip !min-h-[40px]" data-on={day === i} onClick={() => setDay(i)}>
              {n}
              {value[i].length > 0 && <span className="ms-1.5 opacity-70">{fa(value[i].length)}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([l, hs]) => (
            <button key={l} className="hm-chip" onClick={() => setDayHours(day, hs)}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {HOURS.map((h) => (
            <HourChip key={h} h={h} on={value[day].includes(h)} onClick={() => toggle(day, h)} />
          ))}
        </div>
        <button className="inline-flex items-center gap-2 text-sm font-bold text-[var(--hm-pri)] self-start min-h-[44px]" onClick={() => copyToAll(day)}>
          <Copy size={16} /> اعمال برنامه‌ی «{WEEKDAYS_FA[day]}» روی همه‌ی روزها
        </button>
      </div>

      {/* دسکتاپ: ماتریس */}
      <div className="hidden xl:block">
        <div>
          <div className="grid items-center gap-1" style={{ gridTemplateColumns: `72px repeat(${HOURS.length}, minmax(0,1fr)) 32px` }}>
            <span />
            {HOURS.map((h) => (
              <span key={h} className="text-center text-[11px] text-[var(--hm-t2)]">
                {fa(h)}
              </span>
            ))}
            <span />
            {WEEKDAYS_FA.map((n, d) => (
              <Row key={n} name={n} hours={value[d]} onToggle={(h) => toggle(d, h)} onCopy={() => copyToAll(d)} onClear={() => setDayHours(d, [])} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ name, hours, onToggle, onCopy, onClear }: { name: string; hours: number[]; onToggle: (h: number) => void; onCopy: () => void; onClear: () => void }) {
  return (
    <>
      <span className="text-sm font-bold">{name}</span>
      {HOURS.map((h) => (
        <button
          key={h}
          aria-label={`${name} ساعت ${hourLabel(h)}`}
          aria-pressed={hours.includes(h)}
          onClick={() => onToggle(h)}
          className="h-9 rounded-md border text-[0px]"
          style={{
            background: hours.includes(h) ? 'var(--hm-pri)' : 'transparent',
            borderColor: hours.includes(h) ? 'var(--hm-pri)' : 'color-mix(in srgb, var(--hm-t3) 40%, transparent)',
          }}
        >
          {h}
        </button>
      ))}
      <button title="کپی روی همه‌ی روزها" aria-label={`کپی ${name} روی همه`} className="h-9 grid place-items-center text-[var(--hm-t2)] hover:text-[var(--hm-pri)]" onClick={onCopy}>
        <Copy size={15} />
      </button>
      <span className="hidden" onClick={onClear} />
    </>
  )
}

function HourChip({ h, on, onClick }: { h: number; on: boolean; onClick: () => void }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className="min-h-[44px] rounded-2xl text-sm font-bold border"
      style={{
        background: on ? 'var(--hm-pri)' : 'var(--lg4-inner)',
        color: on ? '#fff' : 'var(--hm-t1)',
        borderColor: on ? 'var(--hm-pri)' : 'var(--lg4-card-border)',
      }}
    >
      {fa(h)}
    </button>
  )
}
