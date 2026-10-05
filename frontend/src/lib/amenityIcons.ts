import { Baby, Clapperboard, Coffee, Dumbbell, PartyPopper, Presentation, Trees, Trophy, Users, Waves, Volleyball, Sofa, type LucideIcon } from 'lucide-react'

/** آیکن مشاعات: همان شناسه‌های ذخیره‌شده در دیتابیس (amenities.icon) */
export const AMENITY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  pool: { icon: Waves, label: 'استخر' },
  fitness_center: { icon: Dumbbell, label: 'باشگاه' },
  groups: { icon: Users, label: 'سالن' },
  meeting_room: { icon: Presentation, label: 'جلسات' },
  deck: { icon: Trees, label: 'روف‌گاردن' },
  park: { icon: Sofa, label: 'فضای سبز' },
  movie: { icon: Clapperboard, label: 'سینما' },
  sports_tennis: { icon: Trophy, label: 'تنیس/بیلیارد' },
  sports_soccer: { icon: Volleyball, label: 'زمین ورزشی' },
  local_cafe: { icon: Coffee, label: 'کافه' },
  child_care: { icon: Baby, label: 'کودک' },
  celebration: { icon: PartyPopper, label: 'مراسم' },
}
export const amenityIcon = (id: string | null | undefined): LucideIcon => AMENITY_ICONS[id ?? '']?.icon ?? Users
