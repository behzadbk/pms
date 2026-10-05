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

/* ---------- کاتالوگ مشترک (رستوران/کافی‌شاپ + منو) ---------- */

export type VenueKind = 'restaurant' | 'cafe'
/** شناسه‌ی پایدار سمت کلاینت: رستوران v1، کافی‌شاپ v2 (سفارش‌ها و صف آشپزخانه با همین کلید کار می‌کنند) */
export const venueIdOfKind = (k: VenueKind) => (k === 'cafe' ? 'v2' : 'v1')
export const kindOfVenueId = (id: string): VenueKind => (id === 'v2' ? 'cafe' : 'restaurant')

interface CatalogVenueRow { id: string; name: string; kind: VenueKind; billing: FnbVenue['billing']; is_open: boolean; prep_time_minutes: number }
interface CatalogItemRow {
  id: string; venue_kind: VenueKind; category: string; name: string; description: string | null; image_url: string | null
  price: number; availability: MenuItem['availability']; icon: string; color: string; is_daily_special: boolean
}

export async function getCatalog(): Promise<{ venues: FnbVenue[]; menu: MenuItem[] }> {
  const r = await api.get<{ venues: CatalogVenueRow[]; items: CatalogItemRow[] }>('/fnb/catalog')
  const venues: FnbVenue[] = r.venues.map((v) => ({
    id: venueIdOfKind(v.kind), name: v.name, icon: v.kind, isOpen: v.is_open, prepTimeMinutes: v.prep_time_minutes,
    billing: v.billing, categories: ['همه'],
  }))
  const menu: MenuItem[] = r.items.map((i) => ({
    id: i.id, venueId: venueIdOfKind(i.venue_kind), category: i.category, name: i.name, price: i.price, icon: i.icon, color: i.color,
    availability: i.availability, image: i.image_url ?? undefined, description: i.description ?? undefined, isDailySpecial: i.is_daily_special,
  }))
  return { venues, menu }
}

const itemBody = (m: MenuItem) => ({
  venueKind: kindOfVenueId(m.venueId), category: m.category, name: m.name, description: m.description, imageUrl: m.image,
  price: m.price, availability: m.availability, icon: m.icon, color: m.color, isDailySpecial: !!m.isDailySpecial,
})

export function createMenuItem(m: MenuItem) {
  return api.post<{ id: string }>('/fnb/menu-items', itemBody(m))
}
export function updateMenuItem(m: MenuItem) {
  return api.put<{ id: string }>(`/fnb/menu-items/${m.id}`, itemBody(m))
}
export function deleteMenuItemApi(id: string) {
  return api.delete<{ deleted: boolean; hidden?: boolean }>(`/fnb/menu-items/${id}`)
}

/* ---------- سفارش‌ها (روی سرور) ---------- */

interface OrderRow extends Omit<FnbOrder, 'venueId' | 'placedAt'> { venueKind: VenueKind; placedAt: string }
const toOrder = (r: OrderRow): FnbOrder => {
  const { venueKind, ...rest } = r
  return { ...rest, venueId: venueIdOfKind(venueKind), ownerUnit: rest.ownerUnit ?? undefined, deliveryNote: rest.deliveryNote ?? undefined }
}

export interface PlaceOrderRequest {
  venueId: string
  unitId: string
  deliveryType: DeliveryType
  destinationLabel: string
  ownerLabel?: string
  deliveryNote?: string
  items: { itemId: string; quantity: number }[]
}

/** ثبت سفارش روی سرور؛ id سفارش را برمی‌گرداند */
export async function placeOrderOnServer(i: PlaceOrderRequest): Promise<string> {
  const r = await api.post<{ id: string }>(
    '/fnb/orders',
    { venueKind: kindOfVenueId(i.venueId), unitId: i.unitId, deliveryType: i.deliveryType, destinationLabel: i.destinationLabel, ownerLabel: i.ownerLabel, deliveryNote: i.deliveryNote, items: i.items },
    { idempotencyKey: crypto.randomUUID() },
  )
  return r.id
}

export async function listMyOrders(): Promise<FnbOrder[]> {
  return (await api.get<OrderRow[]>('/fnb/my-orders')).map(toOrder)
}

export async function listStaffOrders(venueId?: string): Promise<FnbOrder[]> {
  const q = venueId ? `?venue=${kindOfVenueId(venueId)}` : ''
  return (await api.get<OrderRow[]>(`/fnb/orders${q}`)).map(toOrder)
}

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
