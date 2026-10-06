import { allocate, endOfTehranDay, overageAmount, quotaKey, resolveTier, tehranPeriod, type AllocEvent, type TierRow } from './engine'

const T = (id: string, min: number): TierRow => ({ id, name: `واحد ${min}`, min_area: min, sort: min })
const TIERS = [240, 245, 260, 280, 305, 315, 340, 490, 700].map((m) => T(`t${m}`, m))

describe('resolveTier — سطح آفر از روی متراژ', () => {
  it('متراژ دقیقاً برابر سطح ⇒ exact', () => {
    expect(resolveTier(TIERS, 245)).toMatchObject({ tier: { id: 't245' }, match: 'exact' })
  })
  it('متراژ بین دو سطح ⇒ سطح پایین‌تر (واحد ۲۵۰ ⇒ ۲۴۵)', () => {
    expect(resolveTier(TIERS, 250)).toMatchObject({ tier: { id: 't245' }, match: 'floor' })
    expect(resolveTier(TIERS, 299.9)).toMatchObject({ tier: { id: 't280' }, match: 'floor' })
  })
  it('بزرگ‌تر از بالاترین سطح ⇒ بالاترین سطح', () => {
    expect(resolveTier(TIERS, 1200)).toMatchObject({ tier: { id: 't700' }, match: 'floor' })
  })
  it('کمتر از کوچک‌ترین سطح ⇒ کوچک‌ترین سطح با هشدار below_min', () => {
    expect(resolveTier(TIERS, 180)).toMatchObject({ tier: { id: 't240' }, match: 'below_min' })
  })
  it('متراژ نامعتبر/ثبت‌نشده یا بدون سطح ⇒ سطحی تعیین نمی‌شود', () => {
    expect(resolveTier(TIERS, null)).toEqual({ tier: null, match: 'no_area' })
    expect(resolveTier(TIERS, 0)).toEqual({ tier: null, match: 'no_area' })
    expect(resolveTier([], 300)).toEqual({ tier: null, match: 'no_tiers' })
  })
  it('ترتیب ورودی مهم نیست', () => {
    expect(resolveTier([...TIERS].reverse(), 316).tier?.id).toBe('t315')
  })
})

let seq = 0
const ev = (qty: number, over: Partial<AllocEvent> = {}): AllocEvent => ({
  id: `e${String(++seq).padStart(3, '0')}`,
  occurred_at: new Date(Date.UTC(2026, 0, 1, 0, seq)).toISOString(),
  quantity: qty,
  counts_toward_quota: true,
  unit_price: 400000,
  step: 1,
  ...over,
})

