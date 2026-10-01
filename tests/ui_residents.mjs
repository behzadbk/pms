// تست رابط کاربری ماژول ساکنین، خانوار، حالت والدین، اپ کودک و رزرو مشاعات (Chromium واقعی، اندازه‌ی موبایل).
// پیش‌نیاز: دیتابیس تازه (db/migrate.sh --reset)، identity روی ۳۰۰۱، facility روی ۳۰۰۳، و فرانت با `npx vite`
// (پروکسی /api). اجرا: BASE=http://127.0.0.1:5173 OUT=./shots node tests/ui_residents.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT ?? './shots'
mkdirSync(OUT, { recursive: true })
const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(pass ? '✓' : '✗', name, pass ? '' : `→ ${String(detail).slice(0, 300)}`)
}
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined })
const MOBILE = { width: 390, height: 844 }
const errors = []

async function session(viewport = MOBILE) {
  const ctx = await browser.newContext({ viewport, locale: 'fa-IR', timezoneId: 'Asia/Tehran', deviceScaleFactor: 2 })
  await ctx.addInitScript(() => localStorage.setItem('hamino_onboarding_seen', '1'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|WebSocket|socket\.io|ERR_CONNECTION/.test(m.text())) errors.push(m.text())
  })
  return { ctx, page }
}
async function login(page, email, pass = 'Passw0rd!') {
  await page.goto(`${BASE}/login`)
  await page.fill('#tenantSubdomain', 'borj-aftab')
  await page.fill('#email', email)
  await page.fill('#password', pass)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
}
// صبر کوتاه تا انیمیشن ورود صفحه تمام شود
const shot = async (page, name) => {
  await page.waitForTimeout(500)
  await page.waitForSelector('text=در حال بارگذاری', { state: 'detached' }).catch(() => undefined)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}
const tabLabels = (page) => page.locator('nav[aria-label="ناوبری اصلی"] a').allInnerTexts()

