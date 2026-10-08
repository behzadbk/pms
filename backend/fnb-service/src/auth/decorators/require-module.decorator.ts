import { SetMetadata } from '@nestjs/common'
import type { FeatureKey } from '../tiers'

export const REQUIRE_MODULE_KEY = 'requireModule'
/** این Route/کنترلر فقط وقتی سطح سرویس ساختمان (tier) قابلیت را دارد در دسترس است — ماتریس: auth/tiers.ts */
export const RequireModule = (feature: FeatureKey) => SetMetadata(REQUIRE_MODULE_KEY, feature)
