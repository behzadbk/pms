import { PoolClient } from 'pg'

/**
 * تعریف یکجای موجودیت‌هایی که Livo به ERP می‌دهد.
 * همین تعریف‌ها هم برای API خواندنی (pull)، هم برای فید تغییرات و هم برای ارسال خودکار (push) استفاده
 * می‌شوند تا شکل داده در هر سه مسیر دقیقاً یکی باشد. همه‌ی پرس‌وجوها داخل withTenant اجرا می‌شوند (RLS).
 *
 * مبالغ: تومان (عدد صحیح) — همان واحد پول اپلیکیشن.
 * دوره (period): ماه شمسی YYYY-MM. تاریخ‌ها: ISO-8601.
 */

export type EntityName =
  | 'building'
  | 'unit'
  | 'party'
  | 'staff'
  | 'charge'
  | 'payment'
  | 'expense'
  | 'fnb_order'
  | 'service_usage'

export interface ListQuery {
  page: number
  pageSize: number
  updatedSince?: string
  filters: Record<string, string | undefined>
}

interface EntityDef {
  /** مسیر API */
  path: string
  title: string
  /** نام مستعار جدول اصلی در select */
  alias: string
  /** SELECT پایه که ستون id دارد؛ شرط‌ها به آن اضافه می‌شود */
  select: string
  /** عبارت ستون زمان آخرین تغییر (برای updatedSince)؛ null = پشتیبانی نمی‌شود */
  updatedCol: string | null
  orderBy: string
  /** فیلترهای مجاز: نام پارامتر → عبارت SQL (با $n جایگزین می‌شود) */
  filters: Record<string, string>
  /** شرط ثابت (مثلاً حذف کودکان از اشخاص) */
  where?: string
  map: (r: any) => any
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null) ?? null)

export interface ChargeLine {
  type: 'fixed' | 'variable' | 'late_fee' | 'adjustment'
  code: string
  title: string
  amount: number
  quantity?: number
}

/** تبدیل breakdown موتور شارژ به ردیف‌های فاکتور فروش برای ERP؛ جمع ردیف‌ها همیشه = total_amount */
export function chargeLines(r: { breakdown: any; base_amount: unknown; late_fee_amount: unknown; total_amount: unknown }): ChargeLine[] {
  const b = r.breakdown && typeof r.breakdown === 'object' ? r.breakdown : {}
  const lines: ChargeLine[] = []
  if (b.total !== undefined) {
    if (num(b.base)) lines.push({ type: 'fixed', code: 'base', title: 'شارژ پایه', amount: num(b.base) })
    if (num(b.area)) lines.push({ type: 'fixed', code: 'area', title: 'شارژ بر اساس متراژ', amount: num(b.area), quantity: num(b.inputs?.area) })
    if (num(b.residents))
      lines.push({ type: 'fixed', code: 'residents', title: 'شارژ بر اساس نفرات', amount: num(b.residents), quantity: num(b.inputs?.residents) })
    for (const i of Array.isArray(b.fixed_items) ? b.fixed_items : []) {
      if (num(i.amount)) lines.push({ type: 'fixed', code: 'fixed_item', title: String(i.title ?? 'آیتم ثابت'), amount: num(i.amount) })
    }
    for (const o of Array.isArray(b.overage?.items) ? b.overage.items : []) {
      if (!num(o.amount)) continue
      lines.push({
        type: 'variable',
        code: o.kind === 'fnb' ? 'fnb' : 'service_overage',
        title: [o.service, o.variant].filter(Boolean).join(' — ') || 'شارژ متغیر',
        amount: num(o.amount),
        quantity: num(o.quantity),
      })
    }
  }
  const late = num(r.late_fee_amount)
  if (late) lines.push({ type: 'late_fee', code: 'late_fee', title: 'جریمه‌ی دیرکرد', amount: late })
  const sum = lines.reduce((a, l) => a + l.amount, 0)
  const diff = num(r.total_amount) - sum
  if (lines.length === 0) {
    lines.push({ type: 'fixed', code: 'charge', title: 'شارژ ماهانه', amount: num(r.total_amount) })
  } else if (diff !== 0) {
    // اختلاف گرد کردن (round_to) یا شارژ واردشده از فایل
    lines.push({ type: 'adjustment', code: 'rounding', title: 'گرد کردن / تعدیل', amount: diff })
  }
  return lines
}

