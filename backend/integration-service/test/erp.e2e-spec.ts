/**
 * تست e2e اتصال ERP روی PostgreSQL واقعی (همان دیتابیس ساخته‌شده با db/migrate.sh --seed).
 *
 * اجرا (بعد از npm run build):
 *   DATABASE_URL=postgres://app_user:<pw>@localhost:5432/pms npm run test:e2e
 * fixtures.sql قبل از تست با نقش app_user اجرا می‌شود (همان مسیر واقعی نوشتن + trigger + RLS).
 * بدون DATABASE_URL تست رد (skip) می‌شود.
 */
import { ChildProcess, spawn } from 'child_process'
import { readFileSync } from 'fs'
import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import { join } from 'path'
import { Pool } from 'pg'
// eslint-disable-next-line @typescript-eslint/no-require-imports -- supertest is CJS and this tsconfig has no esModuleInterop
import request = require('supertest')
import * as jsonwebtoken from 'jsonwebtoken'
import { verifySignature } from '../src/erp/keys'

/** سرویس واقعیِ build‌شده (dist/main.js) را اجرا می‌کنیم — دقیقاً همان چیزی که در production اجرا می‌شود */
const PORT = 3900 + Math.floor(Math.random() * 90)
const signJwt = (payload: object) => jsonwebtoken.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' })

const DB = process.env.DATABASE_URL
const d = DB ? describe : describe.skip

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER_TENANT = '11111111-1111-1111-1111-111111111112'
const KEY = 'hmn_test_11111111111111111111111111111111_sandboxkey000000000000000001'
const CHARGE = 'e2e00000-0000-4000-8000-000000000001'

