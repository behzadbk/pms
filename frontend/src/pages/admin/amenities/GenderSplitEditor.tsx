import { Plus, Trash2 } from 'lucide-react'
import { Seg } from '../../../components/hm'
import { fa } from '../../../lib/api/residents'
import { GENDER_LABEL, type Gender, type GenderSplit } from '../../../lib/api/amenities'
import { WEEKDAYS_FA } from '../../../lib/tehran'

type Mode = 'none' | 'parity' | 'weekday' | 'hours'
const G_OPTS: [Gender, string][] = [['women', GENDER_LABEL.women], ['men', GENDER_LABEL.men]]
const opposite = (g: Gender): Gender => (g === 'women' ? 'men' : 'women')

/** تفکیک بانوان/آقایان: روز زوج و فرد، روز هفته، یا بازه‌ی ساعتی در هر روز */
export function GenderSplitEditor({ value, onChange }: { value: GenderSplit | null; onChange: (v: GenderSplit | null) => void }) {
  const mode: Mode = value?.mode ?? 'none'
  function pick(m: Mode) {
    if (m === 'none') return onChange(null)
    if (m === 'parity') return onChange({ mode: 'parity', even: 'women', odd: 'men' })
    if (m === 'weekday') return onChange({ mode: 'weekday', days: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i), null])) })
    onChange({ mode: 'hours', ranges: [{ from: 6, to: 16, gender: 'women' }, { from: 16, to: 22, gender: 'men' }] })
  }
  return (
    <div className="flex flex-col gap-3">
      <Seg<Mode> options={[['none', 'بدون تفکیک'], ['parity', 'زوج / فرد'], ['weekday', 'روز هفته'], ['hours', 'ساعتی']]} value={mode} onChange={pick} />
      {value?.mode === 'parity' && (
        <div className="hm-card p-3 flex flex-col gap-2">
          <p className="text-sm font-bold">روزهای زوج</p>
          <Seg<Gender> options={G_OPTS} value={value.even} onChange={(g) => onChange({ mode: 'parity', even: g, odd: opposite(g) })} />
          <p className="text-xs text-[var(--hm-t2)]">روزهای فرد: {GENDER_LABEL[value.odd]}</p>
        </div>
      )}
      {value?.mode === 'weekday' && (
        <div className="hm-card hm-divided">
          {WEEKDAYS_FA.map((n, i) => {
            const cur = value.days[String(i)] ?? null
            return (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <p className="flex-1 text-sm font-bold">{n}</p>
                <Seg<'all' | Gender>
                  className="w-[232px] shrink-0"
                  options={[['all', 'مشترک'], ...G_OPTS]}
                  value={cur ?? 'all'}
                  onChange={(g) => onChange({ mode: 'weekday', days: { ...value.days, [String(i)]: g === 'all' ? null : g } })}
                />
              </div>
            )
          })}
        </div>
      )}
      {value?.mode === 'hours' && (
        <div className="flex flex-col gap-2">
          {value.ranges.map((r, i) => {
            const upd = (p: Partial<typeof r>) => onChange({ mode: 'hours', ranges: value.ranges.map((x, j) => (j === i ? { ...x, ...p } : x)) })
            return (
              <div key={i} className="hm-card p-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[var(--hm-t2)]">
                  از
                  <select className="hm-input !w-auto rounded-xl border border-[var(--hm-hair)] min-h-[40px] px-2" value={r.from} onChange={(e) => upd({ from: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fa(String(h).padStart(2, '0'))}:۰۰</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs text-[var(--hm-t2)]">
                  تا
                  <select className="hm-input !w-auto rounded-xl border border-[var(--hm-hair)] min-h-[40px] px-2" value={r.to} onChange={(e) => upd({ to: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{fa(String(h).padStart(2, '0'))}:۰۰</option>)}
                  </select>
                </label>
                <Seg<Gender> className="w-[168px] shrink-0" options={G_OPTS} value={r.gender} onChange={(g) => upd({ gender: g })} />
                <button className="hm-back ms-auto" aria-label="حذف بازه" onClick={() => onChange({ mode: 'hours', ranges: value.ranges.filter((_, j) => j !== i) })}>
                  <Trash2 size={18} />
                </button>
              </div>
            )
          })}
          {value.ranges.length < 8 && (
            <button className="lg4-capsule min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-bold" onClick={() => onChange({ mode: 'hours', ranges: [...value.ranges, { from: 6, to: 8, gender: 'women' }] })}>
              <Plus size={18} /> بازه‌ی جدید
            </button>
          )}
        </div>
      )}
    </div>
  )
}
