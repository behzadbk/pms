import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, MonitorSmartphone, Check, Sparkles, RotateCcw, ChevronRight, ChevronDown, KeyRound, ArrowUp, ArrowDown, Plus, X, PanelBottom } from 'lucide-react'
import { useNavSplit } from '../../lib/tabPrefs'
import { MAX_TABS } from '../../lib/nav'
import { useAuth } from '../../context/AuthContext'
import { changePassword } from '../../lib/api/identity'
import { ApiError } from '../../lib/api/client'
import { PALETTES, useTheme, type ThemeMode } from '../../context/ThemeContext'

/**
 * صفحه‌ی «شخصی‌سازی» — بخش جدید طراحی Liquid Glass نسخه ۴ (Claude Design handoff).
 * حالت نمایش (روشن/تاریک/سیستم)، رنگ‌بندی و حالت آسان (بزرگ‌نمایی + رابط ساده‌شده). برای هر نقشِ لاگین‌شده در /settings در دسترس است.
 */

/** شناسه‌ی build (تاریخ/ساعت ساخت) — برای اینکه معلوم شود سرور کدام نسخه را سرو می‌کند */
declare const __BUILD_ID__: string
const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

const MODE_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'dark', label: 'تاریک', icon: Moon },
  { id: 'system', label: 'سیستم', icon: MonitorSmartphone },
]


export function Settings() {
  const navigate = useNavigate()
  const { mode, setMode, palette, setPalette, easy, setEasy, reset } = useTheme()

  return (
    <div className="max-w-2xl mx-auto space-y-8" data-lg-easy={easy ? 'on' : 'off'}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="بازگشت"
          className="w-11 h-11 flex-none rounded-full lg4-card flex items-center justify-center text-[var(--lg-text-primary)]"
        >
          <ChevronRight size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">تنظیمات و حساب</h1>
        </div>
      </div>

      <PasswordSection />

      <TabBarSection />

      {/* پیش‌نمایش زنده */}
      <div className="lg4-card p-4">
        <div className="lg4-hero p-4">
          <p className="text-xs text-white/80">پیش‌نمایش — شارژ این ماه</p>
          <p className="text-xl font-bold mt-1">۲٬۴۵۰٬۰۰۰ تومان</p>
          <div className="flex gap-2 mt-3">
            <span className="px-4 py-2 rounded-full bg-white text-[var(--lg4-hero-b)] text-xs font-bold">پرداخت</span>
            <span className="px-4 py-2 rounded-full bg-white/20 border border-white/30 text-xs font-medium text-white">جزئیات</span>
          </div>
        </div>
      </div>

      {/* حالت نمایش */}
      <section>
        <h2 className="text-sm font-bold mb-1">حالت نمایش</h2>
        <div className="grid grid-cols-3 gap-3">
          {MODE_OPTIONS.map((m) => {
            const active = mode === m.id
            const Icon = m.icon
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                aria-pressed={active}
                className={`lg4-card flex flex-col items-center gap-2 py-4 rounded-2xl transition-colors ${
                  active ? 'border-[var(--lg4-pri)] border-2' : ''
                }`}
              >
                <Icon size={20} className={active ? 'text-[var(--lg4-pri)]' : 'text-muted'} />
                <span className={`text-xs ${active ? 'font-bold text-[var(--lg4-pri)]' : 'text-muted'}`}>{m.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* رنگ‌بندی */}
      <section>
        <h2 className="text-sm font-bold mb-1">رنگ‌بندی</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PALETTES.map((p) => {
            const active = palette === p.id
            return (
              <button
                key={p.id}
                onClick={() => setPalette(p.id)}
                aria-pressed={active}
                aria-label={p.label}
                className={`lg4-card p-3 flex flex-col gap-3 text-right transition-transform active:scale-[0.98] ${
                  active ? 'border-[var(--lg4-pri)] border-2' : ''
                }`}
              >
                <span
                  className="relative h-14 rounded-2xl flex items-end justify-start gap-1.5 p-2"
                  style={{ background: `linear-gradient(150deg, ${p.swatch[0]}, ${p.swatch[1]})` }}
                >
                  <span className="w-4 h-4 rounded-full border border-white/60" style={{ background: p.swatch[2] }} />
                  {active && (
                    <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow">
                      <Check size={14} style={{ color: p.swatch[1] }} />
                    </span>
                  )}
                </span>
                <span className={`text-sm ${active ? 'font-bold text-[var(--lg4-pri)]' : 'text-[var(--lg-text-secondary)]'}`}>{p.label}</span>
              </button>
            )
          })}
        </div>
      </section>


      {/* دسترسی‌پذیری */}
      <section>
        <h2 className="text-sm font-bold mb-3">دسترس‌پذیری</h2>
        <div className="space-y-2">
          <A11yToggle
            icon={Sparkles}
            label="حالت آسان"
            hint="نوشته‌ها و دکمه‌ها بزرگ‌تر، فقط کارهای اصلی نمایش داده می‌شوند و دکمه‌ی تماس اضطراری ظاهر می‌شود"
            on={easy}
            onToggle={() => setEasy(!easy)}
          />
        </div>
      </section>

      <button
        onClick={reset}
        className="mx-auto flex items-center gap-2 text-sm text-muted hover:text-[var(--lg-text-primary)] transition-colors"
      >
        <RotateCcw size={18} />
        بازگرداندن تنظیمات پیش‌فرض
      </button>

      <p className="text-center text-[11px] text-[var(--lg-text-tertiary)]" dir="ltr" data-selectable>
        همین · build {BUILD_ID}
      </p>
    </div>
  )
}

function A11yToggle({
  icon: Icon,
  label,
  hint,
  on,
  onToggle,
}: {
  icon: typeof Sparkles
  label: string
  hint: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="w-full flex items-center gap-3 p-4 rounded-2xl lg4-card text-right"
    >
      <Icon size={22} className="text-[var(--lg4-pri)] flex-none" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-muted mt-0.5">{hint}</span>
      </span>
      <span
        className="relative w-12 h-7 rounded-full flex-none transition-colors"
        style={{ background: on ? 'var(--lg4-pri)' : 'var(--lg-border-hairline)' }}
      >
        <span
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: on ? 'none' : 'translateX(-24px)' }}
        />
      </span>
    </button>
  )
}

