import { useState, type ReactNode } from 'react'
import { JALALI_MONTHS } from '../../lib/jalali'
import { currentPeriod } from '../../lib/api/finance'
import { SelectField, TextField } from '../ui/Modal'

/** رقم‌ها را لاتین گروه‌بندی‌شده نشان می‌دهد و فقط عدد می‌گیرد */
export function MoneyField({ label, value, onChange, hint, className }: { label: string; value: number; onChange: (n: number) => void; hint?: string; className?: string }) {
  return (
    <TextField
      className={className}
      label={label}
      hint={hint}
      inputMode="numeric"
      dir="ltr"
      value={value ? value.toLocaleString('en-US') : ''}
      placeholder="۰"
      onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
    />
  )
}

/** انتخاب ماه و سال شمسی → 'YYYY-MM' */
export function PeriodPicker({ value, onChange, label = 'دوره‌ی شارژ' }: { value: string; onChange: (p: string) => void; label?: string }) {
  const [y, m] = value.split('-').map(Number)
  const cy = Number(currentPeriod().slice(0, 4))
  const years = [cy - 1, cy, cy + 1]
  const set = (yy: number, mm: number) => onChange(`${yy}-${String(mm).padStart(2, '0')}`)
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label={label} value={String(m)} onChange={(e) => set(y, Number(e.target.value))} options={JALALI_MONTHS.map((n, i) => ({ value: String(i + 1), label: n }))} />
      <SelectField label="سال" value={String(y)} onChange={(e) => set(Number(e.target.value), m)} options={years.map((v) => ({ value: String(v), label: v.toLocaleString('fa-IR', { useGrouping: false }) }))} />
    </div>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'good'; children: ReactNode }) {
  const cls = tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'good' ? 'bg-good-soft text-good' : 'bg-tile-soft text-tile'
  return <p className={`text-xs leading-6 rounded-xl px-3.5 py-2.5 ${cls}`}>{children}</p>
}

export function useBusy() {
  const [busy, setBusy] = useState(false)
  return {
    busy,
    run: async (fn: () => Promise<unknown>) => {
      setBusy(true)
      try {
        await fn()
      } finally {
        setBusy(false)
      }
    },
  }
}

export const TH = 'font-medium px-4 sm:px-5 py-2.5 whitespace-nowrap'
export const TD = 'px-4 sm:px-5 py-3'
