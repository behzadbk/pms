// تست رابط کاربری دپارتمان نظافت (درخواست ساکن ← تابلوی مسئول ← کارهای نظافتچی) (Chromium واقعی، موبایل ۳۹۰px) روی بک‌اند واقعی.
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

const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
const api = async (path, method = 'GET', token, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return r.json()
}
const tok = async (u) => (await api('/identity/auth/login', 'POST', null, { email: u, password: 'Passw0rd!', tenantSubdomain: 'borj-aftab' })).accessToken
const CL = '/facility/entitlements/cleaning'

// دادهٔ تمیز؛ واحدی که ساکن دارد
sql('delete from entitlement.cleaning_tasks; delete from entitlement.cleaning_feedback; delete from entitlement.cleaning_sessions; delete from entitlement.usage_events')
sql("delete from notification.inbox where kind in ('cleaning_feedback','cleaning_request','cleaning_task')")
const unitNo = sql("select u.unit_number from residency.memberships m join property.units u on u.id=m.unit_id where m.status='active' and m.role in ('head','adult','senior') limit 1")
const unitId = sql("select u.id from residency.memberships m join property.units u on u.id=m.unit_id where m.status='active' and m.role in ('head','adult','senior') limit 1")
const cleanerId = sql("select id from identity.users where username='cleaner'")
const [bossT, residentT] = [await tok('cleanboss'), await tok('resident@borj-aftab.test')]

// ═══════════ ۱) ساکن درخواست می‌دهد ═══════════
{
  const page = await session()
  await login(page, 'resident@borj-aftab.test')
  await page.goto(`${BASE}/resident/offers`)
  await page.waitForSelector('button:has-text("درخواست نظافت منزل")')
  await shot(page, '01-resident-card')
  await page.click('button:has-text("درخواست نظافت منزل")')
  await page.click('button:text-is("فردا")')
  await page.click('button:text-is("صبح")')
  await page.fill('textarea[aria-label="توضیح"]', 'آشپزخانه را بیشتر')
  await shot(page, '02-resident-sheet')
  ok('بدون اسکرول افقی (فرم درخواست)', await noHScroll(page))
  await page.click('button:has-text("ارسال درخواست")')
  await page.waitForSelector('text=درخواست شما برای مسئول نظافت ارسال شد')
  await page.waitForSelector('text=در انتظار واگذاری')
  ok('درخواست ثبت شد و وضعیتش دیده می‌شود', sql("select count(*) from entitlement.cleaning_tasks where source='resident' and status='new'") === '1')
  ok('اعلان به مسئول نظافت', sql("select count(*) from notification.inbox where kind='cleaning_request' and recipient_role='perm:cleaning_supervisor'") === '1')
}

// ═══════════ ۲) مسئول نظافت: تابلو و واگذاری ═══════════
{
  const page = await session()
  await login(page, 'cleanboss')
  await page.goto(`${BASE}/staff/cleaning-board`)
  await page.waitForSelector('h1:has-text("تابلوی نظافت")')
  await page.waitForSelector('text=منتظر واگذاری')
  ok('درخواست ساکن در صف واگذاری است', await page.locator('text=درخواست ساکن').count() >= 1)
  await shot(page, '03-board-waiting')
  const menu = (await page.locator('nav a').allInnerTexts()).join('|')
  ok('منوی مسئول: تابلوی نظافت و کارهای نظافت', menu.includes('تابلوی نظافت') && menu.includes('کارهای نظافت'), menu)

  // با یک لمس به زهرا (cleaner) می‌سپارد
  await page.locator('button:has-text("زهرا نظافتچی")').first().click()
  await page.waitForSelector('text=به زهرا نظافتچی سپرده شد')
  ok('واگذاری با یک لمس', sql("select assignee_id from entitlement.cleaning_tasks where source='resident'") === cleanerId)

  // کار جدید: نظافت مشاعات (لابی) برای حسین
  await page.click('button:has-text("کار جدید")')
  await page.click('[aria-pressed]:has-text("مشاعات")')
  await page.click('button:has-text("لابی")')
  await page.locator('button:has-text("زهرا نظافتچی")').last().click()
  await shot(page, '04-new-task')
  ok('بدون اسکرول افقی (کار جدید)', await noHScroll(page))
  await page.click('button:has-text("ثبت و واگذاری")')
  await page.waitForSelector('text=کار به زهرا نظافتچی سپرده شد')
  ok('کار مشاعات ساخته و واگذار شد', sql("select count(*) from entitlement.cleaning_tasks where kind='common' and title='نظافت لابی' and status='assigned'") === '1')

  // کار منزل از روی جست‌وجوی واحد
  await page.click('button:has-text("کار جدید")')
  await page.fill('input[aria-label="شماره‌ی واحد"]', unitNo)
  await page.locator('button', { hasText: fa(unitNo) }).first().click()
  await page.click('button:has-text("ثبت کار")')
  await page.waitForSelector('text=در صف واگذاری ثبت شد')
  ok('کار منزل بدون واگذاری در صف می‌ماند', sql("select count(*) from entitlement.cleaning_tasks where kind='unit' and source='supervisor' and status='new'") === '1')
  await shot(page, '05-board-active')
  await page.click('[role=tab]:has-text("کادر")')
  await page.waitForSelector('text=کار انجام داده')
  await shot(page, '06-team')
  ok('بدون اسکرول افقی (کادر)', await noHScroll(page))
  await page.click('[role=tab]:has-text("بازخورد")')
  await page.waitForSelector('text=میانگین ۹۰ روز اخیر')
  ok('تب بازخورد داخل تابلو', true)
}

