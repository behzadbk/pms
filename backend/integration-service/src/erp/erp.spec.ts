import { chargeLines } from './entities'
import { generateKey, hashKey, parseKey, sign, verifySignature } from './keys'
import { checkConnectorUrl } from './url-guard'

describe('کلید API', () => {
  const tenant = '11111111-2222-3333-4444-555555555555'
  it('tenant از خود کلید خوانده می‌شود و فقط هش ذخیره می‌شود', () => {
    const k = generateKey(tenant, 'live')
    expect(k.key.startsWith('hmn_live_1111111122223333')).toBe(true)
    expect(parseKey(k.key)).toEqual({ env: 'live', tenantId: tenant })
    expect(k.hash).toBe(hashKey(k.key))
    expect(k.hash).not.toContain(k.key.slice(-10))
  })
  it('قالب غلط رد می‌شود', () => {
    expect(parseKey('hmn_live_xyz_abc')).toBeNull()
    expect(parseKey('Bearer something')).toBeNull()
  })
})

describe('امضای HMAC', () => {
  it('امضای درست پذیرفته و دست‌کاری‌شده رد می‌شود', () => {
    const t = Math.floor(Date.now() / 1000)
    const body = '{"a":1}'
    const h = `t=${t},v1=${sign('s3cret', t, body)}`
    expect(verifySignature('s3cret', h, body)).toBe(true)
    expect(verifySignature('s3cret', h, '{"a":2}')).toBe(false)
    expect(verifySignature('other', h, body)).toBe(false)
    const old = t - 3600
    expect(verifySignature('s3cret', `t=${old},v1=${sign('s3cret', old, body)}`, body)).toBe(false)
  })
})

describe('ردیف‌های فاکتور شارژ', () => {
  it('جمع ردیف‌ها همیشه برابر مبلغ کل است (با گرد کردن)', () => {
    const lines = chargeLines({
      breakdown: { base: 1000, area: 2501, residents: 0, fixed_items: [{ title: 'آسانسور', amount: 300 }], total: 4000 },
      base_amount: 4000,
      late_fee_amount: 200,
      total_amount: 4200,
    })
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBe(4200)
    expect(lines.find((l) => l.code === 'rounding')?.amount).toBe(199)
    expect(lines.find((l) => l.type === 'late_fee')?.amount).toBe(200)
  })
  it('شارژ واردشده از فایل (بدون breakdown) یک ردیف می‌شود', () => {
    expect(chargeLines({ breakdown: {}, base_amount: 5000, late_fee_amount: 0, total_amount: 5000 })).toEqual([
      { type: 'fixed', code: 'charge', title: 'شارژ ماهانه', amount: 5000 },
    ])
  })
  it('شارژ متغیر کافه و مازاد خدمات جدا می‌شوند', () => {
    const lines = chargeLines({
      breakdown: { base: 1000, total: 1700, overage: { items: [{ kind: 'fnb', service: 'کافه', amount: 300, quantity: 1 }, { service: 'نظافت', variant: 'ساعتی', amount: 400, quantity: 1 }] } },
      base_amount: 1700,
      late_fee_amount: 0,
      total_amount: 1700,
    })
    expect(lines.filter((l) => l.type === 'variable').map((l) => l.code)).toEqual(['fnb', 'service_overage'])
  })
})

describe('محافظ آدرس مقصد (SSRF)', () => {
  const prev = { env: process.env.NODE_ENV, allow: process.env.ERP_ALLOW_INSECURE_URLS }
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    delete process.env.ERP_ALLOW_INSECURE_URLS
  })
  afterAll(() => {
    process.env.NODE_ENV = prev.env
    if (prev.allow === undefined) delete process.env.ERP_ALLOW_INSECURE_URLS
    else process.env.ERP_ALLOW_INSECURE_URLS = prev.allow
  })
  it.each([
    'http://erp.example.com/hook',
    'https://localhost/hook',
    'https://postgres:5432/',
    'https://10.1.2.3/',
    'https://192.168.1.10/',
    'https://172.20.0.4/',
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/',
    'https://user:pass@erp.example.com/',
  ])('رد: %s', (u) => expect(checkConnectorUrl(u)).not.toBeNull())
  it('پذیرش آدرس عمومی https', () => expect(checkConnectorUrl('https://erp.example.com/livo')).toBeNull())
  it('در توسعه/شبکه‌ی داخلی با اجازه‌ی صریح', () => {
    process.env.ERP_ALLOW_INSECURE_URLS = 'true'
    expect(checkConnectorUrl('http://192.168.1.10:8080/hook')).toBeNull()
  })
})