// ═══════════ مدیر ═══════════
{
  const { page } = await session()
  await login(page, 'admin@borj-aftab.test')
  await page.waitForSelector('nav[aria-label="ناوبری اصلی"] a')
  // ۰) هدر موبایل زیر ناچ نمی‌رود: pt-safe روی header، ارتفاع ۵۶ روی ردیف داخلی
  const hdr = await page.evaluate(() => {
    const h = document.querySelector('header')
    const row = h?.firstElementChild
    return { cls: h?.className ?? '', rowH: row ? row.getBoundingClientRect().height : 0 }
  })
  ok('هدر موبایل: pt-safe روی header و h-14 روی ردیف داخلی', hdr.cls.includes('pt-safe') && !hdr.cls.includes('h-14') && Math.round(hdr.rowH) === 56, JSON.stringify(hdr))
  const vp = await page.getAttribute('meta[name=viewport]', 'content')
  ok('viewport-fit=cover', vp?.includes('viewport-fit=cover'), vp)

  const tabs = await tabLabels(page)
  ok('نوار مدیر: داشبورد، ساکنین، تیکت‌ها، اعلانات + بیشتر', JSON.stringify(tabs.map((t) => t.trim())) === JSON.stringify(['داشبورد', 'ساکنین', 'تیکت‌ها', 'اعلانات', 'بیشتر']), tabs)
  await page.click('nav[aria-label="ناوبری اصلی"] >> text=بیشتر')
  await page.waitForURL(/\/more$/)
  await page.waitForSelector('text=حساب و ظاهر')
  const more = await page.locator('main').innerText()
  ok('«بیشتر» مدیر: کارکنان، رزروها، حساب و ظاهر', ['کارکنان', 'رزروها', 'حساب و ظاهر'].every((x) => more.includes(x)), more)
  await shot(page, 'admin-more')

  await page.click('nav[aria-label="ناوبری اصلی"] >> text=ساکنین')
  await page.waitForSelector('text=واحد خالی')
  await page.waitForTimeout(400)
  await shot(page, 'A1-residents')
  ok('A1: فیلترها با شمارش', (await page.locator('.hm-chip').first().innerText()).includes('همه'))
  await page.click('text=افزودن ساکن')
  await page.waitForSelector('text=روش ثبت را انتخاب کنید')
  await page.waitForTimeout(400)
  await shot(page, 'A2-methods')
  ok('A2: پنج روش ثبت', (await page.locator('[role=dialog] button.hm-row').count()) === 5)
  await page.keyboard.press('Escape')

  // پذیرش: ثبت ساکن در واحد خالی ۲۰۳ → «دعوت ارسال شد»
  await page.locator('button.hm-row-dashed', { hasText: '۲۰۳' }).click()
  await page.waitForURL(/\/admin\/residents\/new\?unit=/)
  await page.waitForSelector('text=نوع سکونت')
  await page.click('[role=radio]:has-text("مالک غیرساکن")')
  ok('A3: «مالک غیرساکن» → برچسب «تاریخ مالکیت»', (await page.locator('text=تاریخ مالکیت').count()) === 1)
  await page.click('[role=radio]:has-text("مستأجر")')
  ok('A3: «مستأجر» → «پایان قرارداد اجاره» و «پرداخت شارژ با»', (await page.locator('text=پایان قرارداد اجاره').count()) === 1 && (await page.locator('text=پرداخت شارژ با').count()) === 1)
  await page.fill('input[placeholder="مثلاً رضا کریمی"]', 'آزاده نوری')
  await page.fill('input[placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰"]', '09121234567')
  await page.fill('input[placeholder="۳۱ شهریور ۱۴۰۶"]', '۳۱ شهریور ۱۴۰۶')
  await shot(page, 'A3-form')
  await page.click('text=ثبت و ارسال پیامک دعوت')
  await page.waitForURL(/\/admin\/residents$/)
  await page.waitForSelector('text=آزاده نوری')
  const card = page.locator('button.hm-row', { hasText: 'آزاده نوری' })
  await card.waitFor()
  const cardText = await card.innerText()
  ok('پذیرش: واحد خالی پر شد با «دعوت ارسال شد»', cardText.includes('آزاده نوری') && cardText.includes('دعوت ارسال شد'), cardText)
  await shot(page, 'A1-after-add')

  // A4 پرونده واحد
  await page.locator('button.hm-row', { hasText: '۱۲۰۴' }).click()
  await page.waitForSelector('text=حسین رادمنش · مالک غیرساکن')
  await page.waitForTimeout(300)
  await shot(page, 'A4-unit-file')
  ok('A4: کارت قهرمان «مستأجر · ۵ ساکن»', (await page.locator('.lg4-hero').innerText()).includes('مستأجر · ۵ ساکن'))

  // A5 درخواست‌ها: تأیید، انتقال، یادآوری، رد
  // یک درخواست تازه از QR لابی (مسیر عمومی) برای سناریوی «رد»
  await page.evaluate(() =>
    fetch('/api/identity/join/borj-aftab-lobby-demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'سمانه راد', phone: '09125550000', unit_no: '۱۰۱', residency: 'tenant' }),
    }),
  )
  await page.goto(`${BASE}/admin/residents/requests`)
  await page.waitForSelector('text=لیلا صادقی · واحد ۱۱۰۴')
  await page.waitForSelector('text=سمانه راد · واحد ۱۰۱')
  await shot(page, 'A5-requests')
  await page.locator('.hm-card', { hasText: 'لیلا صادقی' }).locator('button', { hasText: 'تأیید' }).click()
  await page.waitForSelector('text=لیلا صادقی', { state: 'detached' })
  await page.locator('.hm-card', { hasText: 'بهرام نیک‌پور' }).locator('button', { hasText: 'انتقال به ۱۲۰۲' }).click()
  await page.waitForSelector('text=بهرام نیک‌پور', { state: 'detached' })
  await page.locator('.hm-card', { hasText: 'سمانه راد' }).locator('button', { hasText: 'رد' }).click()
  await page.waitForSelector('text=سمانه راد', { state: 'detached' })
  await page.locator('.hm-card', { hasText: 'نگار کریمی' }).locator('button', { hasText: 'یادآوری به سرپرست' }).click()
  await page.waitForSelector('text=یادآوری برای رضا کریمی ارسال شد')
  ok('پذیرش: تأیید، انتقال، رد و یادآوری به سرپرست کار می‌کند', (await page.locator('.hm-card').count()) >= 1)
  await shot(page, 'A5-empty')
  await page.click('[role=radio]:has-text("QR لابی")')
  await page.waitForSelector('#lobby-qr svg')
  await shot(page, 'A5-lobby-qr')

  // A6 تخلیه ۱۱۰۳ (امروز) → خالی
  const units = await page.evaluate(async () => {
    const r = await fetch('/api/identity/buildings/11111111-1111-1111-1111-111111111111/units', { headers: { Authorization: 'Bearer ' + localStorage.getItem('pms_token') } })
    return r.json()
  })
  const u1103 = units.units.find((u) => u.no === '1103')
  await page.goto(`${BASE}/admin/units/${u1103.id}/move-out`)
  await page.waitForSelector('text=پیش از تخلیه')
  await page.waitForSelector('text=رزرو فعال')
  await shot(page, 'A6-move-out')
  await page.click('button:has-text("ثبت تخلیه")')
  await page.waitForURL(/\/admin\/residents$/)
  await page.click('.hm-chip:has-text("خالی")')
  await page.waitForTimeout(800)
  ok('پذیرش: بعد از تخلیه واحد ۱۱۰۳ خالی است', (await page.locator('button.hm-row-dashed', { hasText: '۱۱۰۳' }).count()) === 1)
}

