import { BadRequestException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { BuildingTier, TIERS, TIER_IDS } from './tiers'

/**
 * تنظیمات پلتفرم — مقدارها در identity.platform_settings (JSON) و پیش‌فرض‌ها اینجا.
 * فقط کلیدهای فهرست‌شده پذیرفته می‌شوند (جلوی ذخیره‌ی کلید دلخواه را می‌گیرد).
 */
export interface PlatformSettings {
  /** چند روز بعد از سررسید فاکتور، ساختمان بدهکار «معوق جدی» حساب می‌شود */
  graceDays: number
  /** اگر روشن باشد، ساختمانِ بیش از graceDays روز معوق خودکار تعلیق می‌شود (پیش‌فرض خاموش) */
  autoSuspend: boolean
  /** طول دوره‌ی آزمایشی ساختمان تازه‌ساخته‌شده (روز) */
  trialDays: number
  /** اگر روشن باشد، دوره‌ی آزمایشی تمام‌شده خودکار تعلیق می‌شود (پیش‌فرض خاموش) */
  autoSuspendTrial: boolean
  /** قیمت ماهانه‌ی هر واحد به تفکیک سطح (تومان) — جایگزین قیمت پایه‌ی tiers.ts */
  pricePerUnit: Record<BuildingTier, number>
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  graceDays: 10,
  autoSuspend: false,
  trialDays: 14,
  autoSuspendTrial: false,
  pricePerUnit: Object.fromEntries(TIERS.map((t) => [t.id, t.pricePerUnit])) as Record<BuildingTier, number>,
}

const KEYS = ['graceDays', 'autoSuspend', 'trialDays', 'autoSuspendTrial', 'pricePerUnit'] as const

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly db: DatabaseService) {}

  async get(): Promise<PlatformSettings> {
    const rows = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ key: string; value: unknown }>('SELECT key, value FROM identity.platform_settings')
      return r.rows
    })
    const out: PlatformSettings = { ...DEFAULT_SETTINGS, pricePerUnit: { ...DEFAULT_SETTINGS.pricePerUnit } }
    for (const { key, value } of rows) {
      if (key === 'pricePerUnit' && value && typeof value === 'object') {
        out.pricePerUnit = { ...out.pricePerUnit, ...(value as Record<BuildingTier, number>) }
      } else if ((KEYS as readonly string[]).includes(key)) {
        ;(out as unknown as Record<string, unknown>)[key] = value
      }
    }
    return out
  }

  /** فقط کلیدهای ارسال‌شده عوض می‌شوند؛ تغییرهای واقعی برای ثبت در لاگ برمی‌گردند */
  async update(patch: Partial<PlatformSettings>, by: string): Promise<{ settings: PlatformSettings; changes: Record<string, { from: unknown; to: unknown }> }> {
    const before = await this.get()
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const next: Partial<PlatformSettings> = {}

    for (const key of Object.keys(patch)) {
      if (!(KEYS as readonly string[]).includes(key)) throw new BadRequestException(`تنظیم ناشناخته: ${key}`)
    }
    if (patch.graceDays !== undefined) next.graceDays = intIn(patch.graceDays, 0, 365, 'مهلت پرداخت')
    if (patch.trialDays !== undefined) next.trialDays = intIn(patch.trialDays, 0, 365, 'دوره‌ی آزمایشی')
    if (patch.autoSuspend !== undefined) next.autoSuspend = bool(patch.autoSuspend, 'تعلیق خودکار')
    if (patch.autoSuspendTrial !== undefined) next.autoSuspendTrial = bool(patch.autoSuspendTrial, 'تعلیق خودکار پایان آزمایشی')
    if (patch.pricePerUnit !== undefined) {
      const p = { ...before.pricePerUnit }
      for (const [tier, v] of Object.entries(patch.pricePerUnit)) {
        if (!(TIER_IDS as readonly string[]).includes(tier)) throw new BadRequestException(`سطح ناشناخته: ${tier}`)
        p[tier as BuildingTier] = intIn(v, 0, 100_000_000, 'قیمت هر واحد')
      }
      next.pricePerUnit = p
    }

    await this.db.withPlatformAccess(async (c) => {
      for (const [key, value] of Object.entries(next)) {
        const prev = (before as unknown as Record<string, unknown>)[key]
        if (JSON.stringify(prev) === JSON.stringify(value)) continue
        changes[key] = { from: prev, to: value }
        await c.query(
          `INSERT INTO identity.platform_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [key, JSON.stringify(value), by],
        )
      }
    })
    return { settings: await this.get(), changes }
  }
}

function intIn(v: unknown, min: number, max: number, label: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new BadRequestException(`${label} باید عدد صحیح بین ${min} و ${max} باشد`)
  }
  return v
}

function bool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new BadRequestException(`${label} باید true/false باشد`)
  return v
}
