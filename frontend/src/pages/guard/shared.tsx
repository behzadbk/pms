import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { guardApi, type UnitOption } from '../../lib/api/guard'
import { fa } from '../../lib/api/residents'
import { tehranParts } from '../../lib/tehran'

/** ساعت به وقت تهران، مثل «۰۸:۱۲» */
export function fmtTime(iso: string) {
  const p = tehranParts(iso)
  return fa(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`)
}

/** تپ‌پذیر برای نگهبان: جست‌وجوی واحد از دیتابیس (شماره‌ی واحد) و انتخاب با یک لمس */
export function UnitPicker({ value, onChange, placeholder = 'شماره‌ی واحد را بنویسید' }: { value: UnitOption | null; onChange: (u: UnitOption | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<UnitOption[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      guardApi.units(q.trim()).then(setList).catch(() => setList([]))
    }, 180)
    return () => clearTimeout(t)
  }, [q, open])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-tile bg-tile-soft px-3.5 py-2.5 text-sm min-h-[46px]">
        <span className="font-medium">واحد {fa(value.no)}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="تغییر واحد" className="p-1 text-muted"><X size={15} /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        placeholder={placeholder}
        inputMode="numeric"
        className="w-full rounded-xl border border-line pr-9 pl-3.5 py-2.5 text-sm min-h-[46px] bg-card"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-line bg-card shadow-lg">
          {list.length === 0 && <p className="px-3.5 py-3 text-xs text-muted">واحدی پیدا نشد</p>}
          {list.map((u) => (
            <button key={u.id} type="button" onClick={() => { onChange(u); setOpen(false); setQ('') }} className="w-full text-right px-3.5 py-3 text-sm hover:bg-canvas flex justify-between min-h-[44px]">
              <span>واحد {fa(u.no)}</span>
              {u.floor !== null && <span className="text-xs text-muted">طبقه {fa(u.floor)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
