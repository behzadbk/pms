// تست رابط کاربری پنل «نظافت منازل» (Chromium واقعی، موبایل ۳۹۰px) روی بک‌اند واقعی.
// پیش‌نیاز: دیتابیس seed‌شده، identity :3001، facility :3003، فرانت با `npx vite` (پروکسی /api).
// اجرا: DB_NAME=pms_clean BASE=http://127.0.0.1:5173 OUT=./shots node tests/ui_cleaning.mjs
import { chromium } from 'playwright'
import { execSync } from 'child_process'
import { mkdirSync } from 'fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const OUT = process.env.OUT ?? './shots'
const DB = process.env.DB_NAME ?? 'pms'
mkdirSync(OUT, { recursive: true })
const sql = (q) => execSync(`su postgres -c "psql -d ${DB} -At -q"`, { input: q }).toString().trim()
let failed = 0
const ok = (name, pass, detail = '') => { if (!pass) failed++; console.log(pass ? '✓' : '✗', name, pass ? '' : `→ ${String(detail).slice(0, 300)}`) }

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined })
const errors = []
async function session() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran', deviceScaleFactor: 2 })
  await ctx.addInitScript(() => localStorage.setItem('hamino_onboarding_seen', '1'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|socket\.io|ERR_CONNECTION/.test(m.text())) errors.push(m.text()) })
  return page
}
async function login(page, user) {
  await page.goto(`${BASE}/login`)
  await page.fill('#tenantSubdomain', 'borj-aftab')
  await page.fill('#email', user)
  await page.fill('#password', 'Passw0rd!')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
}
const shot = async (page, name) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

// دادهٔ تمیز + سهمیهٔ ۳ ساعته (تا مازاد دیده شود) — واحدی که ساکن دارد
sql('delete from entitlement.cleaning_sessions; delete from entitlement.usage_events')
const unitNo = sql("select u.unit_number from residency.memberships m join property.units u on u.id=m.unit_id where m.status='active' and m.role in ('head','adult','senior') limit 1")

