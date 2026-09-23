export type OrderStatus =
  | 'draft' | 'placed' | 'accepted' | 'rejected' | 'preparing'
  | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'

/**
 * State machine چرخه عمر سفارش — بخش ۱.۴ سند UPDATE-V2.
 * گذارهای مجاز فقط در سرور اعتبارسنجی می‌شوند؛ کلاینت هرگز مرجع نیست.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['placed', 'cancelled'],
  placed: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  rejected: [],
  cancelled: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/** وضعیت‌هایی که موجودی رزروشده باید در آن‌ها آزاد شود */
export const RELEASES_STOCK: OrderStatus[] = ['rejected', 'cancelled']