export const ENTITIES: Record<EntityName, EntityDef> = {
  building: {
    alias: 'b',
    path: 'buildings',
    title: 'ساختمان/بلوک',
    select: `SELECT b.id, b.name, b.address, b.total_units, b.created_at FROM property.buildings b`,
    updatedCol: null,
    orderBy: 'b.created_at, b.id',
    filters: {},
    map: (r) => ({ id: r.id, name: r.name, address: r.address, totalUnits: r.total_units, createdAt: iso(r.created_at) }),
  },

  unit: {
    alias: 'u',
    path: 'units',
    title: 'واحد',
    select: `SELECT u.id, u.unit_number, u.floor, u.area_sqm, u.occupancy, u.ownership_status, u.parking_count, u.storage_no,
                    u.created_at, b.id AS building_id, b.name AS building_name,
                    (SELECT m.id FROM residency.memberships m
                      WHERE m.unit_id = u.id AND m.status = 'active' AND m.pays_charge
                      ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1) AS payer_party_id,
                    (SELECT count(*) FROM residency.memberships m WHERE m.unit_id = u.id AND m.status = 'active') AS residents
               FROM property.units u LEFT JOIN property.buildings b ON b.id = u.building_id`,
    updatedCol: null,
    orderBy: 'b.name NULLS FIRST, u.floor NULLS FIRST, u.unit_number, u.id',
    filters: { buildingId: 'u.building_id = $', occupancy: 'u.occupancy = $', unitNumber: 'u.unit_number = $' },
    map: (r) => ({
      id: r.id,
      unitNumber: r.unit_number,
      floor: r.floor,
      areaSqm: r.area_sqm === null ? null : num(r.area_sqm),
      occupancy: r.occupancy,
      ownershipStatus: r.ownership_status,
      parkingCount: r.parking_count,
      storageNo: r.storage_no,
      building: r.building_id ? { id: r.building_id, name: r.building_name } : null,
      payerPartyId: r.payer_party_id,
      residents: num(r.residents),
      createdAt: iso(r.created_at),
    }),
  },

  party: {
    alias: 'm',
    path: 'parties',
    title: 'شخص (مالک/مستأجر)',
    select: `SELECT m.id, m.user_id AS person_id, p.name, p.phone, p.national_id, m.unit_id, u.unit_number, m.role, m.residency,
                    m.pays_charge, m.status, m.start_date, m.end_date, m.created_at, m.updated_at
               FROM residency.memberships m
               JOIN residency.users p ON p.id = m.user_id
               LEFT JOIN property.units u ON u.id = m.unit_id`,
    // کودکان و مراقب موقت طرف حساب مالی نیستند و اطلاعاتشان به ERP نمی‌رود
    where: `m.role NOT IN ('child','caregiver')`,
    updatedCol: 'm.updated_at',
    orderBy: 'u.unit_number NULLS LAST, m.created_at, m.id',
    filters: {
      unitId: 'm.unit_id = $',
      residency: 'm.residency = $',
      status: 'm.status = $',
      paysCharge: 'm.pays_charge = ($)::boolean',
      nationalId: 'p.national_id = $',
    },
    map: (r) => ({
      id: r.id,
      personId: r.person_id,
      name: r.name,
      phone: r.phone,
      nationalId: r.national_id,
      unit: r.unit_id ? { id: r.unit_id, unitNumber: r.unit_number } : null,
      residency: r.residency,
      role: r.role,
      paysCharge: r.pays_charge,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    }),
  },

  staff: {
    alias: 's',
    path: 'staff',
    title: 'کارکنان',
    select: `SELECT s.id, s.full_name, s.username, s.email, s.phone, s.national_id, s.role, s.department, s.is_active,
                    s.created_at, s.updated_at
               FROM identity.users s`,
    where: `s.role IN ('admin','staff','guard','accountant')`,
    updatedCol: 's.updated_at',
    orderBy: 's.is_active DESC, s.full_name, s.id',
    filters: { role: 's.role = $', department: 's.department = $', isActive: 's.is_active = ($)::boolean' },
    map: (r) => ({
      id: r.id,
      fullName: r.full_name,
      username: r.username,
      email: r.email,
      phone: r.phone,
      nationalId: r.national_id,
      role: r.role,
      department: r.department,
      isActive: r.is_active,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    }),
  },

  charge: {
    alias: 'c',
    path: 'charges',
    title: 'شارژ صادرشده (فاکتور فروش واحد)',
    select: `SELECT c.id, c.unit_id, u.unit_number, c.period, c.base_amount, c.late_fee_amount, c.total_amount, c.due_date,
                    c.status, c.paid_at, c.pay_method, c.late_fee_waived, c.note, c.source, c.breakdown, c.created_at, c.updated_at,
                    (SELECT m.id FROM residency.memberships m
                      WHERE m.unit_id = c.unit_id AND m.status = 'active' AND m.pays_charge
                      ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1) AS payer_party_id,
                    COALESCE((SELECT sum(p.amount) FROM finance.payments p WHERE p.monthly_charge_id = c.id AND p.status = 'success'), 0) AS paid_amount
               FROM finance.monthly_charges c
               LEFT JOIN property.units u ON u.id = c.unit_id`,
    updatedCol: 'c.updated_at',
    orderBy: 'c.period, u.unit_number, c.id',
    filters: { period: 'c.period = $', unitId: 'c.unit_id = $', status: 'c.status = $' },
    map: (r) => ({
      id: r.id,
      number: `CHG-${r.period}-${r.unit_number ?? r.unit_id?.slice(0, 8)}`,
      unit: { id: r.unit_id, unitNumber: r.unit_number },
      payerPartyId: r.payer_party_id,
      period: r.period,
      issueDate: iso(r.created_at),
      dueDate: r.due_date,
      status: r.status,
      baseAmount: num(r.base_amount),
      lateFeeAmount: num(r.late_fee_amount),
      totalAmount: num(r.total_amount),
      paidAmount: num(r.paid_amount),
      balance: num(r.total_amount) - num(r.paid_amount),
      lines: chargeLines(r),
      paidAt: iso(r.paid_at),
      payMethod: r.pay_method,
      lateFeeWaived: r.late_fee_waived,
      source: r.source,
      note: r.note,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    }),
  },

  payment: {
    alias: 'p',
    path: 'payments',
    title: 'پرداخت (دریافت از واحد)',
    select: `SELECT p.id, p.monthly_charge_id, c.period, c.unit_id, u.unit_number, p.amount, p.method, p.gateway, p.gateway_ref_id,
                    p.reference, p.status, p.paid_at, p.created_at, p.note
               FROM finance.payments p
               LEFT JOIN finance.monthly_charges c ON c.id = p.monthly_charge_id
               LEFT JOIN property.units u ON u.id = c.unit_id`,
    updatedCol: null,
    orderBy: 'p.created_at, p.id',
    filters: { status: 'p.status = $', chargeId: 'p.monthly_charge_id = $', unitId: 'c.unit_id = $', period: 'c.period = $' },
    map: (r) => ({
      id: r.id,
      chargeId: r.monthly_charge_id,
      period: r.period,
      unit: r.unit_id ? { id: r.unit_id, unitNumber: r.unit_number } : null,
      amount: num(r.amount),
      method: r.method ?? (r.gateway ? 'online' : null),
      gateway: r.gateway,
      gatewayRef: r.gateway_ref_id,
      reference: r.reference,
      status: r.status,
      paidAt: iso(r.paid_at),
      note: r.note,
      createdAt: iso(r.created_at),
    }),
  },

  expense: {
    alias: 'e',
    path: 'expenses',
    title: 'فاکتور هزینه‌ی ساختمان',
    select: `SELECT e.id, e.number, e.vendor, e.category, e.description, e.items, e.amount, e.invoice_date, e.status, e.paid_on,
                    e.pay_method, (e.attachment_data IS NOT NULL) AS has_attachment, e.attachment_name, e.registered_by_name,
                    e.created_at, e.updated_at
               FROM finance.expense_invoices e`,
    updatedCol: 'e.updated_at',
    orderBy: 'e.invoice_date, e.number, e.id',
    filters: { status: 'e.status = $', category: 'e.category = $', vendor: 'e.vendor = $' },
    map: (r) => ({
      id: r.id,
      number: r.number,
      vendor: r.vendor,
      category: r.category,
      description: r.description,
      items: (Array.isArray(r.items) ? r.items : []).map((i: any) => ({
        title: i.title,
        quantity: num(i.qty ?? i.quantity ?? 1),
        unitPrice: num(i.unit_price ?? i.unitPrice),
        amount: num(i.qty ?? i.quantity ?? 1) * num(i.unit_price ?? i.unitPrice),
      })),
      amount: num(r.amount),
      invoiceDate: r.invoice_date,
      status: r.status,
      paidOn: r.paid_on,
      payMethod: r.pay_method,
      attachment: r.has_attachment ? { name: r.attachment_name, url: `v1/expenses/${r.id}/attachment` } : null,
      registeredBy: r.registered_by_name,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    }),
  },

  fnb_order: {
    alias: 'o',
    path: 'fnb-orders',
    title: 'سفارش کافه/رستوران (شارژ متغیر)',
    select: `SELECT o.id, o.order_number, o.venue_id, v.name AS venue_name, o.unit_id, u.unit_number, o.status, o.subtotal, o.surcharge,
                    o.total, o.placed_at, o.delivered_at, o.billed_charge_id, o.billed_at, o.bill_exempt, o.cancellation_reason,
                    COALESCE((SELECT json_agg(json_build_object('name', i.item_name_snapshot, 'quantity', i.quantity,
                                                              'unitPrice', i.unit_price, 'amount', i.line_total) ORDER BY i.id)
                                FROM fnb.order_items i WHERE i.order_id = o.id), '[]'::json) AS items
               FROM fnb.orders o
               LEFT JOIN fnb.venues v ON v.id = o.venue_id
               LEFT JOIN property.units u ON u.id = o.unit_id`,
    updatedCol: null,
    orderBy: 'o.placed_at, o.id',
    filters: { status: 'o.status = $', unitId: 'o.unit_id = $', venueId: 'o.venue_id = $' },
    map: (r) => ({
      id: r.id,
      orderNumber: r.order_number,
      venue: r.venue_id ? { id: r.venue_id, name: r.venue_name } : null,
      unit: r.unit_id ? { id: r.unit_id, unitNumber: r.unit_number } : null,
      status: r.status,
      items: (r.items as any[]).map((i) => ({ ...i, unitPrice: num(i.unitPrice), amount: num(i.amount), quantity: num(i.quantity) })),
      subtotal: num(r.subtotal),
      deliveryFee: num(r.surcharge),
      total: num(r.total),
      placedAt: iso(r.placed_at),
      deliveredAt: iso(r.delivered_at),
      billing: {
        /** true = روی شارژ متغیر واحد آمده یا خواهد آمد */
        chargeable: r.status === 'delivered' && !r.bill_exempt && !!r.unit_id,
        billedChargeId: r.billed_charge_id,
        billedAt: iso(r.billed_at),
      },
      cancellationReason: r.cancellation_reason,
    }),
  },

  service_usage: {
    alias: 'e',
    path: 'service-usages',
    title: 'مصرف خدمات / مازاد آفر (شارژ متغیر)',
    select: `SELECT e.id, e.unit_id, u.unit_number, s.code AS service_code, s.title AS service_title, s.unit_label,
                    t.code AS tariff_code, t.title AS tariff_title, e.quantity, e.unit_price, e.quota_qty, e.overage_qty, e.amount,
                    e.period, e.occurred_at, e.status, e.void_reason, e.billed_charge_id, e.billed_at, e.note, e.created_at
               FROM entitlement.usage_events e
               LEFT JOIN entitlement.services s ON s.id = e.service_id
               LEFT JOIN entitlement.tariffs t ON t.id = e.tariff_id
               LEFT JOIN property.units u ON u.id = e.unit_id`,
    updatedCol: null,
    orderBy: 'e.occurred_at, e.id',
    filters: { period: 'e.period = $', unitId: 'e.unit_id = $', status: 'e.status = $', serviceCode: 's.code = $' },
    map: (r) => ({
      id: r.id,
      unit: r.unit_id ? { id: r.unit_id, unitNumber: r.unit_number } : null,
      service: { code: r.service_code, title: r.service_title, unitLabel: r.unit_label },
      tariff: r.tariff_code ? { code: r.tariff_code, title: r.tariff_title } : null,
      period: r.period,
      occurredAt: iso(r.occurred_at),
      quantity: num(r.quantity),
      quotaQuantity: num(r.quota_qty),
      overageQuantity: num(r.overage_qty),
      unitPrice: num(r.unit_price),
      amount: num(r.amount),
      status: r.status,
      voidReason: r.void_reason,
      billedChargeId: r.billed_charge_id,
      billedAt: iso(r.billed_at),
      note: r.note,
    }),
  },
}