// ═══════════ ۳) نظافتچی: فقط کارهای واگذارشده ═══════════
{
  const page = await session()
  await login(page, 'cleaner')
  await page.goto(`${BASE}/staff/housekeeping`)
  await page.waitForSelector('h1:has-text("کارهای نظافت من")')
  await page.waitForSelector('[role=progressbar]')
  ok('دو کار واگذارشده (منزل + لابی)، بدون جست‌وجوی واحد', await page.locator('button:has-text("شروع")').count() >= 2 && await page.locator('input[aria-label="شماره‌ی واحد"]').count() === 0)
  await shot(page, '07-my-tasks')
  ok('بدون اسکرول افقی (فهرست کارها)', await noHScroll(page))

  // ثبت دستی ۲ ساعت روی کار منزل
  await page.locator('button:has-text("ثبت دستی")').first().click()
  await page.fill('input[type=time] >> nth=0', '08:30')
  await page.click('text=۲ ساعت بعد')
  await page.waitForSelector('text=کاملاً داخل سهمیه است', { timeout: 8000 })
  await shot(page, '08-manual')
  await page.click('text=تأیید و ثبت نظافت')
  await page.waitForSelector('text=نظافت ثبت شد')
  ok('ثبت دستی ⇒ نتیجه و کار «انجام‌شده»', sql("select count(*) from entitlement.cleaning_tasks where source='resident' and status='done'") === '1')
  await page.click('text=کار بعدی')

  // کار لابی: شروع و پایان
  await page.locator('button:has-text("شروع")').first().click()
  await page.waitForSelector('text=کار در جریان است')
  await shot(page, '09-common-running')
  await page.fill('input[placeholder^="توضیح پایان کار"]', 'تمیز شد')
  await page.click('button:has-text("پایان کار")')
  await page.waitForSelector('text=انجام‌شده‌های امروز')
  ok('کار مشاعات انجام شد (بدون مصرف/شارژ)', sql("select count(*) from entitlement.cleaning_tasks where kind='common' and status='done'") === '1' && sql("select count(*) from entitlement.usage_events where status='active'") === '1')
}

// کار منزل دوم: تایمر، برآورد زنده با مازاد، پایان، ابطال
{
  const tId = (await api(`${CL}/tasks`, 'POST', bossT, { kind: 'unit', unitId, assigneeId: cleanerId })).id
  const page = await session()
  await login(page, 'cleaner')
  await page.goto(`${BASE}/staff/housekeeping`)
  await page.locator('button:has-text("شروع")').first().click()
  await page.waitForSelector('text=نظافت در جریان است')
  sql("update entitlement.cleaning_sessions set started_at = now() - interval '90 minutes' where status='running'")
  await page.reload()
  await page.waitForSelector('text=اگر همین الان پایان بدهید')
  await page.waitForSelector('text=مازاد:')
  ok('برآورد زنده: مازاد با نرخ شیفت', true)
  await shot(page, '10-running')
  ok('بدون اسکرول افقی (در جریان)', await noHScroll(page))
  await page.click('text=پایان نظافت')
  await page.click('text=تأیید و ثبت نظافت')
  await page.waitForSelector('text=نظافت ثبت شد')
  ok('مازاد در موتور آفرها ثبت شد', Number(sql("select coalesce(sum(amount),0) from entitlement.usage_events where status='active'")) > 0)
  ok('کار هم خودکار انجام‌شده شد', sql(`select status from entitlement.cleaning_tasks where id='${tId}'`) === 'done')
  await page.click('text=کار بعدی')
  await page.click('[role=tab]:has-text("سابقه")')
  await page.waitForSelector('text=ابطال')
  await shot(page, '11-history')
  await page.locator('button', { hasText: 'ابطال' }).first().click()
  await page.click('text=بله، باطل شود')
  await page.waitForSelector('text=نظافت باطل شد')
  ok('ابطال ⇒ کار دوباره در فهرست نظافتچی', sql(`select status from entitlement.cleaning_tasks where id='${tId}'`) === 'assigned')
}

