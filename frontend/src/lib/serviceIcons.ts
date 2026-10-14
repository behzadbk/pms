import { Car, Droplets, Flower2, HandHelping, House, Shirt, Sparkles, Truck, Wrench, Zap, type LucideIcon } from 'lucide-react'

/** آیکن خدمات (service_types.icon) */
export const SERVICE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  car: { icon: Car, label: 'کارواش / خودرو' },
  cleaning: { icon: Sparkles, label: 'نظافت' },
  home: { icon: House, label: 'خانه‌داری' },
  laundry: { icon: Shirt, label: 'خشکشویی / لباس' },
  repair: { icon: Wrench, label: 'تعمیرات' },
  electric: { icon: Zap, label: 'برق' },
  water: { icon: Droplets, label: 'آب و لوله‌کشی' },
  garden: { icon: Flower2, label: 'فضای سبز' },
  move: { icon: Truck, label: 'حمل و جابه‌جایی' },
  other: { icon: HandHelping, label: 'سایر' },
}
export const serviceIcon = (id: string | null | undefined): LucideIcon => SERVICE_ICONS[id ?? '']?.icon ?? HandHelping