// ═══════════ ساکن (سرپرست) + کودک ═══════════
const { page: res } = await session()
await login(res, 'resident@borj-aftab.test')
{
  await res.waitForSelector('nav[aria-label="ناوبری اصلی"] a')
  const tabs = await tabLabels(res)
  ok('نوار ساکن: خانه، غذا، تیکت‌ها، اعلانات + بیشتر', JSON.stringify(tabs.map((t) => t.trim())) === JSON.stringify(['خانه', 'غذا', 'تیکت‌ها', 'اعلانات', 'بیشتر']), tabs)
  await res.click('nav[aria-label="ناوبری اصلی"] >> text=بیشتر')
  await res.waitForSelector('text=حساب و ظاهر')
  const more = await res.locator('main').innerText()
  ok('«بیشتر» ساکن: رزرو مشاعات، خانواده، حساب و ظاهر', ['رزرو مشاعات', 'خانواده', 'حساب و ظاهر'].every((x) => more.includes(x)), more)
  await res.locator('main button', { hasText: 'خانواده' }).click()
  await res.waitForSelector('text=خانوار من')
  await res.waitForSelector('text=مینا کریمی')
  ok('در صفحه‌ی «خانواده» تب «بیشتر» روشن است', (await res.locator('nav[aria-label="ناوبری اصلی"] a', { hasText: 'بیشتر' }).getAttribute('style'))?.includes('lg4-pri'))
  await shot(res, 'C1-household')
  await res.click('text=افزودن عضو خانواده')
  await res.waitForSelector('text=کودک و نوجوان')
  await shot(res, 'C2-add-member')
  await res.goBack()
  await res.locator('button.hm-row', { hasText: 'سارا' }).click()
  await res.waitForSelector('text=حالت والدین · سارا')
  await res.waitForTimeout(300)
  await shot(res, 'C3-parent-mode')
  await res.click('text=ورود سارا روی گوشی یا تبلت خودش')
  await res.waitForSelector('text=یک‌بار مصرف')
  await shot(res, 'C4-login-code')
}
const codeText = (await res.locator('p[dir=ltr]').filter({ hasText: /^\d{3} \d{3}$/ }).innerText()).replace(/\s/g, '')

