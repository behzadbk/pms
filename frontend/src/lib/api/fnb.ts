/**
 * کلاینت fnb-svc (پورت ۳۰۰۸، مسیر /api/fnb) — رستوران/کافی‌شاپ، منو، مناطق تحویل و سفارش.
 * همه‌ی داده‌ها از دیتابیس می‌آید؛ هیچ داده‌ی نمایشی در این لایه نیست.
 */
import { api } from './client'

export type VenueKind = 'restaurant' | 'cafe'
export type Availability = 'available' | 'sold_out' | 'hidden'
export type OrderStatus =
  | 'placed' | 'accepted' | 'rejected' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'
export type DeliveryType = 'in_unit' | 'amenity_zone'

export interface Venue {
  id: string
  name: string
  kind: VenueKind
  description: string | null
  is_active: boolean
  /** کلید دستی باز/بسته */
  is_open: boolean
  accepts_delivery: boolean
  min_order: number
  prep_time_minutes: number
  opens_at: string | null
  closes_at: string | null
  /** با احتساب ساعت کاری (وقت تهران) و کلید دستی */
  open_now: boolean
  items_count?: number
  active_orders?: number
}

export interface VenueInput {
  kind?: VenueKind
  name?: string
  description?: string | null
  opens_at?: string | null
  closes_at?: string | null
  prep_time_minutes?: number
  accepts_delivery?: boolean
  min_order?: number
  is_open?: boolean
  is_active?: boolean
}

export interface MenuCategory {
  id: string
  venue_id: string
  name: string
  sort_order: number
}

export interface MenuItem {
  id: string
  venue_id: string
  category_id: string | null
  category_name: string | null
  name: string
  description: string | null
  image_url: string | null
  price: number
  availability: Availability
  stock_count: number | null
  reserved_count: number
  prep_time_minutes: number | null
  is_daily_special: boolean
}

export interface ItemInput {
  venue_id?: string
  category_id?: string | null
  name?: string
  description?: string | null
  image_url?: string | null
  price?: number
  availability?: Availability
  stock_count?: number | null
  prep_time_minutes?: number | null
  is_daily_special?: boolean
}

export interface MenuResponse {
  venue: Venue
  categories: MenuCategory[]
  items: MenuItem[]
  server_time: string
}

export interface DeliveryZone {
  id: string
  name: string
  zone_type: 'in_unit' | 'amenity_zone'
  amenity_id: string | null
  is_active: boolean
  surcharge: number
  sort_order: number
}

export interface OrderLine {
  item_id: string | null
  name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface Order {
  id: string
  order_number: string
  venue_id: string
  venue_name: string
  venue_kind: VenueKind
  prep_time_minutes: number
  unit_id: string
  unit_number: string | null
  delivery_type: DeliveryType
  delivery_zone_id: string | null
  zone_name: string | null
  delivery_note: string | null
  status: OrderStatus
  subtotal: number
  surcharge: number
  total: number
  placed_at: string
  ready_at: string | null
  delivered_at: string | null
  cancellation_reason: string | null
  items: OrderLine[]
}

export interface KitchenQueue {
  orders: Order[]
  delivered_today: number
  server_time: string
}

const qs = (o: Record<string, string | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '')
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&') : ''
}

export const fnbApi = {
  // مجموعه‌ها
  venues: () => api.get<Venue[]>('/fnb/venues'),
  manageVenues: (kind?: VenueKind) => api.get<Venue[]>(`/fnb/venues/manage${qs({ kind })}`),
  createVenue: (b: VenueInput) => api.post<Venue>('/fnb/venues', b),
  updateVenue: (id: string, b: VenueInput) => api.patch<Venue>(`/fnb/venues/${id}`, b),
  deleteVenue: (id: string) => api.delete<{ deleted: boolean; deactivated: boolean }>(`/fnb/venues/${id}`),

  // منو
  menu: (venueId: string, all = false) => api.get<MenuResponse>(`/fnb/venues/${venueId}/menu${all ? '?all=1' : ''}`),
  createCategory: (venueId: string, name: string) => api.post<MenuCategory>(`/fnb/venues/${venueId}/categories`, { name }),
  updateCategory: (id: string, b: { name?: string; sort_order?: number }) => api.patch<MenuCategory>(`/fnb/categories/${id}`, b),
  deleteCategory: (id: string) => api.delete<{ deleted: boolean }>(`/fnb/categories/${id}`),
  createItem: (b: ItemInput) => api.post<MenuItem>('/fnb/menu-items', b),
  updateItem: (id: string, b: ItemInput) => api.patch<MenuItem>(`/fnb/menu-items/${id}`, b),
  setAvailability: (id: string, availability: Availability) => api.patch<MenuItem>(`/fnb/menu-items/${id}/availability`, { availability }),
  deleteItem: (id: string) => api.delete<{ deleted: boolean; hidden: boolean }>(`/fnb/menu-items/${id}`),

  // مناطق تحویل
  zones: (all = false) => api.get<DeliveryZone[]>(`/fnb/delivery-zones${all ? '?all=1' : ''}`),
  createZone: (b: { name: string; surcharge: number }) => api.post<DeliveryZone>('/fnb/delivery-zones', b),
  updateZone: (id: string, b: { name?: string; surcharge?: number; is_active?: boolean }) => api.patch<DeliveryZone>(`/fnb/delivery-zones/${id}`, b),
  deleteZone: (id: string) => api.delete<{ deleted: boolean; deactivated: boolean }>(`/fnb/delivery-zones/${id}`),

  // سفارش — ساکن
  placeOrder: (b: { venue_id: string; delivery_type: DeliveryType; delivery_zone_id?: string; delivery_note?: string; items: { item_id: string; quantity: number }[] }) =>
    api.post<Order>('/fnb/orders', b),
  myOrders: () => api.get<Order[]>('/fnb/me/orders'),
  order: (id: string) => api.get<Order>(`/fnb/orders/${id}`),
  cancelOrder: (id: string) => api.post<Order>(`/fnb/orders/${id}/cancel`, {}),

  // سفارش — آشپزخانه / کافی‌شاپ
  queue: (kind?: VenueKind, venueId?: string) => api.get<KitchenQueue>(`/fnb/kitchen/queue${qs({ kind, venue_id: venueId })}`),
  setStatus: (id: string, status: OrderStatus, reason?: string) => api.patch<Order>(`/fnb/orders/${id}/status`, { status, reason }),
}
