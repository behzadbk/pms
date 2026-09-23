/**
 * تست ایزوله‌سازی Tenant (Row-Level Security) — سطح دیتابیس واقعی
 *
 * این تست فرض می‌کند:
 *  1. یک PostgreSQL واقعی روی TEST_DATABASE_URL در دسترس است.
 *  2. نقش‌های `app_user` (NOBYPASSRLS) و `platform_admin` (BYPASSRLS) از قبل
 *     ساخته شده‌اند (این نقش‌ها بخشی از migration مشترک پروژه‌ی pms-db هستند،
 *     نه این سرویس — بنابراین قبل از اجرای این تست باید یا از طریق آن پروژه
 *     bootstrap شوند یا (برای CI مستقل) با اسکریپت docker-compose کمکی که
 *     در infra/docker/docker-compose.test.yml اضافه شده ساخته شوند).
 *  3. migration این سرویس (001_enable_rls.sql) روی همان دیتابیس اجرا شده.
 *
 * هدف: اثبات این‌که policy های RLS واقعاً روی یک Postgres واقعی (نه mock)
 * enforce می‌شوند — هم برای SELECT (نشتی cross-tenant) و هم برای INSERT
 * (جعل tenant_id توسط یک کاربر tenant دیگر).
 */
import { Pool } from 'pg'
import { randomUUID } from 'crypto'

const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ??
  'postgresql://platform_admin:admin_pw@localhost:5432/pms_test'
const APP_URL =
  process.env.TEST_DATABASE_APP_URL ?? 'postgresql://app_user:app_pw@localhost:5432/pms_test'

describe('Property Service — Tenant Isolation (RLS)', () => {
  const tenantA = randomUUID()
  const tenantB = randomUUID()
  const buildingA = randomUUID()
  const buildingB = randomUUID()

  let adminPool: Pool
  let appPool: Pool

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: ADMIN_URL })
    appPool = new Pool({ connectionString: APP_URL })

    await adminPool.query(
      `INSERT INTO property.buildings (id, tenant_id, name) VALUES ($1,$2,'Tower A'), ($3,$4,'Tower B')`,
      [buildingA, tenantA, buildingB, tenantB],
    )
  })

  afterAll(async () => {
    await adminPool.query(`DELETE FROM property.buildings WHERE id IN ($1,$2)`, [
      buildingA,
      buildingB,
    ])
    await adminPool.end()
    await appPool.end()
  })

  /** شبیه‌سازی دقیق DatabaseService.withTenant */
  async function withTenant<T = any>(
    tenantId: string,
    fn: (client: any) => Promise<T>,
  ): Promise<T> {
    const client = await appPool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId])
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  it('بدون تنظیم app.current_tenant_id هیچ رکوردی برنمی‌گرداند (fail closed)', async () => {
    const client = await appPool.connect()
    try {
      const res = await client.query(
        `SELECT * FROM property.buildings WHERE id IN ($1,$2)`,
        [buildingA, buildingB],
      )
      expect(res.rows).toHaveLength(0)
    } finally {
      client.release()
    }
  })

  it('tenant A فقط ساختمان‌های tenant A را می‌بیند، نه tenant B را', async () => {
    const rows = await withTenant(tenantA, (client) =>
      client
        .query(`SELECT id, tenant_id FROM property.buildings WHERE id IN ($1,$2)`, [
          buildingA,
          buildingB,
        ])
        .then((r: any): any[] => r.rows),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(buildingA)
  })

  it('tenant B فقط ساختمان‌های tenant B را می‌بیند', async () => {
    const rows = await withTenant(tenantB, (client) =>
      client
        .query(`SELECT id, tenant_id FROM property.buildings WHERE id IN ($1,$2)`, [
          buildingA,
          buildingB,
        ])
        .then((r: any): any[] => r.rows),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(buildingB)
  })

  it('tenant A نمی‌تواند رکوردی با tenant_id جعلی (tenant B) درج کند', async () => {
    await expect(
      withTenant(tenantA, (client) =>
        client.query(`INSERT INTO property.buildings (tenant_id, name) VALUES ($1, 'Forged')`, [
          tenantB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('SET LOCAL بعد از COMMIT به کانکشن بعدی همان pool نشت نمی‌کند (context بین request‌ها leak نمی‌شود)', async () => {
    const rowsA = await withTenant(tenantA, (client) =>
      client
        .query(`SELECT id FROM property.buildings WHERE id IN ($1,$2)`, [buildingA, buildingB])
        .then((r: any): any[] => r.rows),
    )
    expect(rowsA.map((r: any) => r.id)).toEqual([buildingA])

    // نکته‌ی مهم (یافته‌ی واقعی این تست، نه فرض): بعد از این‌که یک custom GUC
    // مثل app.current_tenant_id حداقل یک‌بار روی یک physical connection با
    // SET LOCAL ست شده باشد، مقدار «reset» آن پس از COMMIT به‌جای NULL برابر
    // رشته‌ی خالی '' می‌شود (رفتار مستند خود PostgreSQL برای placeholder GUCها).
    // نتیجه: کوئری بعدی روی همان کانکشنِ recycle-شده که context را ست نمی‌کند
    // دیگر «۰ ردیف» برنمی‌گرداند، بلکه چون ''::uuid نامعتبر است با خطا fail
    // می‌شود. این هم‌چنان fail-closed است (هیچ داده‌ای نشت نمی‌کند) اما به‌جای
    // پاسخ خالی، یک خطای ۵۰۰ ایجاد می‌کند — نکته‌ای که برای هر Controller جدید
    // که فراموش کند از db.withTenant(...) استفاده کند، باید در نظر گرفته شود.
    const client = await appPool.connect()
    try {
      await expect(
        client.query(`SELECT id FROM property.buildings WHERE id = $1`, [buildingA]),
      ).rejects.toThrow(/invalid input syntax for type uuid/i)
    } finally {
      client.release()
    }
  })
})
