/**
 * موبایل: هر ورودی رایج (۰۹۱۲ ۳۴۵ ۶۷۸۹، 09123456789، 989123456789، +989123456789)
 * به قالب E.164 تبدیل می‌شود تا «یک شماره = یک حساب» واقعاً یکتا بماند.
 */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const s = toLatinDigits(String(input)).replace(/[\s\-()]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s
  if (/^00[1-9]\d{7,14}$/.test(s)) return '+' + s.slice(2)
  if (/^09\d{9}$/.test(s)) return '+98' + s.slice(1)
  if (/^9\d{9}$/.test(s)) return '+98' + s
  if (/^98\d{10}$/.test(s)) return '+' + s
  if (/^0[1-8]\d{9}$/.test(s)) return '+98' + s.slice(1) // تلفن ثابت (مثلاً شرکت مالک)
  return null
}

/** نمایش: «0912 345 6789» */
export function displayPhone(e164: string | null | undefined): string | null {
  if (!e164) return null
  if (e164.startsWith('+98') && e164.length === 13) {
    const local = '0' + e164.slice(3)
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  return e164
}

export function normalizeNationalId(input: string | null | undefined): string | null {
  if (!input) return null
  const s = toLatinDigits(String(input)).replace(/\D/g, '')
  return s.length ? s : null
}