// دسترسی‌ها
{
  const page = await session()
  await login(page, 'lobby')
  await page.goto(`${BASE}/staff/housekeeping`)
  await page.waitForSelector('text=به این بخش دسترسی ندارید')
  await page.goto(`${BASE}/staff/cleaning-board`)
  await page.waitForSelector('text=به این بخش دسترسی ندارید')
  ok('لابی‌من نه کارهای نظافت را می‌بیند و نه تابلو را', true)
  const c = await session()
  await login(c, 'cleaner')
  await c.goto(`${BASE}/staff/cleaning-board`)
  await c.waitForSelector('text=به این بخش دسترسی ندارید')
  ok('نظافتچی تابلوی مسئول را نمی‌بیند', true)
  const adm = await session()
  await login(adm, 'admin@borj-aftab.test')
  await adm.goto(`${BASE}/admin/cleaning-board`)
  await adm.waitForSelector('h1:has-text("تابلوی نظافت")')
  ok('مدیر تابلو را دارد', true)
  await adm.goto(`${BASE}/admin/staff`)
  await adm.waitForSelector('text=مریم مسئول نظافت').catch(() => {})
  ok('فهرست کارکنان مسئول نظافت را نشان می‌دهد', await adm.locator('text=مریم مسئول نظافت').count() >= 1)
  await adm.locator('button[aria-label*="ویرایش"], button:has-text("ویرایش")').first().click().catch(() => {})
}

// ═══════════ بازخورد ساکن ═══════════
{
  sql('delete from entitlement.cleaning_feedback')
  sql(`delete from entitlement.cleaning_tasks where status <> 'done'`)
  sql(`delete from entitlement.cleaning_sessions where unit_id='${unitId}'`)
  const cleanerT = await tok('cleaner')
  for (const h of [9, 5]) {
    const t = await api(`${CL}/tasks`, 'POST', bossT, { kind: 'unit', unitId, assigneeId: cleanerId })
    const st = new Date(Date.now() - h * 3600_000)
    await api(`${CL}/tasks/${t.id}/manual`, 'POST', cleanerT, { startedAt: st.toISOString(), endedAt: new Date(st.getTime() + 50 * 60_000).toISOString() })
  }
  const page = await session()
  await login(page, 'resident@borj-aftab.test')
  await page.goto(`${BASE}/resident/offers`)
  await page.waitForSelector('text=نظافت منزل شما انجام شد؛ چطور بود؟')
  ok('ساکن دو نظافت در انتظار نمره می‌بیند', await page.locator('text=نظافت منزل شما انجام شد؛ چطور بود؟').count() === 2)
  await shot(page, '12-rate-cards')
  await page.locator('button[aria-label^="۵ ستاره"]').first().click()
  await page.waitForSelector('text=ممنون از نظرتان')
  ok('۵ ستاره با یک لمس', sql('select count(*) from entitlement.cleaning_feedback where rating=5') === '1')
  await page.waitForTimeout(2600)
  await page.locator('button[aria-label^="۲ ستاره"]').first().click()
  await page.waitForSelector('text=مشکل چه بود؟')
  ok('بدون دلیل دکمه‌ی ثبت غیرفعال است', await page.locator('button:has-text("ثبت نظر")').isDisabled())
  await page.click('button:has-text("تمیز نشد")')
  await page.fill('textarea[aria-label="توضیح"]', 'پنجره‌ها شسته نشد')
  await shot(page, '13-rate-low')
  await page.click('button:has-text("ثبت نظر")')
  await page.waitForSelector('text=به مسئول نظافت رسید')
  ok('نمره‌ی بد با دلیل ثبت شد', sql("select count(*) from entitlement.cleaning_feedback where rating=2 and reasons @> array['not_clean']") === '1')
  ok('اعلان برای مدیر و مسئول نظافت', sql("select count(*) from notification.inbox where kind='cleaning_feedback'") === '2')

  const boss = await session()
  await login(boss, 'cleanboss')
  await boss.goto(`${BASE}/staff/cleaning-board?tab=reviews`)
  await boss.waitForSelector('text=پنجره‌ها شسته نشد')
  await shot(boss, '14-reviews')
  ok('مسئول نظافت بازخورد ساکن را می‌بیند', true)
  ok('بدون اسکرول افقی (بازخوردها)', await noHScroll(boss))
}

ok('بدون خطای JS در کنسول', errors.length === 0, errors.join(' | '))
await browser.close()
console.log(failed ? `\n${failed} ناموفق` : '\nهمه موفق')
process.exit(failed ? 1 : 0)
