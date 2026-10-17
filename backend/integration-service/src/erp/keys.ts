import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * کلید API سرور‌به‌سرور برای ERP.
 *
 * قالب: hmn_<live|test>_<tenant-id بدون خط تیره (۳۲ hex)>_<۴۰ نویسه‌ی تصادفی>
 * tenant در خود کلید است تا جست‌وجوی هش «داخل» RLS همان مجتمع انجام شود؛ نیازی به دور زدن RLS
 * یا نقش BYPASSRLS برای احراز هویت نیست. فقط SHA-256 کلید ذخیره می‌شود؛ خود کلید یک بار نمایش داده می‌شود.
 */
const KEY_RE = /^hmn_(live|test)_([0-9a-f]{32})_([A-Za-z0-9]{20,80})$/

export interface ParsedKey {
  env: 'live' | 'test'
  tenantId: string
}

export function parseKey(raw: string): ParsedKey | null {
  const m = KEY_RE.exec(raw.trim())
  if (!m) return null
  const h = m[2]
  const tenantId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  return { env: m[1] as 'live' | 'test', tenantId }
}

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw.trim(), 'utf8').digest('hex')
}

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function randomToken(len: number): string {
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += ALNUM[bytes[i] % ALNUM.length]
  return out
}

export function generateKey(tenantId: string, env: 'live' | 'test'): { key: string; prefix: string; hash: string } {
  const key = `hmn_${env}_${tenantId.replace(/-/g, '').toLowerCase()}_${randomToken(40)}`
  return { key, prefix: key.slice(0, 13), hash: hashKey(key) }
}

/** امضای HMAC بدنه‌ی ارسالی به ERP: hex(HMAC-SHA256(secret, `${t}.${body}`)) */
export function sign(secret: string, t: number, body: string): string {
  return createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')
}

/** اعتبارسنجی هدر X-Livo-Signature با قالب "t=<unix>,v1=<hex>" (همان چیزی که ERP باید پیاده کند) */
export function verifySignature(secret: string, header: string | undefined, body: string, toleranceSec = 300): boolean {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]))
  const t = Number(parts.t)
  if (!t || !parts.v1) return false
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = Buffer.from(sign(secret, t, body), 'hex')
  const got = Buffer.from(parts.v1, 'hex')
  return expected.length === got.length && timingSafeEqual(expected, got)
}
