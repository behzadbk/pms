import { BadRequestException } from '@nestjs/common'
import { isIsoDate } from './jalali'

/** اعتبارسنجی ورودی بدنه‌ی درخواست — خطای ۴۰۰ با پیام فارسی */
export function bad(msg: string): never {
  throw new BadRequestException(msg)
}

export function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad('بدنه‌ی درخواست نامعتبر است')
  return v as Record<string, unknown>
}

export function str(v: unknown, label: string, o: { max?: number; required?: boolean } = {}): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (o.required) bad(`${label} الزامی است`)
    return undefined
  }
  if (typeof v !== 'string') bad(`${label} نامعتبر است`)
  const s = (v as string).trim()
  if (!s && o.required) bad(`${label} الزامی است`)
  if (s.length > (o.max ?? 500)) bad(`${label} بیش از حد طولانی است`)
  return s
}

export function num(v: unknown, label: string, o: { min?: number; max?: number; int?: boolean; required?: boolean } = {}): number | undefined {
  if (v === undefined || v === null || v === '') {
    if (o.required) bad(`${label} الزامی است`)
    return undefined
  }
  const x = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(x)) bad(`${label} باید عدد باشد`)
  if (o.int && !Number.isInteger(x)) bad(`${label} باید عدد صحیح باشد`)
  if (o.min !== undefined && x < o.min) bad(`${label} نباید کمتر از ${o.min} باشد`)
  if (o.max !== undefined && x > o.max) bad(`${label} نباید بیشتر از ${o.max} باشد`)
  return x
}

export function bool(v: unknown, label: string): boolean | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'boolean') bad(`${label} نامعتبر است`)
  return v as boolean
}

export function isoDate(v: unknown, label: string, required = false): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (required) bad(`${label} الزامی است`)
    return undefined
  }
  if (!isIsoDate(v)) bad(`${label} باید به شکل YYYY-MM-DD باشد`)
  return v as string
}
