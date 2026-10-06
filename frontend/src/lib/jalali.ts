/**
 * تبدیل تاریخ شمسی ↔ میلادی (الگوریتم jalaali-js، بدون وابستگی).
 * کپی یکسان در backend/identity-service/src/residents/jalali.ts — تغییر یکی بدون دیگری ممنوع.
 */
// نقاط شکست الگوریتم jalaali-js: سال‌هایی که الگوی کبیسه‌ی ۳۳ ساله «جابه‌جا» می‌شود. بازه‌ی معتبر الگوریتم از اولین تا
// آخرین عنصر است (سال شمسی −۶۱ تا ۳۱۷۷)؛ خارج از آن jalCal خطا می‌دهد.
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
const div = (a: number, b: number) => ~~(a / b)
const mod = (a: number, b: number) => a - ~~(a / b) * b

// برای یک سال شمسی سه چیز برمی‌گرداند: leap (فاصله از آخرین سال کبیسه؛ ۰ یعنی همین سال کبیسه است)،
// gy (سال میلادی که ۱ فروردین در آن می‌افتد) و march (روزِ ماه مارس که ۱ فروردین آن سال است).
function jalCal(jy: number) {
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0
  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]) throw new Error('سال شمسی خارج از محدوده است')
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

// محور تبدیل‌ها «شماره‌ی روز ژولیانی» (JDN) است: g2d میلادی→JDN و d2g برعکس؛ j2d/d2j همین کار را برای شمسی
// با کمک jalCal می‌کنند. پس شمسی→میلادی = d2g(j2d(...)) و میلادی→شمسی = d2j(g2d(...)).
function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  // k = فاصله‌ی روز از ۱ فروردین. k ≤ ۱۸۵ یعنی ۶ ماه اولِ ۳۱روزه (۶×۳۱ = ۱۸۶ روز)؛ بعد از آن ماه‌های ۳۰روزه (۷ تا ۱۲).
  // k منفی یعنی تاریخ هنوز در سال شمسیِ قبل است؛ ۱۷۹ (و یکی بیشتر اگر آن سال کبیسه بود) = طول سال قبل منهای ۱۸۶ روز.
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 }
}

export function toJalali(gy: number, gm: number, gd: number) {
  return d2j(g2d(gy, gm, gd))
}

export function toGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd))
}

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
const latinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

/** «2026-09-23» → «۱ مهر ۱۴۰۵» */
export function formatJalali(iso: string | Date | null | undefined, withYear = true): string {
  if (!iso) return ''
  const s = typeof iso === 'string' ? iso.slice(0, 10) : iso.toISOString().slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return ''
  const j = toJalali(y, m, d)
  return faDigits(`${j.jd} ${JALALI_MONTHS[j.jm - 1]}${withYear ? ' ' + j.jy : ''}`)
}

/**
 * ورودی آزاد کاربر → ISO میلادی. می‌پذیرد: «۱ مهر ۱۴۰۵»، «۱۴۰۵/۷/۱»، «1405-07-01»، و ISO میلادی.
 * اگر قابل فهم نبود null.
 */
export function parseDateInput(input: string | null | undefined): string | null {
  if (!input) return null
  const s = latinDigits(String(input)).trim()
  if (!s) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (g: { gy: number; gm: number; gd: number }) => `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`
  // اعتبارسنجی ساده: سال ۱۳۰۰–۱۵۰۰، ماه ۱–۱۲، روز تا ۳۱ (شش ماه اول) یا ۳۰. توجه: «۳۰ اسفند» در سالِ غیرکبیسه هم
  // پذیرفته می‌شود و (چون toGregorian از ابتدای سال می‌شمارد) به ۱ فروردین سال بعد تبدیل می‌شود.
  const valid = (jy: number, jm: number, jd: number) =>
    jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= (jm <= 6 ? 31 : 30)

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (a >= 1900) return `${a}-${pad(b)}-${pad(c)}` // خودش میلادی است
    return valid(a, b, c) ? iso(toGregorian(a, b, c)) : null
  }
  m = s.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/)
  if (m) {
    const jm = JALALI_MONTHS.indexOf(m[2]) + 1
    const [jd, jy] = [Number(m[1]), Number(m[3])]
    return jm > 0 && valid(jy, jm, jd) ? iso(toGregorian(jy, jm, jd)) : null
  }
  m = s.match(/^(\d{4})$/) // فقط سال (مثلاً «تاریخ خرید / مالکیت: ۱۴۰۲»)
  if (m) {
    const jy = Number(m[1])
    return jy >= 1300 && jy <= 1500 ? iso(toGregorian(jy, 1, 1)) : null
  }
  return null
}

/** امروز به تقویم شمسی، به‌صورت «۱ مهر ۱۴۰۵» */
export function todayJalali(): string {
  return formatJalali(new Date().toISOString().slice(0, 10))
}

/** تاریخ و ساعت شمسی برای نمایش (مثلاً «آخرین ورود»)؛ مقدار خالی/نامعتبر → «—» یا خود رشته */
export function faDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('fa-IR')} · ${d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`
}
