import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { jwtSecret } from '../auth/jwt-secret'

/**
 * TOTP (RFC 6238) بدون وابستگی خارجی — سازگار با Google Authenticator / Authy / 2FAS.
 * SHA-1، ۶ رقم، گام ۳۰ ثانیه؛ پذیرش ±۱ گام برای اختلاف ساعت.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(str: string): Buffer {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error('base32 نامعتبر')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** کد ۶ رقمی برای یک گام زمانی مشخص */
export function totpAt(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest()
  const off = h[h.length - 1] & 0xf
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0')
}

/** درستی کد کاربر (±۱ گام). مقایسه‌ی زمان‌ثابت. */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now()): boolean {
  const clean = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const counter = Math.floor(nowMs / 1000 / STEP_SECONDS)
  let ok = false
  for (const d of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secretB32, counter + d))
    const given = Buffer.from(clean)
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true
  }
  return ok
}

export function otpauthUrl(username: string, secretB32: string, issuer = 'Livo Platform'): string {
  const label = encodeURIComponent(`${issuer}:${username}`)
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP_SECONDS}`
}

/* ───── رمزگذاری راز TOTP در دیتابیس (AES-256-GCM) ─────
 * کلید: PLATFORM_TOTP_KEY (اختیاری)، وگرنه مشتق از کلید JWT. اگر دیتابیس تنها لو برود راز خوانا نیست. */
function encKey(): Buffer {
  return createHash('sha256').update(`livo-totp:${process.env.PLATFORM_TOTP_KEY || jwtSecret()}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', encKey(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`
}

export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.')
  const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8')
}
