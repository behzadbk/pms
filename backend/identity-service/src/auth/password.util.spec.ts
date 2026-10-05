import { generateTempPassword, passwordPolicyError } from './password.util'

describe('generateTempPassword', () => {
  it('طول و ترکیب کاراکتر را رعایت می‌کند', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword()
      expect(p).toHaveLength(12)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[2-9]/)
      expect(p).toMatch(/[#$%&*+\-=?@]/)
      expect(p).not.toMatch(/[01OIl]/)
    }
  })

  it('هر بار مقدار متفاوتی می‌دهد (تصادفی است)', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTempPassword()))
    expect(set.size).toBe(200)
  })
})

describe('passwordPolicyError', () => {
  it('رمز کوتاه یا فقط‌عدد را رد می‌کند', () => {
    expect(passwordPolicyError('abc12')).toMatch(/۸/)
    expect(passwordPolicyError('12345678')).toMatch(/عدد/)
    expect(passwordPolicyError('aaaaaaaa')).toBeTruthy()
  })

  it('رمزهای رایج را رد می‌کند', () => {
    expect(passwordPolicyError('Password')).toBeTruthy()
    expect(passwordPolicyError('qwerty123')).toBeTruthy()
  })

  it('رمزی که شماره واحد/موبایل/نام کاربری را در خود دارد رد می‌شود', () => {
    expect(passwordPolicyError('unit1204x', ['1204'])).toBeTruthy()
    expect(passwordPolicyError('x09121234567y', ['09121234567'])).toBeTruthy()
    expect(passwordPolicyError('hello-lobby-1', ['lobby'])).toBeTruthy()
  })

  it('رمز مناسب پذیرفته می‌شود', () => {
    expect(passwordPolicyError('k7#Tq-92mZpa', ['1204', '0912'])).toBeNull()
    expect(passwordPolicyError(generateTempPassword())).toBeNull()
  })
})