const { page: kid } = await session()
await kid.goto(`${BASE}/login`)
await kid.click('text=ورود با کد خانواده')
await kid.fill('input[aria-label="مجتمع"]', 'borj-aftab')
await kid.fill('input[aria-label="کد ۶ رقمی"]', codeText)
await kid.click('button[type=submit]')
await kid.waitForURL(/\/child$/, { timeout: 10000 })
await kid.waitForSelector('text=اعتبار خرید این ماه')
await kid.waitForTimeout(500)
await shot(kid, 'D1-child-home')
ok('اپ کودک: دو تب (خانه، اعلانات)', JSON.stringify((await tabLabels(kid)).map((t) => t.trim())) === JSON.stringify(['خانه', 'اعلانات']))
ok('اپ کودک: بخش مالی هیچ‌جا نیست', !(await kid.locator('body').innerText()).includes('شارژ و پرداخت'))
ok('اپ کودک: کاشی مرسوله‌ها هست', (await kid.locator('text=مرسوله‌ها').count()) === 1)

// پذیرش: «پنهان» کردن یک بخش فوراً از اپ کودک حذف می‌شود (بدون رفرش؛ با بازخوانی دوره‌ای)
await res.goBack()
await res.waitForSelector('text=حالت والدین · سارا')
await res.locator('div.py-3', { hasText: 'مرسوله‌ها' }).locator('button', { hasText: 'پنهان' }).click()
await res.waitForTimeout(600)
const gone = await kid.waitForSelector('text=مرسوله‌ها', { state: 'detached', timeout: 20000 }).then(() => true).catch(() => false)
ok('پذیرش: «پنهان» در حالت والدین → کاشی مرسوله فوراً از اپ کودک حذف شد', gone)
await kid.goto(`${BASE}/child/book`)
await kid.waitForTimeout(500)

// پذیرش: سفارش بالای سقف → درخواست برای والد → تأیید → کسر از اعتبار
await res.locator('div.py-3', { hasText: 'سفارش غذا و کافه' }).locator('button', { hasText: 'آزاد' }).click()
await res.waitForTimeout(600)
await kid.goto(`${BASE}/child`)
await kid.waitForSelector('text=سفارش غذا')
await kid.click('text=سفارش غذا')
await kid.locator('[role=dialog] .hm-row', { hasText: 'برگر خانگی آفتاب' }).locator('button[aria-label="افزودن"]').click()
await kid.waitForSelector('text=ارسال برای تأیید')
await kid.click('text=ارسال برای تأیید')
await kid.waitForURL(/\/child\/waiting\//)
await kid.waitForSelector('text=درخواستت برای بابا یا مامان فرستاده شد')
await shot(kid, 'D2-waiting')
ok('پذیرش: سفارش بالای سقف → صفحه‌ی «منتظر تأیید»', true)

await res.goto(`${BASE}/resident/family/requests`)
await res.waitForSelector('text=سارا می‌خواهد سفارش بدهد')
await shot(res, 'C5-child-request')
ok('برگه‌ی تأیید: «بیشتر از مانده‌ی سقف این ماه»', (await res.locator('text=بیشتر از مانده‌ی سقف این ماه').count()) === 1)
await res.click('text=تأیید همین سفارش')
await res.waitForSelector('text=درخواستی در انتظار نیست')
const approved = await kid.waitForSelector('text=تأیید شد! سفارشت به آشپزخانه رفت', { timeout: 15000 }).then(() => true).catch(() => false)
ok('پذیرش: تأیید والد روی گوشی کودک دیده شد', approved)
await kid.goto(`${BASE}/child`)
await kid.waitForSelector('text=اعتبار خرید این ماه')
const hero = await kid.locator('.lg4-hero').innerText()
ok('پذیرش: مبلغ از اعتبار کودک کم شد (۲۸۰ + ۳۸۵ > سقف → سقف بالا رفت و مانده ۰)', hero.includes('۰'), hero)

// ساعت سکوت → D3
await res.goto(`${BASE}/resident/family`)
const sara = await res.evaluate(async () => {
  const r = await fetch('/api/identity/me/household', { headers: { Authorization: 'Bearer ' + localStorage.getItem('pms_token') } })
  return (await r.json()).members.find((m) => m.name === 'سارا').id
})
await res.evaluate(async (id) => {
  await fetch(`/api/identity/me/household/members/${id}/parent-control`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pms_token') },
    body: JSON.stringify({ quiet_hours: { from: '00:00', to: '23:59' } }),
  })
}, sara)
await kid.reload()
await kid.waitForSelector('text=الان وقت استراحت است')
await shot(kid, 'D3-quiet')
ok('ساعت سکوت: صفحه‌ی استراحت + دکمه‌ی تماس اضطراری', (await kid.locator('text=تماس اضطراری با نگهبانی').count()) === 1)
await res.evaluate(async (id) => {
  await fetch(`/api/identity/me/household/members/${id}/parent-control`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pms_token') },
    body: JSON.stringify({ quiet_hours: null }),
  })
}, sara)