describe('allocate — سهم‌بندی سهمیه و مازاد', () => {
  beforeEach(() => { seq = 0 })

  it('تا سقف سهمیه رایگان است و بعد از آن به‌ازای هر واحد پول می‌گیرد (مهمان استخر: ۴ رایگان، نفر پنجم ۴۰۰٬۰۰۰ تومان)', () => {
    const r = allocate(4, [ev(1), ev(1), ev(1), ev(1), ev(1), ev(1)])
    expect(r.map((x) => x.amount)).toEqual([0, 0, 0, 0, 400000, 400000])
    expect(r.map((x) => x.quota_qty)).toEqual([1, 1, 1, 1, 0, 0])
  })

  it('رویداد چندنفره‌ای که از مرز سهمیه می‌گذرد فقط برای بخش اضافه پول می‌گیرد', () => {
    const r = allocate(4, [ev(3), ev(3)])
    expect(r[0]).toMatchObject({ quota_qty: 3, overage_qty: 0, amount: 0 })
    expect(r[1]).toMatchObject({ quota_qty: 1, overage_qty: 2, amount: 800000 })
  })

  it('بولینگ: سهمیه دقیقه‌ای و مازاد به‌ازای هر ۳۰ دقیقه‌ی شروع‌شده', () => {
    const bowl = { unit_price: 100000, step: 30 }
    const r = allocate(123, [ev(60, bowl), ev(90, bowl)])
    expect(r[0].amount).toBe(0)
    // باقی‌مانده ۶۳ دقیقه رایگان ⇒ ۲۷ دقیقه مازاد ⇒ یک سانس شروع‌شده
    expect(r[1]).toMatchObject({ quota_qty: 63, overage_qty: 27, amount: 100000 })
    const r2 = allocate(0, [ev(61, bowl)])
    expect(r2[0].amount).toBe(300000) // ⌈۶۱÷۳۰⌉ = ۳ سانس
  })

  it('نوع‌هایی که از سهمیه کم نمی‌شوند (موتور/دوچرخه) همیشه پولی‌اند و سهمیه را نمی‌سوزانند', () => {
    const moto = { counts_toward_quota: false, unit_price: 100000 }
    const sedan = { unit_price: 200000 }
    const r = allocate(2, [ev(1, moto), ev(1, sedan), ev(1, sedan), ev(1, sedan)])
    expect(r.map((x) => x.amount)).toEqual([100000, 0, 0, 200000])
    expect(r[0].quota_qty).toBe(0)
  })

  it('خانه‌داری: ساعت‌های رایگان بین شیفت‌ها مشترک است و مازاد با نرخ همان شیفت حساب می‌شود', () => {
    const day = { unit_price: 150000 }
    const night = { unit_price: 200000 }
    const r = allocate(17, [ev(10, day), ev(6, night), ev(3, night)])
    expect(r[0].amount).toBe(0)
    expect(r[1].amount).toBe(0) // مجموع ۱۶ ≤ ۱۷
    expect(r[2]).toMatchObject({ quota_qty: 1, overage_qty: 2, amount: 400000 })
  })

  it('ساعت اعشاری بدون خطای ممیز شناور', () => {
    const r = allocate(1, [ev(0.1), ev(0.2), ev(0.7), ev(0.5, { unit_price: 100000 })])
    expect(r.slice(0, 3).every((x) => x.amount === 0)).toBe(true)
    expect(r[3]).toMatchObject({ quota_qty: 0, overage_qty: 0.5, amount: 100000 })
  })

  it('سهمیه‌ی صفر (خدمت پولی) ⇒ همه پولی؛ نرخ صفر (خدمت رایگان) ⇒ هیچ مبلغی', () => {
    expect(allocate(0, [ev(2, { unit_price: 500000 })])[0].amount).toBe(1000000)
    expect(allocate(0, [ev(5, { unit_price: 0 })])[0]).toMatchObject({ overage_qty: 5, amount: 0 })
  })

  it('ترتیب ورودی نامربوط است؛ سهمیه به‌ترتیب زمان وقوع مصرف می‌شود', () => {
    const a = ev(1)
    const b = ev(1)
    const r = allocate(1, [b, a])
    expect(r.map((x) => x.id)).toEqual([a.id, b.id])
    expect(r.map((x) => x.amount)).toEqual([0, 400000])
  })

  it('deterministic: اجرای دوباره همان نتیجه را می‌دهد', () => {
    const list = [ev(2), ev(3), ev(1)]
    expect(allocate(4, list)).toEqual(allocate(4, list))
  })
})

describe('overageAmount / quotaKey / تاریخ', () => {
  it('overageAmount', () => {
    expect(overageAmount(0, 100, 1)).toBe(0)
    expect(overageAmount(30, 100000, 30)).toBe(100000)
    expect(overageAmount(31, 100000, 30)).toBe(200000)
    expect(overageAmount(3, 0, 1)).toBe(0)
  })
  it('quotaKey: ماهانه دوره‌ی کامل، سالانه فقط سال', () => {
    expect(quotaKey('month', '1405-07')).toBe('1405-07')
    expect(quotaKey('year', '1405-07')).toBe('1405')
  })
  it('tehranPeriod: ۱۵ مهر ۱۴۰۵ ⇒ 1405-07 و مرز نیمه‌شب تهران', () => {
    expect(tehranPeriod(new Date('2026-10-07T10:00:00Z'))).toBe('1405-07')
    // ۳۱ شهریور ۱۴۰۵ ساعت ۲۳:۳۰ تهران ⇒ هنوز شهریور؛ یک بامداد ۱ مهر ⇒ دوره‌ی مهر
    expect(tehranPeriod(new Date('2026-09-21T20:00:00Z'))).toBe('1405-06')
    expect(tehranPeriod(new Date('2026-09-22T20:30:00Z'))).toBe('1405-07')
  })
  it('endOfTehranDay', () => {
    expect(endOfTehranDay('2026-10-07').toISOString()).toBe('2026-10-07T20:29:59.000Z')
  })
})
