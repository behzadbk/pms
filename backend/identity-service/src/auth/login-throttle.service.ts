import { createHash } from 'crypto'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

/** ۵ خطا آزاد؛ از خطای ششم قفل با backoff نمایی (۳۰ث، ۶۰ث، ۲د، … تا ۱۵ دقیقه) */
export const FREE_ATTEMPTS = 5
const BASE_LOCK_SECONDS = 30
const MAX_LOCK_SECONDS = 15 * 60
/** اگر این‌قدر از آخرین خطا بگذرد، شمارنده ریست می‌شود */
const RESET_AFTER_SECONDS = 60 * 60

/** ثانیه‌های قفل پس از n خطای متوالی (۰ = بدون قفل) */
export function lockoutSeconds(fails: number): number {
  if (fails <= FREE_ATTEMPTS) return 0
  // backoff نمایی: خطای ششم ⇒ ۳۰ث، هفتم ⇒ ۶۰ث، هشتم ⇒ ۱۲۰ث … با سقف ۱۵ دقیقه.
  return Math.min(MAX_LOCK_SECONDS, BASE_LOCK_SECONDS * 2 ** (fails - FREE_ATTEMPTS - 1))
}

export function throttleKey(scope: string, ...parts: string[]): string {
  return createHash('sha256')
    .update([scope, ...parts.map((p) => p.trim().toLowerCase())].join('\u0000'))
    .digest('hex')
}

/**
 * محدودسازی تلاش ورود. دو کلید همزمان بررسی می‌شود:
 *  - حساب (بدون IP): جلوی حدس‌زدن رمز یک حساب از چند IP را می‌گیرد؛
 *  - حساب + IP: IP مهاجم را جدا هم می‌بندد.
 * وضعیت در Postgres نگه‌داری می‌شود تا با چند نمونه‌ی سرویس و ری‌استارت هم کار کند.
 * شناسه‌ی خام حساب/IP ذخیره نمی‌شود (فقط هش).
 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly db: DatabaseService) {}

  private keys(scope: string, account: string, ip: string) {
    return [throttleKey(scope, account), throttleKey(scope, account, ip || 'unknown')]
  }

  /** اگر قفل است ۴۲۹ می‌دهد */
  async assertAllowed(scope: string, account: string, ip: string): Promise<void> {
    const keys = this.keys(scope, account, ip)
    const row = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ wait: string }>(
        `SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (locked_until - now()))), 0) AS wait
           FROM identity.login_attempts WHERE key = ANY($1) AND locked_until > now()`,
        [keys],
      )
      return r.rows[0]
    })
    const wait = Math.ceil(Number(row?.wait ?? 0))
    if (wait > 0) {
      throw new HttpException(
        { statusCode: 429, message: `تلاش‌های ناموفق زیاد بود؛ ${wait} ثانیه‌ی دیگر دوباره امتحان کنید`, retryAfter: wait },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  async recordFailure(scope: string, account: string, ip: string): Promise<void> {
    const keys = this.keys(scope, account, ip)
    await this.db.withPlatformAccess(async (c) => {
      for (const key of keys) {
        // upsert اتمیک: بدون خواندن‌ونوشتن جدا (که با دو تلاش هم‌زمان یکی را گم می‌کرد). اگر آخرین خطا قدیمی‌تر از
        // RESET_AFTER_SECONDS باشد شمارنده از ۱ شروع می‌شود، وگرنه یکی بالا می‌رود.
        const r = await c.query<{ fails: number }>(
          `INSERT INTO identity.login_attempts (key, fails, last_fail_at) VALUES ($1, 1, now())
           ON CONFLICT (key) DO UPDATE SET
             fails = CASE WHEN identity.login_attempts.last_fail_at < now() - make_interval(secs => $2)
                          THEN 1 ELSE identity.login_attempts.fails + 1 END,
             last_fail_at = now()
           RETURNING fails`,
          [key, RESET_AFTER_SECONDS],
        )
        const lock = lockoutSeconds(r.rows[0].fails)
        if (lock > 0) {
          await c.query(`UPDATE identity.login_attempts SET locked_until = now() + make_interval(secs => $2) WHERE key = $1`, [key, lock])
        }
      }
      // پاکسازیِ احتمالاتی (حدود ۲٪ خطاها): به‌جای cron جدا، ردیف‌های قدیمی‌تر از یک روز را گاهی حذف می‌کنیم
      // تا جدول بی‌نهایت بزرگ نشود، بدون اینکه هر درخواست هزینه‌ی DELETE بدهد.
      if (Math.random() < 0.02) {
        await c.query(`DELETE FROM identity.login_attempts WHERE last_fail_at < now() - interval '1 day'`)
      }
    })
  }

  async recordSuccess(scope: string, account: string, ip: string): Promise<void> {
    const keys = this.keys(scope, account, ip)
    await this.db.withPlatformAccess((c) => c.query(`DELETE FROM identity.login_attempts WHERE key = ANY($1)`, [keys]))
  }
}
