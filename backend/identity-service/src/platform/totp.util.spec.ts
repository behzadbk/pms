import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateTotpSecret, totpAt, verifyTotp } from './totp.util'

// RFC 6238 Appendix B: راز ASCII «12345678901234567890»، SHA-1، گام ۳۰ث. کد ۶ رقمی = ۶ رقم آخر مقدار ۸ رقمی مرجع.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
]

describe('totp.util', () => {
  it('base32 رفت‌وبرگشت', () => {
    const buf = Buffer.from('livo-platform-2fa')
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true)
  })

  it.each(VECTORS)('بردار RFC 6238 در t=%i', (t, code) => {
    expect(totpAt(RFC_SECRET, Math.floor(t / 30))).toBe(code)
    expect(verifyTotp(RFC_SECRET, code, t * 1000)).toBe(true)
  })

  it('±۱ گام پذیرفته می‌شود ولی بیشتر از آن نه', () => {
    const t = 1_700_000_000
    const code = totpAt(RFC_SECRET, Math.floor(t / 30))
    expect(verifyTotp(RFC_SECRET, code, (t + 30) * 1000)).toBe(true)
    expect(verifyTotp(RFC_SECRET, code, (t - 30) * 1000)).toBe(true)
    expect(verifyTotp(RFC_SECRET, code, (t + 120) * 1000)).toBe(false)
  })

  it('کد نامعتبر یا غیرعددی رد می‌شود', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBe(false)
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false)
    expect(verifyTotp(RFC_SECRET, '')).toBe(false)
  })

  it('فاصله‌ی وسط کد نادیده گرفته می‌شود', () => {
    const t = 59
    expect(verifyTotp(RFC_SECRET, '287 082', t * 1000)).toBe(true)
  })

  it('راز تصادفی ۳۲ نویسه‌ی base32 است', () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/)
  })

  it('رمزگذاری راز: رفت‌وبرگشت درست و دست‌کاری شناسایی می‌شود', () => {
    const s = generateTotpSecret()
    const enc = encryptSecret(s)
    expect(enc).not.toContain(s)
    expect(decryptSecret(enc)).toBe(s)
    const [iv, tag, data] = enc.split('.')
    const tampered = [iv, tag, Buffer.from('x' + Buffer.from(data, 'base64').toString('latin1').slice(1), 'latin1').toString('base64')].join('.')
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
