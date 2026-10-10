/** رمز تصادفی خوانا (بدون کاراکترهای شبیه‌هم) برای حساب ورود کارمند/حسابدار */
export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  arr.forEach((n) => (out += chars[n % chars.length]))
  return out
}

/** اعداد فارسی/عربی → انگلیسی (کد ملی و موبایل را کاربر ممکن است با کیبورد فارسی بزند) */
export const toEnDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
