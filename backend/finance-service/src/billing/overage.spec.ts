import { calcCharge, withOverage } from './charge-calc'
import { groupOverage, type PendingOverageRow } from './overage'

const row = (over: Partial<PendingOverageRow> = {}): PendingOverageRow => ({
  unit_id: 'u1', event_id: 'e1', service: 'مهمان استخر و مجموعه‌ی آبی', variant: 'مهمان مازاد (هر نفر)', period: '1405-07',
  overage_qty: 1, unit_label: 'نفر', amount: 400000, ...over,
})

describe('groupOverage — مازاد هر واحد برای ریز شارژ', () => {
  it('ردیف‌های هم‌خدمت/هم‌نوع/هم‌دوره یک آیتم می‌شوند و مجموع و شناسه‌ها حفظ می‌شود', () => {
    const m = groupOverage([row({ event_id: 'a' }), row({ event_id: 'b', overage_qty: 2, amount: 800000 }), row({ event_id: 'c', service: 'بولینگ', variant: 'هر سانس ۳۰ دقیقه', overage_qty: 77, unit_label: 'دقیقه', amount: 300000 })])
    const u = m.get('u1')!
    expect(u.total).toBe(1_500_000)
    expect(u.event_ids).toEqual(['a', 'b', 'c'])
    expect(u.items).toHaveLength(2)
    expect(u.items[0]).toMatchObject({ quantity: 3, amount: 1_200_000, unit_label: 'نفر' })
    expect(u.items[1]).toMatchObject({ service: 'بولینگ', quantity: 77, amount: 300000 })
  })
  it('دوره‌های مختلف جدا می‌مانند و واحدها از هم جدا هستند', () => {
    const m = groupOverage([row(), row({ period: '1405-06', event_id: 'x' }), row({ unit_id: 'u2', event_id: 'y' })])
    expect(m.get('u1')!.items.map((i) => i.period)).toEqual(['1405-07', '1405-06'])
    expect(m.get('u2')!.total).toBe(400000)
  })
  it('ردیف بدون مبلغ نادیده گرفته می‌شود', () => {
    expect(groupOverage([row({ amount: 0 })]).size).toBe(0)
  })
  it('ورودی خالی ⇒ نقشه‌ی خالی', () => {
    expect(groupOverage([]).size).toBe(0)
  })
})

describe('groupOverage — سفارش‌های کافه/رستوران (شارژ متغیر)', () => {
  const fnb = (over: Partial<PendingOverageRow> = {}): PendingOverageRow => row({ kind: 'fnb', service: 'کافی‌شاپ', variant: null, unit_label: 'سفارش', overage_qty: 1, amount: 180000, ...over })
  it('سفارش‌ها به‌صورت آیتم kind=fnb جمع می‌شوند و شناسه‌شان در order_ids می‌رود (نه event_ids)', () => {
    const u = groupOverage([fnb({ event_id: 'o1' }), fnb({ event_id: 'o2', amount: 70000 }), row({ event_id: 'e1' })]).get('u1')!
    expect(u.order_ids).toEqual(['o1', 'o2'])
    expect(u.event_ids).toEqual(['e1'])
    expect(u.total).toBe(180000 + 70000 + 400000)
    const item = u.items.find((i) => i.kind === 'fnb')!
    expect(item).toMatchObject({ service: 'کافی‌شاپ', quantity: 2, amount: 250000, unit_label: 'سفارش' })
  })
  it('کافه و رستوران آیتم‌های جدا هستند و با خدمتِ هم‌نام قاطی نمی‌شوند', () => {
    const u = groupOverage([fnb({ event_id: 'a' }), fnb({ event_id: 'b', service: 'رستوران', amount: 520000 }), row({ event_id: 'c', service: 'کافی‌شاپ', variant: null })]).get('u1')!
    expect(u.items).toHaveLength(3)
  })
  it('خدمات قدیمی kind ندارند (سازگاری با شارژهای صادرشده)', () => {
    expect(groupOverage([row()]).get('u1')!.items[0].kind).toBeUndefined()
  })
})

describe('withOverage — اضافه شدن مازاد به شارژ ماهانه', () => {
  const b = calcCharge({ base_amount: 1_500_000, amount_per_sqm: 25_000, per_resident_amount: 0, fixed_items: [], round_to: 1000 }, { area: 92.5, residents: 0 })
  it('بدون مازاد، breakdown همان است', () => {
    expect(withOverage(b, undefined)).toBe(b)
    expect(withOverage(b, { total: 0, items: [] })).toBe(b)
  })
  it('مازاد بدون گرد کردن به total اضافه می‌شود و کلید overage ثبت می‌شود', () => {
    const o = { total: 455_000, items: [] }
    const r = withOverage(b, o)
    expect(b.total).toBe(3_813_000)
    expect(r.total).toBe(3_813_000 + 455_000)
    expect(r.overage).toBe(o)
    expect(r.base).toBe(b.base) // اجزای فرمول دست‌نخورده
  })
})
