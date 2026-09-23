import {
  Beef, Cake, Coffee, Cookie, Croissant, Egg, IceCream, Soup, UtensilsCrossed,
  Waves, Drama, Dumbbell, Trees, type LucideIcon,
} from 'lucide-react'

/** نگاشت کلید آیکون در menuItems/fnbVenues به آیکون lucide متناظر */
export const foodIcon: Record<string, LucideIcon> = {
  burger: UtensilsCrossed,
  pasta: Soup,
  steak: Beef,
  egg: Egg,
  cake: Cake,
  icecream: IceCream,
  espresso: Coffee,
  latte: Coffee,
  'iced-coffee': Coffee,
  tea: Cookie,
  croissant: Croissant,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
}

/** آیکون هر منطقه‌ی تحویل مشاعات (بخش ۴.۵ سند) */
export const zoneIcon: Record<string, LucideIcon> = {
  استخر: Waves,
  سینما: Drama,
  بدنسازی: Dumbbell,
  'روف‌گاردن': Trees,
}