export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[]

/** جدول مبدأ هر موجودیت (برای backfill) */
export const ENTITY_TABLES: Record<EntityName, string> = {
  building: 'property.buildings',
  unit: 'property.units',
  party: 'residency.memberships',
  staff: 'identity.users',
  charge: 'finance.monthly_charges',
  payment: 'finance.payments',
  expense: 'finance.expense_invoices',
  fnb_order: 'fnb.orders',
  service_usage: 'entitlement.usage_events',
}

export async function listEntity(c: PoolClient, name: EntityName, q: ListQuery) {
  const def = ENTITIES[name]
  const where: string[] = []
  const params: unknown[] = []
  if (def.where) where.push(def.where)
  for (const [k, expr] of Object.entries(def.filters)) {
    const v = q.filters[k]
    if (v === undefined || v === '') continue
    params.push(v)
    where.push(expr.replace('$', `$${params.length}`))
  }
  if (q.updatedSince && def.updatedCol) {
    params.push(q.updatedSince)
    where.push(`${def.updatedCol} >= $${params.length}::timestamptz`)
  }
  const w = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await c.query(`SELECT count(*) AS n FROM (${def.select}${w}) q`, params)).rows[0].n)
  params.push(q.pageSize, (q.page - 1) * q.pageSize)
  const rows = (
    await c.query(`${def.select}${w} ORDER BY ${def.orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`, params)
  ).rows
  return { items: rows.map(def.map), total }
}

/** دریافت چند رکورد با شناسه — برای فید تغییرات و ارسال خودکار */
export async function getByIds(c: PoolClient, name: EntityName, ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>()
  if (!ids.length) return out
  const def = ENTITIES[name]
  const conds = [`${def.alias}.id = ANY($1::uuid[])`]
  if (def.where) conds.push(def.where)
  const rows = (await c.query(`${def.select} WHERE ${conds.join(' AND ')}`, [ids])).rows
  for (const r of rows) out.set(r.id, def.map(r))
  return out
}

export async function getOne(c: PoolClient, name: EntityName, id: string) {
  return (await getByIds(c, name, [id])).get(id) ?? null
}
