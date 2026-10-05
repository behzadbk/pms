import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Client } from 'pg'
import * as webpush from 'web-push'
import { DatabaseService } from '../database/database.service'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

export interface SubscribeBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

interface InboxRow {
  id: string
  tenant_id: string
  recipient_person: string | null
  recipient_login: string | null
  recipient_role: string | null
  kind: string
  title: string
  body: string | null
  link: string | null
  ref_id: string | null
}

/**
 * ارسال push از سمت سرور به آدرسی است که کلاینت داده؛ برای جلوگیری از SSRF فقط سرویس‌های push
 * شناخته‌شده‌ی مرورگرها مجازند (در توسعه localhost هم). میزبان‌های بیشتر: PUSH_ALLOWED_HOSTS (با کاما).
 */
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/]
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let u: URL
  try {
    u = new URL(endpoint)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const extra = (process.env.PUSH_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  if (extra.includes(u.hostname)) return true
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true
  return PUSH_HOSTS.some((re) => re.test(u.hostname))
}

/** این‌ها پس از چند شکست متوالی پاک می‌شوند؛ 404/410 فوراً */
const MAX_FAILURES = 5

/**
 * Web Push واقعی (VAPID):
 *  • کلید VAPID در اولین اجرا ساخته و در notification.push_config ذخیره می‌شود (یا از env).
 *  • هر INSERT در notification.inbox (از هر سرویسی) با trigger → NOTIFY inbox_new؛
 *    این سرویس LISTEN می‌کند و بلافاصله به همه‌ی دستگاه‌های گیرنده push می‌فرستد.
 *  • گیرنده همان منطق صندوق اعلان است: شخص | حساب ورود | نقش | perm:xxx.
 *  • اشتراک‌های منقضی (404/410) خودکار پاک می‌شوند.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PushService.name)
  private publicKey = ''
  private ready = false
  private listener: Client | null = null
  private stopped = false
  private retry: NodeJS.Timeout | null = null

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    try {
      await this.initVapid()
      this.ready = true
      void this.listen()
    } catch (e) {
      this.log.error(`راه‌اندازی Web Push ناموفق بود: ${(e as Error).message}`)
    }
  }

  onModuleDestroy() {
    this.stopped = true
    if (this.retry) clearTimeout(this.retry)
    void this.listener?.end().catch(() => undefined)
  }

  getPublicKey() {
    return { publicKey: this.publicKey, enabled: this.ready }
  }

  private async initVapid() {
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@hamin.app'
    let pub = process.env.VAPID_PUBLIC_KEY
    let priv = process.env.VAPID_PRIVATE_KEY
    if (!pub || !priv) {
      await this.db.withPlatformAccess(async (c) => {
        const cur = (await c.query<{ public_key: string; private_key: string }>(`SELECT public_key, private_key FROM notification.push_config WHERE id = 1`)).rows[0]
        if (cur) {
          pub = cur.public_key
          priv = cur.private_key
          return
        }
        const k = webpush.generateVAPIDKeys()
        // همزمانی چند نمونه: ON CONFLICT → همان کلیدِ اولی برنده است
        await c.query(`INSERT INTO notification.push_config (id, public_key, private_key, subject) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING`, [k.publicKey, k.privateKey, subject])
        const row = (await c.query<{ public_key: string; private_key: string }>(`SELECT public_key, private_key FROM notification.push_config WHERE id = 1`)).rows[0]
        pub = row.public_key
        priv = row.private_key
        this.log.log('کلید VAPID جدید ساخته شد')
      })
    }
    webpush.setVapidDetails(subject, pub!, priv!)
    this.publicKey = pub!
  }

  /* ───────────── اشتراک ───────────── */

  async subscribe(user: JwtPayload, body: SubscribeBody) {
    if (!user.tenant_id) return { ok: false }
    if (!isAllowedPushEndpoint(body.endpoint)) throw new BadRequestException('این آدرس push پشتیبانی نمی‌شود')
    const family = user.kind === 'family'
    await this.db.withTenant(user.tenant_id, (c) =>
      c.query(
        `INSERT INTO notification.push_subscriptions (tenant_id, login_id, person_id, role, perms, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (endpoint) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, login_id = EXCLUDED.login_id, person_id = EXCLUDED.person_id,
           role = EXCLUDED.role, perms = EXCLUDED.perms, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent, failures = 0, last_seen_at = now()`,
        [user.tenant_id, family ? null : user.sub, user.pid ?? null, user.role, user.perms ?? [], body.endpoint, body.keys.p256dh, body.keys.auth, (body.userAgent ?? '').slice(0, 200)],
      ),
    )
    return { ok: true }
  }

  async unsubscribe(user: JwtPayload, endpoint: string) {
    if (!user.tenant_id) return { ok: true }
    await this.db.withTenant(user.tenant_id, (c) => c.query(`DELETE FROM notification.push_subscriptions WHERE endpoint = $1`, [endpoint]))
    return { ok: true }
  }

  /** وضعیت این دستگاه: آیا اشتراک فعال است؟ (برای نمایش در تنظیمات) */
  async status(user: JwtPayload, endpoint: string) {
    if (!user.tenant_id) return { subscribed: false }
    const r = await this.db.withTenant(user.tenant_id, (c) => c.query(`SELECT 1 FROM notification.push_subscriptions WHERE endpoint = $1`, [endpoint]))
    return { subscribed: (r.rowCount ?? 0) > 0 }
  }

  /** اعلان آزمایشی به همین کاربر (دکمه‌ی «ارسال آزمایشی» در تنظیمات) */
  async sendTest(user: JwtPayload) {
    if (!user.tenant_id) return { sent: 0 }
    const subs = await this.db.withTenant(user.tenant_id, async (c) =>
      (await c.query<SubRow>(
        `SELECT id, endpoint, p256dh, auth FROM notification.push_subscriptions
          WHERE ($1::uuid IS NOT NULL AND login_id = $1) OR ($2::uuid IS NOT NULL AND person_id = $2)`,
        [user.kind === 'family' ? null : user.sub, user.pid ?? null])).rows)
    const sent = await this.deliver(user.tenant_id, subs, { title: 'همین — اعلان آزمایشی', body: 'اعلان‌ها روی این دستگاه فعال است ✅', url: '/', tag: 'test', kind: 'test' })
    return { sent }
  }

  /* ───────────── ارسال ───────────── */

  private async listen() {
    if (this.stopped) return
    const c = new Client({ connectionString: process.env.DATABASE_URL })
    this.listener = c
    const reconnect = () => {
      if (this.stopped || this.retry) return
      this.listener = null
      this.retry = setTimeout(() => {
        this.retry = null
        void this.listen()
      }, 3000)
    }
    c.on('error', (e) => {
      this.log.warn(`اتصال LISTEN قطع شد: ${e.message}`)
      reconnect()
    })
    c.on('end', reconnect)
    c.on('notification', (msg) => {
      if (msg.channel !== 'inbox_new' || !msg.payload) return
      const [tenantId, id] = msg.payload.split(':')
      this.dispatch(tenantId, id).catch((e) => this.log.warn(`ارسال push ناموفق: ${(e as Error).message}`))
    })
    try {
      await c.connect()
      await c.query('LISTEN inbox_new')
      this.log.log('Web Push آماده است — در انتظار inbox_new')
    } catch (e) {
      this.log.warn(`اتصال LISTEN برقرار نشد: ${(e as Error).message}`)
      void c.end().catch(() => undefined)
      reconnect()
    }
  }

  private async dispatch(tenantId: string, inboxId: string) {
    if (!this.ready) return
    const { n, subs } = await this.db.withTenant(tenantId, async (c) => {
      const n = (await c.query<InboxRow>(`SELECT * FROM notification.inbox WHERE id = $1`, [inboxId])).rows[0]
      if (!n) return { n: null, subs: [] as SubRow[] }
      const subs = (await c.query<SubRow>(
        `SELECT id, endpoint, p256dh, auth FROM notification.push_subscriptions
          WHERE ($1::uuid IS NOT NULL AND person_id = $1)
             OR ($2::uuid IS NOT NULL AND login_id = $2)
             OR ($3::text IS NOT NULL AND (role = $3 OR $3 IN (SELECT 'perm:' || p FROM unnest(perms) p)))`,
        [n.recipient_person, n.recipient_login, n.recipient_role])).rows
      return { n, subs }
    })
    if (!n || !subs.length) return
    await this.deliver(tenantId, subs, {
      title: n.title,
      body: n.body ?? '',
      url: n.link || '/',
      tag: n.ref_id ? `${n.kind}:${n.ref_id}` : n.kind,
      kind: n.kind,
      inboxId: n.id,
    })
  }

  private async deliver(tenantId: string, subs: SubRow[], payload: Record<string, unknown>) {
    const data = JSON.stringify(payload)
    let ok = 0
    // یک دستگاه ممکن است با چند منطق گیرنده تکراری انتخاب شود
    const seen = new Set<string>()
    await Promise.all(
      subs.filter((s) => (seen.has(s.endpoint) ? false : (seen.add(s.endpoint), true))).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 60 * 60 * 24, urgency: 'high' })
          ok++
          await this.db.withTenant(tenantId, (c) => c.query(`UPDATE notification.push_subscriptions SET last_sent_at = now(), failures = 0 WHERE id = $1`, [s.id]))
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          await this.db.withTenant(tenantId, async (c) => {
            if (code === 404 || code === 410) await c.query(`DELETE FROM notification.push_subscriptions WHERE id = $1`, [s.id])
            else await c.query(`UPDATE notification.push_subscriptions SET failures = failures + 1 WHERE id = $1`, [s.id])
            await c.query(`DELETE FROM notification.push_subscriptions WHERE id = $1 AND failures >= $2`, [s.id, MAX_FAILURES])
          }).catch(() => undefined)
          this.log.debug(`push رد شد (${code ?? 'خطا'})`)
        }
      }),
    )
    return ok
  }
}

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}