/** اعلان‌های گوشی (Web Push): روشن/خاموش برای همین دستگاه + ارسال آزمایشی */
/** تغییر رمز عبور — ساکن با رمز اولیه (شماره واحد) وارد می‌شود و از همین‌جا رمز خودش را می‌گذارد */
function PasswordSection() {
  const { user, markPasswordChanged } = useAuth()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const must = !!user?.mustChangePassword
  // پیش‌فرض بسته؛ فقط با رمز موقت یا لینک #password خودکار باز می‌شود
  const [open, setOpen] = useState(() => must || window.location.hash === '#password')

  useEffect(() => {
    if (must) setOpen(true)
    if (must && window.location.hash === '#password') document.getElementById('password')?.scrollIntoView({ behavior: 'smooth' })
  }, [must])

  // سوپرادمین و کودک (ورود با کد خانواده) رمز ندارند
  if (!user || user.role === 'super_admin' || user.role === 'child') return null

  async function submit() {
    setMsg(null)
    if (next.length < 8) return setMsg({ ok: false, text: 'رمز جدید باید حداقل ۸ کاراکتر باشد' })
    if (/^\d+$/.test(next)) return setMsg({ ok: false, text: 'رمز نباید فقط عدد باشد؛ حرف و عدد را ترکیب کنید' })
    if (next !== again) return setMsg({ ok: false, text: 'تکرار رمز جدید یکسان نیست' })
    setBusy(true)
    try {
      await changePassword(cur, next)
      markPasswordChanged()
      setCur('')
      setNext('')
      setAgain('')
      setMsg({ ok: true, text: 'رمز عبور تغییر کرد؛ از دستگاه‌های دیگر خارج شدید.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'تغییر رمز ناموفق بود' })
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full h-11 rounded-xl px-3 text-sm bg-transparent border border-[var(--lg-border-hairline)]'
  return (
    <section id="password" className="lg4-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-[56px] flex items-center gap-3 p-4 text-right"
      >
        <KeyRound size={20} className="text-[var(--lg4-pri)] flex-none" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold">تغییر رمز عبور</span>
          {must && <span className="block text-xs text-[var(--lg4-pri)] font-bold mt-0.5">رمز موقت است؛ لطفاً رمز جدید بگذارید</span>}
        </span>
        <ChevronDown size={18} className="lg6-chev text-muted flex-none" data-open={open} />
      </button>
      {open && (
        <div className="lg6-extra px-4 pb-4 space-y-3">
          {must && <p className="text-xs leading-6 text-[var(--lg4-pri)] font-bold">رمز شما هنوز رمز موقت اولیه است؛ برای امنیت حساب لطفاً همین حالا رمز جدید بگذارید.</p>}
          <input className={input} type="password" autoComplete="current-password" placeholder="رمز فعلی" value={cur} onChange={(e) => setCur(e.target.value)} dir="ltr" />
          <input className={input} type="password" autoComplete="new-password" placeholder="رمز جدید (حداقل ۸ کاراکتر)" value={next} onChange={(e) => setNext(e.target.value)} dir="ltr" />
          <input className={input} type="password" autoComplete="new-password" placeholder="تکرار رمز جدید" value={again} onChange={(e) => setAgain(e.target.value)} dir="ltr" />
          {msg && <p className={`text-xs font-bold ${msg.ok ? 'text-[var(--lg4-pri)]' : 'text-[var(--hm-bad)]'}`}>{msg.text}</p>}
          <button className="lg4-capsule w-full h-11 text-sm font-bold" disabled={busy || !cur || !next || !again} onClick={() => void submit()}>
            {busy ? 'در حال ذخیره…' : 'ذخیره‌ی رمز جدید'}
          </button>
        </div>
      )}
    </section>
  )
}

/** شخصی‌سازی نوار پایین: تا ۴ بخش دلخواه + ترتیب؛ بقیه در «بیشتر» می‌مانند (ذخیره روی همین دستگاه) */
function TabBarSection() {
  const { nav, tabs, customized, save } = useNavSplit()
  const [open, setOpen] = useState(false)
  const chosen = tabs.map((t) => t.to)
  const rest = nav.filter((i) => !chosen.includes(i.to))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...chosen]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    save(next)
  }
  const btn = 'w-9 h-9 flex-none rounded-full flex items-center justify-center text-muted active:scale-90 transition-transform disabled:opacity-30'

  return (
    <section className="lg4-card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full min-h-[56px] flex items-center gap-3 p-4 text-right">
        <PanelBottom size={20} className="text-[var(--lg4-pri)] flex-none" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold">نوار پایین</span>
          <span className="block text-xs text-muted mt-0.5">بخش‌های پرکاربردتان را در نوار پایین بگذارید</span>
        </span>
        <ChevronDown size={18} className="lg6-chev text-muted flex-none" data-open={open} />
      </button>
      {open && (
        <div className="lg6-extra px-4 pb-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted">در نوار پایین ({chosen.length.toLocaleString('fa-IR')} از {MAX_TABS.toLocaleString('fa-IR')})</p>
            {tabs.map((t, i) => (
              <div key={t.to} className="flex items-center gap-2 rounded-2xl border border-[var(--lg-border-hairline)] p-2 pr-3">
                <t.icon size={20} className="text-[var(--lg4-pri)] flex-none" />
                <span className="flex-1 min-w-0 truncate text-sm font-bold">{t.label}</span>
                <button type="button" aria-label="بالاتر" className={btn} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                <button type="button" aria-label="پایین‌تر" className={btn} disabled={i === tabs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
                <button type="button" aria-label="حذف از نوار" className={btn} disabled={chosen.length <= 1} onClick={() => save(chosen.filter((x) => x !== t.to))}><X size={16} /></button>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted">افزودن به نوار {chosen.length >= MAX_TABS && '(ابتدا یکی را حذف کنید)'}</p>
              <div className="flex flex-wrap gap-2">
                {rest.map((i) => (
                  <button
                    key={i.to}
                    type="button"
                    disabled={chosen.length >= MAX_TABS}
                    onClick={() => save([...chosen, i.to])}
                    className="min-h-[40px] px-3 rounded-full border border-[var(--lg-border-hairline)] flex items-center gap-1.5 text-xs font-medium active:scale-95 transition-transform disabled:opacity-40"
                  >
                    <Plus size={14} className="text-[var(--lg4-pri)]" />
                    <i.icon size={16} />
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {customized && (
            <button type="button" onClick={() => save(null)} className="text-xs text-muted flex items-center gap-1.5">
              <RotateCcw size={14} /> بازگرداندن نوار پیش‌فرض
            </button>
          )}
        </div>
      )}
    </section>
  )
}