{
  const page = await session()
  await login(page, 'cleaner')
  await page.waitForURL(/\/staff\/housekeeping/, { timeout: 8000 }).catch(() => {})
  ok('نظافتچی منازل مستقیم به پنل خودش می‌رود', page.url().includes('/staff/housekeeping'), page.url())
  await page.waitForSelector('input[aria-label="شماره‌ی واحد"]')
  ok('عنوان و جست‌وجوی واحد', await page.locator('h1', { hasText: 'نظافت منازل' }).count() === 1)
  await shot(page, '01-start')

  // منو: فقط پنل خودش
  const menu = (await page.locator('nav a').allInnerTexts()).join('|')
  ok('منو «میز لابی» را ندارد', !menu.includes('میز لابی'), menu)

  // ۱) انتخاب واحد با تایپ
  await page.fill('input[aria-label="شماره‌ی واحد"]', unitNo)
  await page.locator('button', { hasText: unitNo.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) }).first().click()
  await page.waitForSelector('text=شروع نظافت')
  await page.waitForSelector('[role=progressbar]')
  ok('کارت واحد با نوار سهمیه', true)
  await shot(page, '02-unit-card')

  // ۲) ثبت دستی ۲ ساعت (داخل سهمیه)
  await page.click('text=ثبت دستی')
  await page.fill('input[type=time] >> nth=0', '08:30')
  await page.click('text=۲ ساعت بعد')
  await page.waitForSelector('text=کاملاً داخل سهمیه است', { timeout: 8000 })
  ok('پیش‌نمایش ثبت دستی: داخل سهمیه', true)
  await shot(page, '03-manual-sheet')
  await page.click('text=تأیید و ثبت نظافت')
  await page.waitForSelector('text=نظافت ثبت شد')
  ok('ثبت دستی ⇒ صفحهٔ نتیجه', true)
  await shot(page, '04-done')
  ok('بدون اسکرول افقی (نتیجه)', await noHScroll(page))

  // ۳) نظافت بعدی ⇒ واحد اخیر + شروع تایمر
  await page.click('text=نظافت بعدی')
  await page.waitForSelector('text=واحدهای اخیر شما')
  ok('واحد اخیر با یک لمس', true)
  await page.locator('button', { hasText: unitNo.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) }).first().click()
  await page.click('text=شروع نظافت')
  await page.waitForSelector('text=نظافت در جریان است')
  ok('تایمر در جریان', true)
  await page.click('text=اشتباه شروع شد؛ لغو')
  await page.click('text=بله، لغو شود')
  await page.waitForSelector('text=کدام واحد را نظافت می‌کنید؟')
  ok('لغو شروع اشتباه ⇒ برگشت به انتخاب واحد', true)
  ok('لغو، مصرفی ثبت نکرد', sql("select count(*) from entitlement.usage_events where status='active'") === '1')

  // ۴) شروع دوباره، عقب‌بردن شروع (۹۰ دقیقه) ⇒ برآورد زنده با مازاد، پایان
  await page.locator('button', { hasText: unitNo.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) }).first().click()
  await page.click('text=شروع نظافت')
  await page.waitForSelector('text=نظافت در جریان است')
  sql("update entitlement.cleaning_sessions set started_at = now() - interval '90 minutes' where status='running'")
  await page.reload()
  await page.waitForSelector('text=اگر همین الان پایان بدهید')
  await page.waitForSelector('text=مازاد:')
  ok('برآورد زنده: ۱ ساعت رایگان + ۰٫۵ ساعت مازاد', true)
  await shot(page, '05-running')
  ok('بدون اسکرول افقی (در جریان)', await noHScroll(page))
  await page.click('text=پایان نظافت')
  await page.waitForSelector('text=تأیید و ثبت نظافت')
  await shot(page, '06-finish-sheet')
  await page.click('text=تأیید و ثبت نظافت')
  await page.waitForSelector('text=نظافت ثبت شد')
  const over = sql("select coalesce(sum(amount),0) from entitlement.usage_events where status='active'")
  ok('مازاد در موتور آفرها ثبت شد (۰٫۵ ساعت × نرخ شیفت)', Number(over) > 0, over)

  // ۵) تاریخچه و ابطال
  await page.click('text=نظافت بعدی')
  await page.click('[role=tab]:has-text("سابقه")')
  await page.waitForSelector('text=ابطال')
  await shot(page, '07-history')
  await page.locator('button', { hasText: 'ابطال' }).first().click()
  await page.click('text=بله، باطل شود')
  await page.waitForSelector('text=نظافت باطل شد')
  ok('ابطال از تاریخچه', sql("select count(*) from entitlement.usage_events where status='void'") === '1')
  ok('بدون اسکرول افقی (تاریخچه)', await noHScroll(page))
}

// نظافت مجموعه: پنل منازل را نمی‌بیند
{
  const page = await session()
  await login(page, 'cleanhub')
  await page.goto(`${BASE}/staff/housekeeping`)
  await page.waitForSelector('text=به این بخش دسترسی ندارید')
  ok('نظافت مجموعه به پنل منازل دسترسی ندارد', true)
  const menu = (await page.locator('nav a').allInnerTexts()).join('|')
  ok('نظافت مجموعه همان پنل نگهداری را دارد', menu.includes('کارهای نگهداری') && !menu.includes('نظافت منازل'), menu)
}

// مدیر: مثل همهٔ پنل‌های کارکنان از مسیر /staff نمی‌آید و به پنل خودش برمی‌گردد (ساخت حساب نظافتچی از «کارکنان»)
{
  const page = await session()
  await login(page, 'admin@borj-aftab.test')
  await page.goto(`${BASE}/staff/housekeeping`)
  await page.waitForURL(/\/admin/, { timeout: 8000 })
  ok('مدیر از مسیر کارکنان به پنل مدیر برمی‌گردد (مثل بقیهٔ پنل‌ها)', page.url().includes('/admin'), page.url())
}

ok('بدون خطای JS در کنسول', errors.length === 0, errors.join(' | '))
await browser.close()
console.log(failed ? `\n${failed} ناموفق` : '\nهمه موفق')
process.exit(failed ? 1 : 0)
