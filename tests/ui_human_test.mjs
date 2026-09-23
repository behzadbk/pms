// تست «انسانی» رابط کاربری با مرورگر واقعی (Chromium) روی build تولیدی (vite preview)
// هر گام مثل یک کاربر واقعی: تایپ، کلیک، رفرش، دست‌کاری آدرس‌بار؛ از هر گام اسکرین‌شات گرفته می‌شود.
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://localhost:4173'
const OUT = process.env.OUT ?? './shots'
const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(pass ? '✓' : '✗', name, pass ? '' : `→ ${detail}`) }
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined })

async function session(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'fa-IR' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|socket\.io/.test(m.text())) errors.push(m.text()) })
  return { ctx, page, errors }
}
async function tenantLogin(page, email, pass = 'Passw0rd!', sub = 'borj-aftab') {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=text]', sub)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', pass)
  await page.click('button[type=submit]')
}
const wait = (p, re) => p.waitForURL(re, { timeout: 8000 }).then(() => true).catch(() => false)

// ── ۱. هر نقش بعد از ورود به خانه‌ی خودش می‌رود
for (const [role, home] of [['admin', /\/admin$/], ['resident', /\/resident$/], ['guard', /\/guard$/], ['staff', /\/staff$/]]) {
  const { ctx, page, errors } = await session({ width: 1366, height: 820 })
  await tenantLogin(page, `${role}@borj-aftab.test`)
  const landed = await wait(page, home)
  ok(`ورود ${role} و رسیدن به خانه‌ی نقش`, landed, page.url())
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/01-${role}-home.png` })
  if (role === 'resident') {
    await page.goto(`${BASE}/admin/charges`)
    const blocked = await wait(page, /\/resident$/)
    ok('ساکن با تایپ /admin/charges در آدرس‌بار به پنل مدیریت راه پیدا نمی‌کند', blocked, page.url())
    const switcher = await page.getByText('برج مدیریت', { exact: false }).count()
    await page.goto(`${BASE}/resident/charges`); await page.reload()
    ok('رفرش صفحه روی /resident/charges همان صفحه می‌ماند (لینک مستقیم)', await wait(page, /\/resident\/charges$/), page.url())
    await page.screenshot({ path: `${OUT}/02-resident-deeplink.png` })
  }
  ok(`بدون خطای JavaScript در صفحه‌ی ${role}`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ── ۲. رمز اشتباه → پیام خطا، ماندن در صفحه
{
  const { ctx, page } = await session({ width: 390, height: 844 })
  await tenantLogin(page, 'admin@borj-aftab.test', 'wrong-password')
  await page.waitForTimeout(1200)
  const stay = page.url().endsWith('/login')
  const msg = await page.locator('text=/نادرست|نامعتبر|خطا/').count()
  ok('رمز اشتباه: در صفحه‌ی ورود می‌ماند و پیام خطا نشان داده می‌شود', stay && msg > 0, `url=${page.url()} msg=${msg}`)
  await page.screenshot({ path: `${OUT}/03-wrong-password-mobile.png` })
  await ctx.close()
}

// ── ۳. سوپرادمین: ساخت ساختمان با مدیر اولیه → ورود همان مدیر
const sub = 'ui' + Math.random().toString(36).slice(2, 8)
{
  const { ctx, page, errors } = await session({ width: 1366, height: 900 })
  await page.goto(`${BASE}/super-admin/login`)
  await page.fill('input[type=text]', 'behzad')
  await page.fill('input[type=password]', '1234')
  await page.click('button[type=submit]')
  ok('ورود سوپرادمین → لیست ساختمان‌ها', await wait(page, /super-admin\/buildings/), page.url())
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/04-superadmin-buildings.png` })
  await page.getByRole('button', { name: /ساختمان جدید|تعریف|جدید/ }).first().click()
  await page.waitForTimeout(500)
  const dlg = page.locator('form').last()
  const inputs = dlg.locator('input:not([type=radio]):not([type=hidden])')
  await dlg.getByLabel(/نام پروژه/).fill('برج تست رابط کاربری').catch(async () => inputs.nth(0).fill('برج تست رابط کاربری'))
  await dlg.getByLabel(/subdomain/).fill(sub).catch(async () => inputs.nth(1).fill(sub))
  await dlg.getByLabel(/تعداد واحد/).fill('24').catch(async () => inputs.nth(2).fill('24'))
  await dlg.getByLabel(/ایمیل ورود مدیر/).fill(`boss@${sub}.test`)
  await dlg.getByLabel(/رمز اولیه/).fill('UiTest1234')
  await page.screenshot({ path: `${OUT}/05-new-building-dialog.png`, fullPage: true })
  await dlg.locator('button[type=submit]').click()
  await page.waitForTimeout(1500)
  const listed = await page.getByText('برج تست رابط کاربری').count()
  ok('ساختمان جدید بعد از ثبت در لیست دیده می‌شود', listed > 0, `count=${listed}`)
  await page.screenshot({ path: `${OUT}/06-building-created.png` })
  await page.goto(`${BASE}/admin`)
  ok('سوپرادمین با /admin به پنل ساختمان نمی‌رود', await wait(page, /super-admin\/buildings/), page.url())
  ok('بدون خطای JavaScript در پنل سوپرادمین', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await session({ width: 390, height: 844 })
  await tenantLogin(page, `boss@${sub}.test`, 'UiTest1234', sub)
  ok('مدیر مجتمع تازه‌ساخته از موبایل وارد پنل خودش می‌شود', await wait(page, /\/admin$/), page.url())
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/07-new-admin-mobile.png` })
  // خروج و بازگشت: نشست باید پاک شود
  await page.evaluate(() => { localStorage.clear() })
  await page.goto(`${BASE}/admin`)
  ok('بعد از پاک شدن نشست، مسیر محافظت‌شده به صفحه‌ی ورود برمی‌گردد', await wait(page, /\/login$/), page.url())
  await ctx.close()
}
await browser.close()
const p = results.filter((r) => r.pass).length
console.log(`\nنتیجه: ${p} قبول / ${results.length - p} رد`)
import('fs').then((fs) => fs.writeFileSync(`${OUT}/ui-results.json`, JSON.stringify(results, null, 1)))