d('integration-service (ERP) — e2e روی دیتابیس واقعی', () => {
  let proc: ChildProcess
  let pool: Pool
  let adminToken: string
  let residentToken: string
  let http: ReturnType<typeof request>

  beforeAll(async () => {
    process.env.ERP_DISPATCH_INTERVAL_SEC = '0' // ارسال را دستی (دکمه‌ی «ارسال الان») و قطعی تست می‌کنیم
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-secret-e2e-secret-e2e-secret-123'
    pool = new Pool({ connectionString: DB })
    const c = await pool.connect()
    try {
      await c.query(readFileSync(join(__dirname, 'fixtures.sql'), 'utf8'))
    } finally {
      await c.query(`SELECT set_config('app.current_tenant_id', '', false)`)
      c.release()
    }
    proc = spawn(process.execPath, [join(__dirname, '..', 'dist', 'main.js')], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    http = request(`http://127.0.0.1:${PORT}`)
    for (let i = 0; i < 100; i++) {
      const ok = await http.get('/health/live').then((r) => r.status === 200).catch(() => false)
      if (ok) break
      await new Promise((r) => setTimeout(r, 200))
    }
    adminToken = signJwt({ sub: '22222222-2222-2222-2222-222222222221', tenant_id: TENANT, role: 'admin', email: 'a@x' })
    residentToken = signJwt({ sub: '22222222-2222-2222-2222-222222222225', tenant_id: TENANT, role: 'resident', email: 'r@x' })
  }, 30_000)

  afterAll(async () => {
    proc?.kill()
    await pool?.end()
  })

  const erp = (path: string) => http.get(`/v1/${path}`).set('X-API-Key', KEY)

  describe('احراز هویت با کلید API', () => {
    it('بدون کلید → 401', () => http.get('/v1/ping').expect(401))
    it('کلید با قالب غلط → 401', () => http.get('/v1/ping').set('X-API-Key', 'abc').expect(401))
    it('کلید با tenant درست ولی رمز غلط → 401', () =>
      http.get('/v1/ping').set('X-API-Key', KEY.replace(/1$/, '2')).expect(401))
    it('JWT کاربر روی API ERP پذیرفته نمی‌شود', () => http.get('/v1/ping').set('Authorization', `Bearer ${adminToken}`).expect(401))
    it('ping', async () => {
      const r = await erp('ping').expect(200)
      expect(r.body.data.tenant.subdomain).toBe('borj-aftab')
      expect(r.body.data.currency).toBe('IRT')
    })
  })

  describe('داده‌ها', () => {
    it('شارژ: ردیف‌ها جمعشان = مبلغ کل و شارژ متغیر جداست', async () => {
      const r = await erp(`charges/${CHARGE}`).expect(200)
      const ch = r.body.data
      expect(ch.totalAmount).toBe(3_562_000)
      expect(ch.lines.reduce((a: number, l: any) => a + l.amount, 0)).toBe(ch.totalAmount)
      expect(ch.lines.find((l: any) => l.type === 'variable')?.code).toBe('fnb')
      expect(ch.lines.find((l: any) => l.type === 'late_fee')?.amount).toBe(150_000)
      expect(ch.paidAmount).toBe(1_000_000)
      expect(ch.balance).toBe(2_562_000)
      expect(ch.payerPartyId).toBeTruthy()
    })
    it('فیلتر و صفحه‌بندی', async () => {
      const r = await erp('charges?period=1405-07&pageSize=1').expect(200)
      expect(r.body.data).toHaveLength(1)
      expect(r.body.meta).toMatchObject({ page: 1, pageSize: 1 })
      const none = await erp('charges?period=1300-01').expect(200)
      expect(none.body.meta.total).toBe(0)
    })
    it('پرداخت، فاکتور هزینه، سفارش کافه، مصرف خدمت', async () => {
      expect((await erp('payments?chargeId=' + CHARGE).expect(200)).body.data[0].amount).toBe(1_000_000)
      expect((await erp('expenses/e2e00000-0000-4000-8000-000000000003').expect(200)).body.data.items).toHaveLength(2)
      const o = (await erp('fnb-orders/e2e00000-0000-4000-8000-000000000004').expect(200)).body.data
      expect(o.billing.chargeable).toBe(true)
      expect(o.items[0].name).toBe('کاپوچینو')
      expect((await erp('service-usages/e2e00000-0000-4000-8000-000000000008').expect(200)).body.data.overageQuantity).toBe(1)
    })
    it('اشخاص بدون کودکان، کارکنان بدون ساکنین', async () => {
      const parties = (await erp('parties?pageSize=500').expect(200)).body.data
      expect(parties.some((p: any) => p.role === 'child')).toBe(false)
      const staff = (await erp('staff?pageSize=500').expect(200)).body.data
      expect(staff.some((s: any) => s.role === 'resident')).toBe(false)
    })
    it('UUID نامعتبر → 400، ناموجود → 404', async () => {
      await erp('charges/not-a-uuid').expect(400)
      await erp('charges/00000000-0000-4000-8000-000000000000').expect(404)
    })
    it('updatedSince نامعتبر → 400', () => erp('charges?updatedSince=yesterday').expect(400))
  })

  describe('ایزوله‌سازی مجتمع‌ها (RLS)', () => {
    it('کلید مجتمع دیگر هیچ داده‌ای از این مجتمع نمی‌بیند', async () => {
      const k = await http.post('/admin/keys').set('Authorization', `Bearer ${signJwt({ sub: '22222222-2222-2222-2222-222222222221', tenant_id: OTHER_TENANT, role: 'admin', email: 'x' })}`).send({ name: 'other' }).expect(201)
      const r = await http.get(`/v1/charges/${CHARGE}`).set('X-API-Key', k.body.key).expect(404)
      expect(r.body.message).toBeTruthy()
      const list = await http.get('/v1/charges').set('X-API-Key', k.body.key).expect(200)
      expect(list.body.data.find((c: any) => c.id === CHARGE)).toBeUndefined()
    })
    it('ساکن به پنل اتصال دسترسی ندارد', () => http.get('/admin/overview').set('Authorization', `Bearer ${residentToken}`).expect(403))
  })

  describe('فید تغییرات و گزارش همگام‌سازی', () => {
    it('تغییر واقعی (UPDATE با app_user) در فید ظاهر می‌شود', async () => {
      const before = (await erp('changes?since=0&limit=1').expect(200)).body.data.latestSeq
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [TENANT])
        await c.query(`UPDATE finance.monthly_charges SET note = 'e2e ' || now()::text WHERE id = $1`, [CHARGE])
        await c.query('COMMIT')
      } finally {
        c.release()
      }
      const r = await erp(`changes?since=${before}&entities=charge`).expect(200)
      const ev = r.body.data.events.find((e: any) => e.id === CHARGE)
      expect(ev).toMatchObject({ entity: 'charge', action: 'updated' })
      expect(ev.data.totalAmount).toBe(3_562_000)
      expect(r.body.data.nextCursor).toBeGreaterThan(before)
    })
    it('cursor بدون فاصله صفحه‌به‌صفحه جلو می‌رود', async () => {
      const p1 = (await erp('changes?since=0&limit=2&includeData=false').expect(200)).body.data
      expect(p1.events).toHaveLength(2)
      expect(p1.hasMore).toBe(true)
      const p2 = (await erp(`changes?since=${p1.nextCursor}&limit=2&includeData=false`).expect(200)).body.data
      expect(p2.events[0].seq).toBeGreaterThan(p1.nextCursor)
    })
    it('موجودیت نامعتبر در فیلتر → 400', () => erp('changes?entities=nope').expect(400))
    it('ERP شماره سند گزارش می‌دهد', async () => {
      await http
        .post('/v1/sync')
        .set('X-API-Key', KEY)
        .send({ items: [{ entity: 'charge', id: CHARGE, status: 'synced', erpRef: 'SF-1405-0099' }] })
        .expect(200)
      const s = (await erp(`sync?id=${CHARGE}`).expect(200)).body.data[0]
      expect(s.erpRef).toBe('SF-1405-0099')
    })
    it('بدنه‌ی نامعتبر sync → 400', () =>
      http.post('/v1/sync').set('X-API-Key', KEY).send({ items: [{ entity: 'charge', id: 'x', status: 'ok' }] }).expect(400))
    it('کلید بدون scope sync نمی‌تواند گزارش دهد', async () => {
      const k = await http.post('/admin/keys').set('Authorization', `Bearer ${adminToken}`).send({ name: 'read-only', scopes: ['read'] }).expect(201)
      await http.post('/v1/sync').set('X-API-Key', k.body.key).send({ items: [{ entity: 'charge', id: CHARGE, status: 'synced' }] }).expect(403)
      await http.post(`/admin/keys/${k.body.id}/revoke`).set('Authorization', `Bearer ${adminToken}`).expect(200)
      await http.get('/v1/ping').set('X-API-Key', k.body.key).expect(401)
    })
  })

  describe('ارسال خودکار (push) به ERP', () => {
    let receiver: Server
    let url: string
    const received: { headers: Record<string, any>; body: string }[] = []
    let failNext = false

    beforeAll(async () => {
      receiver = createServer((req, res) => {
        let body = ''
        req.on('data', (ch) => (body += ch))
        req.on('end', () => {
          if (failNext) {
            failNext = false
            res.writeHead(503).end('busy')
            return
          }
          received.push({ headers: req.headers, body })
          const events = JSON.parse(body).events as any[]
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ results: events.filter((e) => e.entity === 'payment').map((e) => ({ entity: e.entity, id: e.id, status: 'synced', erpRef: `RCV-${e.seq}` })) }),
          )
        })
      })
      await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r))
      url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`
    })
    afterAll(() => new Promise<void>((r) => receiver.close(() => r())))

    it('ساخت مقصد، backfill، ارسال امضاشده، ثبت شماره سند، و تلاش مجدد بعد از خطا', async () => {
      const auth = { Authorization: `Bearer ${adminToken}` }
      const con = (
        await http.post('/admin/connectors').set(auth).send({ name: 'e2e ERP', url, entities: ['payment', 'charge'], startFrom: 'now', batchSize: 100 }).expect(201)
      ).body
      expect(con.secret).toMatch(/^whsec_/)

      const test = (await http.post(`/admin/connectors/${con.id}/test`).set(auth).expect(200)).body
      expect(test.ok).toBe(true)
      expect(verifySignature(con.secret, received[0].headers['x-livo-signature'], received[0].body)).toBe(true)

      const bf = (await http.post('/admin/backfill').set(auth).send({ entities: ['payment', 'unit'] }).expect(200)).body
      expect(bf.queued.payment).toBeGreaterThan(0)

      // اول ERP خطا می‌دهد → cursor جلو نمی‌رود
      failNext = true
      const fail = (await http.post(`/admin/connectors/${con.id}/run`).set(auth).expect(200)).body
      expect(fail?.result?.ok).toBe(false)
      let state = (await http.get('/admin/connectors').set(auth).expect(200)).body.find((c: any) => c.id === con.id)
      expect(state.cursorSeq).toBe(con.cursorSeq)
      expect(state.failureCount).toBe(1)

      // تلاش مجدد → موفق؛ unit فیلتر می‌شود و فقط payment/charge ارسال می‌شود
      const ok = (await http.post(`/admin/connectors/${con.id}/run`).set(auth).expect(200)).body
      expect(ok?.result?.ok).toBe(true)
      const last = JSON.parse(received[received.length - 1].body)
      expect(last.events.every((e: any) => ['payment', 'charge'].includes(e.entity))).toBe(true)
      expect(verifySignature(con.secret, received[received.length - 1].headers['x-livo-signature'], received[received.length - 1].body)).toBe(true)
      state = (await http.get('/admin/connectors').set(auth).expect(200)).body.find((c: any) => c.id === con.id)
      expect(state.failureCount).toBe(0)
      expect(state.cursorSeq).toBeGreaterThan(con.cursorSeq)

      const synced = (await erp('sync?entity=payment&status=synced').expect(200)).body.data
      expect(synced.some((s: any) => String(s.erpRef).startsWith('RCV-'))).toBe(true)

      const dl = (await http.get(`/admin/connectors/${con.id}/deliveries`).set(auth).expect(200)).body
      expect(dl.map((x: any) => x.success)).toEqual(expect.arrayContaining([true, false]))

      await http.delete(`/admin/connectors/${con.id}`).set(auth).expect(200)
    })

    it('آدرس نامعتبر یا نوع ناشناخته رد می‌شود', async () => {
      const auth = { Authorization: `Bearer ${adminToken}` }
      await http.post('/admin/connectors').set(auth).send({ name: 'bad', url: 'ftp://x.example/' }).expect(400)
      await http.post('/admin/connectors').set(auth).send({ name: 'bad', url: 'https://u:p@erp.example/' }).expect(400)
      await http.post('/admin/connectors').set(auth).send({ name: 'bad', url: 'https://erp.example/', type: 'nope' }).expect(400)
    })
  })
})