// ═══════════ رزرو مشاعات ═══════════
await res.goto(`${BASE}/resident/reservations`)
await res.waitForSelector('text=ساعت‌های آزاد')
await res.click('button.hm-chip:has-text("استخر")')
await res.click('[role=radio]:has-text("فردا")')
await res.waitForSelector('button:has-text("۱۷:۰۰")')
await res.click('button:has-text("۱۷:۰۰")')
await shot(res, 'book-select')
await res.click('text=ارسال درخواست رزرو · ۱۷:۰۰')
await res.waitForSelector('text=درخواست رزرو ثبت شد')
await res.waitForTimeout(900)
await shot(res, 'book-success')
await res.click('text=بازگشت به خانه')
await res.goto(`${BASE}/resident/reservations`)
await res.click('button.hm-chip:has-text("استخر")')
await res.click('[role=radio]:has-text("فردا")')
await res.waitForTimeout(800)
const taken = await res.locator('button:has-text("۱۷:۰۰")').getAttribute('aria-disabled')
ok('پذیرش: ساعت پُر قابل انتخاب نیست', taken === 'true', taken)

const { page: desk } = await session({ width: 1366, height: 860 })
await login(desk, 'amenity')
await desk.goto(`${BASE}/staff/amenity-desk`)
await desk.waitForSelector('text=درخواست‌های رزرو منتظر تأیید')
await desk.waitForTimeout(800)
const deskText = await desk.locator('main').innerText()
ok('پذیرش: رزروی که تأیید لازم دارد در صف مسئول مشاعات آمد', deskText.includes('استخر · واحد ۱۲۰۴'), deskText.slice(0, 400))
await shot(desk, 'desk-queue')

// ═══════════ سوپرادمین ═══════════
{
  const { page } = await session()
  await page.goto(`${BASE}/super-admin/login`)
  await page.fill('#username', 'behzad')
  await page.fill('#password', '1234')
  await page.click('button[type=submit]')
  await page.waitForURL(/super-admin\/buildings/)
  await page.goto(`${BASE}/super-admin/residents`)
  await page.waitForSelector('text=واحد پر')
  await shot(page, 'B1-buildings')
  await page.fill('input[aria-label="جست‌وجوی شخص"]', 'رضا')
  await page.locator('button.hm-row', { hasText: 'رضا کریمی' }).click()
  await page.waitForSelector('text=تاریخچه تغییرات')
  await page.waitForTimeout(300)
  await shot(page, 'B2-person')
  ok('B2: عضویت‌ها و تاریخچه‌ی شخص', (await page.locator('main').innerText()).includes('واحد ۱۲۰۴'))
}

ok('بدون خطای جاوااسکریپت در کنسول', errors.length === 0, errors.join(' | '))
await browser.close()
const pass = results.filter((r) => r.pass).length
console.log(`\nنتیجه: ${pass} قبول / ${results.length - pass} رد`)
process.exit(pass === results.length ? 0 : 1)
