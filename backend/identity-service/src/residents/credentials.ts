import * as bcrypt from 'bcrypt'
import type { PoolClient } from 'pg'
import { toLatinDigits } from './phone'

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

/** رمز اولیه = شماره واحد (ارقام لاتین؛ مثلاً ۱۷۰۳ → 1703) */
export function initialPassword(unitNumber: string): string {
  return toLatinDigits(String(unitNumber)).trim()
}

/**
 * حساب ورود ساکن را (اگر نیست) می‌سازد: نام کاربری = موبایل، رمز = شماره واحد، با پرچم «باید رمز را عوض کند».
 * اگر شخص قبلاً حساب دارد (مثلاً از ساختمان/واحد دیگر یا با رمز خودش) دست‌نخورده می‌ماند.
 */
export async function ensureLogin(
  client: PoolClient,
  tenantId: string,
  person: { id: string; name: string; phone: string | null },
  unitNumber: string,
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
  const password = initialPassword(unitNumber)
  const hash = await bcrypt.hash(password, 10)
  await client.query(
    `INSERT INTO identity.users (tenant_id, full_name, username, phone, password_hash, role, person_id, must_change_password)
     VALUES ($1, $2, $3, $3, $4, 'resident', $5, true)`,
    [tenantId, person.name, username, hash, person.id],
  )
  return { username, password, created: true }
}

/** بازنشانی رمز به شماره واحد (مدیر) — نشست‌های قبلی قطع می‌شود */
export async function resetToUnitPassword(client: PoolClient, tenantId: string, personId: string, unitNumber: string): Promise<{ username: string; password: string } | null> {
  const password = initialPassword(unitNumber)
  const hash = await bcrypt.hash(password, 10)
  const r = await client.query<{ username: string }>(
    `UPDATE identity.users SET password_hash = $3, must_change_password = true, is_active = true,
            sessions_valid_after = now(), updated_at = now()
      WHERE person_id = $1 AND tenant_id = $2 RETURNING username`,
    [personId, tenantId, hash],
  )
  return r.rowCount ? { username: r.rows[0].username, password } : null
}
