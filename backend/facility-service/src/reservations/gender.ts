import { BadRequestException } from '@nestjs/common'
import { toJalali } from './jalali'
import { weekdayOf } from './schedule'

export type Gender = 'women' | 'men'
export type GenderSplit =
  | { mode: 'parity'; even: Gender; odd: Gender }
  | { mode: 'weekday'; days: Record<string, Gender | null> }
  | { mode: 'hours'; ranges: { from: number; to: number; gender: Gender }[] }

const G = (v: unknown): v is Gender => v === 'women' || v === 'men'

/** اعتبارسنجی و پاک‌سازی تنظیم تفکیک؛ null = بدون تفکیک */
export function normalizeSplit(raw: unknown): GenderSplit | null {
  if (raw == null) return null
  const r = raw as Record<string, unknown>
  if (r.mode === 'parity') {
    if (!G(r.even) || !G(r.odd)) throw new BadRequestException('جنسیت روزهای زوج و فرد را مشخص کنید')
    return { mode: 'parity', even: r.even, odd: r.odd }
  }
  if (r.mode === 'weekday') {
    const days: Record<string, Gender | null> = {}
    for (let i = 0; i < 7; i++) {
      const v = (r.days as Record<string, unknown> | undefined)?.[String(i)]
      days[String(i)] = G(v) ? v : null
    }
    return { mode: 'weekday', days }
  }
  if (r.mode === 'hours') {
    const list = Array.isArray(r.ranges) ? r.ranges : []
    const ranges = list.map((x: { from?: unknown; to?: unknown; gender?: unknown }) => {
      const from = Number(x.from), to = Number(x.to)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 24 || from >= to || !G(x.gender)) throw new BadRequestException('بازه‌ی ساعتی تفکیک نامعتبر است')
      return { from, to, gender: x.gender as Gender }
    })
    if (ranges.length > 8) throw new BadRequestException('حداکثر ۸ بازه')
    const s = [...ranges].sort((a, b) => a.from - b.from)
    for (let i = 1; i < s.length; i++) if (s[i].from < s[i - 1].to) throw new BadRequestException('بازه‌های ساعتی همپوشانی دارند')
    return { mode: 'hours', ranges: s }
  }
  throw new BadRequestException('نوع تفکیک نامعتبر است')
}

/** جنسیتِ مجاز یک ساعتِ مشخص؛ null = مشترک */
export function genderAt(split: GenderSplit | null | undefined, date: string, hour: number): Gender | null {
  if (!split) return null
  if (split.mode === 'parity') {
    const [y, m, d] = date.split('-').map(Number)
    return toJalali(y, m, d).jd % 2 === 0 ? split.even : split.odd
  }
  if (split.mode === 'weekday') return split.days[String(weekdayOf(date))] ?? null
  return split.ranges.find((r) => hour >= r.from && hour < r.to)?.gender ?? null
}
