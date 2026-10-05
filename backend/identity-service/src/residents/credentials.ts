import * as bcrypt from 'bcrypt'
import { randomInt } from 'crypto'
import type { PoolClient } from 'pg'

export interface LoginCredentials {
  username: string
  /** فقط وقتی حساب همین الان ساخته شده (یا مدیر بازنشانی کرده) پر است؛ رمز فعلی هرگز برنمی‌گردد */
  password: string | null
  created: boolean
}

/** نام کاربری ساکن = موبایل به شکل محلی (۰۹۱۲…) */
export function usernameFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  return phone.startsWith('+98') ? '0' + phone.slice(3) : phone.replace('+', '')
}

/** حروف و ارقامِ بدون ابهام (بدون 0/O و 1/l/I) تا رمز هنگام تحویل حضوری یا پیامکی اشتباه خوانده نشود */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/**
 * رمز موقت تصادفی (۱۰ نویسه، با crypto.randomInt) — قبلاً رمز اولیه همان شماره‌ی واحد بود و حدس‌زدنش ساده بود.
 * ساکن با پرچم must_change_password باید در اولین ورود رمز خودش را بگذارد.
 */
export function generateTempPassword(length = 10): string {
  let out = ''
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return out
}

/**
 * حساب ورود ساکن را (اگر نیست) می‌سازد: نام کاربری = موبایل، رمز = رمز موقت تصادفی، با پرچم «باید رمز را عوض کند».
 * اگر شخص قبلاً حساب دارد (مثلاً از ساختمان/واحد دیگر یا با رمز خودش) دست‌نخورده می‌ماند.
 */
export async function ensureLogin(
  client: PoolClient,
  tenantId: string,
  person: { id: string; name: string; phone: string | null },
): Promise<LoginCredentials | null> {
  const username = usernameFromPhone(person.phone)
  if (!username) return null
  const existing = await client.query<{ username: string | null }>(
    `SELECT username FROM identity.users WHERE person_id = $1 AND tenant_id = $2 LIMIT 1`,
    [person.id, tenantId],
  )
  if (existing.rowCount) return { username: existing.rows[0].username ?? username, password: null, created: false }
  const clash = await client.query(`SELECT 1 FROM identity.users WHERE tenant_id = $1 AND username = $2`, [tenantId, username])
  if (clash.rowCount) return null // نام کاربری برای حساب دیگری (مثلاً کارمند) گرفته شده
  const password = generateTempPassword()
  const hash = await bcrypt.hash(password, 10)
  await client.query(
    `INSERT INTO identity.users (tenant_id, full_name, username, phone, password_hash, role, person_id, must_change_password)
     VALUES ($1, $2, $3, $3, $4, 'resident', $5, true)`,
    [tenantId, person.name, username, hash, person.id],
  )
  return { username, password, created: true }
}

/** بازنشانی رمز به یک رمز موقت تازه (مدیر) — نشست‌های قبلی قطع می‌شود */
export async function resetToTempPassword(client: PoolClient, tenantId: string, personId: string): Promise<{ username: string; password: string } | null> {
  const password = generateTempPassword()
  const hash = await bcrypt.hash(password, 10)
  const r = await client.query<{ username: string }>(
    `UPDATE identity.users SET password_hash = $3, must_change_password = true, is_active = true,
            sessions_valid_after = now(), updated_at = now()
      WHERE person_id = $1 AND tenant_id = $2 RETURNING username`,
    [personId, tenantId, hash],
  )
  return r.rowCount ? { username: r.rows[0].username, password } : null
}
