import { randomInt } from 'crypto'

/**
 * رمز موقت: تصادفی رمزنگاری‌شده (crypto.randomInt)، بدون کاراکترهای شبیه‌هم (0/O، 1/l/I).
 * هرگز لاگ نمی‌شود و فقط یک‌بار در پاسخ همان درخواستِ ساخت به مدیرِ سازنده برمی‌گردد.
 */
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGIT = '23456789'
const SYMBOL = '#$%&*+-=?@'
const ALL = LOWER + UPPER + DIGIT

const pick = (set: string) => set[randomInt(set.length)]

export function generateTempPassword(length = 12): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)]
  while (chars.length < length) chars.push(pick(ALL))
  // Fisher–Yates با منبع تصادفی امن
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'password', 'passw0rd', 'passw0rd!', 'qwertyui', 'qwerty123',
  '11111111', '00000000', 'abcd1234', 'iloveyou', '87654321', '09123456789',
])

/**
 * سیاست رمز: حداقل ۸ کاراکتر، نه فقط عدد/تکراری، نه رمزهای رایج، و نه شامل شناسه‌های قابل حدس
 * (نام کاربری، موبایل، شماره واحد). خروجی null یعنی معتبر است، وگرنه پیام فارسی خطا.
 */
export function passwordPolicyError(password: string, guessable: Array<string | null | undefined> = []): string | null {
  if (password.length < 8) return 'رمز عبور باید حداقل ۸ کاراکتر باشد'
  if (password.length > 72) return 'رمز عبور حداکثر ۷۲ کاراکتر می‌تواند باشد'
  if (/^\d+$/.test(password)) return 'رمز عبور نباید فقط عدد باشد'
  if (new Set(password).size < 3) return 'رمز عبور بیش از حد ساده است'
  if (COMMON.has(password.toLowerCase())) return 'این رمز بسیار رایج و قابل حدس است'
  const lower = password.toLowerCase()
  for (const g of guessable) {
    const v = g?.trim().toLowerCase()
    if (v && v.length >= 2 && lower.includes(v)) {
      return 'رمز عبور نباید شامل نام کاربری، شماره موبایل یا شماره واحد باشد'
    }
  }
  return null
}
