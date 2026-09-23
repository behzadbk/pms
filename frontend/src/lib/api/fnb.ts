/**
 * کلاینت fnb-svc (پورت ۳۰۰۸) — منو، موجودی لحظه‌ای و سفارش غذای مشاعات.
 * مطابق docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۳.۲ و ۳.۳.
 *
 * موجودی لحظه‌ای از طریق WebSocket (namespace /fnb-live) پخش می‌شود؛ اگر
 * کلاینت WebSocket را پشتیبانی نکند، fallback پولینگ با ?since= در سند آمده.
 * پیاده‌سازی WebSocket اینجا یک اتصال lazy با socket.io-client است — فقط
 * وقتی subscribeMenuUpdates فراخوانی شود متصل می‌شود.
 */
import { io, type Socket } from 'socket.io-client'
import type { DeliveryType, FnbOrder, FnbVenue, MenuItem, OrderStatus } from '../types'
import { api } from './client'

export function listVenues() {
  return api.get<FnbVenue[]>('/fnb/venues')
}

export function getVenueMenu(venueId: string) {
  return api.get<MenuItem[]>(`/fnb/venues/${venueId}/menu`)
}

export interface PlaceOrderInput {
  venueId: string
  unitId: string
  deliveryType: DeliveryType
  deliveryZoneId?: string
  deliveryNote?: string
  items: { itemId: string; quantity: number }[]
}

/** ثبت سفارش — Idempotency-Key اجباری تا دابل‌تپ موبایل باعث سفارش تکراری نشود */
export function placeOrder(input: PlaceOrderInput) {
  return api.post<FnbOrder>('/fnb/orders', input, { idempotencyKey: crypto.randomUUID() })
}

export function getOrder(orderId: string) {
  return api.get<FnbOrder>(`/fnb/orders/${orderId}`)
}

export function getUnitOrders(unitId: string) {
  return api.get<FnbOrder[]>(`/fnb/units/${unitId}/orders`)
}

/** فقط تا پیش از وضعیت accepted قابل لغو است */
export function cancelOrder(orderId: string) {
  return api.post<FnbOrder>(`/fnb/orders/${orderId}/cancel`)
}

/** آشپزخانه: گذار وضعیت سفارش (Roles: staff, admin) */
export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return api.patch<FnbOrder>(`/fnb/orders/${orderId}/status`, { status })
}

/** صف زنده آشپزخانه — پایه‌ی صفحه Kitchen Display (Roles: staff, admin) */
export function getKitchenQueue() {
  return api.get<FnbOrder[]>('/fnb/kitchen/queue')
}

export function setItemAvailability(itemId: string, availability: MenuItem['availability'], stockCount?: number) {
  return api.patch<MenuItem>(`/fnb/menu-items/${itemId}/availability`, { availability, stockCount })
}

/* ---------- WebSocket زنده (namespace /fnb-live) ---------- */

export type FnbLiveEvent =
  | { type: 'menu.item.updated'; item: MenuItem }
  | { type: 'venue.status.changed'; venueId: string; isOpen: boolean }
  | { type: 'order.status.changed'; order: FnbOrder }

let socket: Socket | null = null

/** اتصال lazy به /fnb-live — فقط وقتی صفحه‌ای واقعاً به آپدیت زنده نیاز دارد */
export function subscribeFnbLive(tenantId: string, onEvent: (e: FnbLiveEvent) => void): () => void {
  if (!socket) {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
    socket = io(`${base}/fnb-live`, { transports: ['websocket'], autoConnect: true })
  }
  const room = `tenant:${tenantId}`
  socket.emit('join', room)

  const handler = (event: FnbLiveEvent) => onEvent(event)
  socket.on('menu.item.updated', (item: MenuItem) => handler({ type: 'menu.item.updated', item }))
  socket.on('venue.status.changed', (p: { venueId: string; isOpen: boolean }) => handler({ type: 'venue.status.changed', ...p }))
  socket.on('order.status.changed', (order: FnbOrder) => handler({ type: 'order.status.changed', order }))

  return () => {
    socket?.off('menu.item.updated')
    socket?.off('venue.status.changed')
    socket?.off('order.status.changed')
  }
}
