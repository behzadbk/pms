import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, MonitorSmartphone, Check, Sparkles, Waves, RotateCcw, ChevronRight, BellRing, Send } from 'lucide-react'
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../../lib/pushNotifications'
import { useAuth } from '../../context/AuthContext'
import { PALETTES, useTheme, type ThemeMode } from '../../context/ThemeContext'

/**
 * صفحه‌ی «شخصی‌سازی» — بخش جدید طراحی Liquid Glass نسخه ۴ (Claude Design handoff).
 * حالت نمایش (روشن/تاریک/سیستم)، رنگ‌بندی، حالت آسان (بزرگ‌نمایی برای ساکنان
 * مسن‌تر) و کاهش حرکت. برای هر نقشِ لاگین‌شده در /settings در دسترس است.
 */

const MODE_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'dark', label: 'تاریک', icon: Moon },
  { id: 'system', label: 'سیستم', icon: MonitorSmartphone },
]


export function Settings() {
  const navigate = useNavigate()
  const { mode, setMode, palette, setPalette, easy, setEasy, reducedMotion, setReducedMotion, reset } = useTheme()

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
          <h1 className="text-xl font-bold">شخصی‌سازی</h1>
          <p className="text-sm text-muted mt-0.5">ظاهر همین را به سلیقه خودتان تنظیم کنید</p>
        </div>
      </div>

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
        <p className="text-xs text-muted mb-3">روشن، تاریک یا هماهنگ با تنظیمات دستگاه شما</p>
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
        <p className="text-xs text-muted mb-3">رنگ اصلی دکمه‌ها، کارت قهرمان و نوار تب را انتخاب کنید</p>
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

      <NotificationsSection />

      {/* دسترسی‌پذیری */}
      <section>
        <h2 className="text-sm font-bold mb-3">دسترس‌پذیری</h2>
        <div className="space-y-2">
          <A11yToggle
            icon={Sparkles}
            label="حالت آسان"
            hint="نوشته‌ها و دکمه‌ها بزرگ‌تر می‌شوند — مناسب ساکنان مسن‌تر"
            on={easy}
            onToggle={() => setEasy(!easy)}
          />
          <A11yToggle
            icon={Waves}
            label="کاهش حرکت"
            hint="انیمیشن‌ها و ترنزیشن‌ها خاموش می‌شوند"
            on={reducedMotion}
            onToggle={() => setReducedMotion(!reducedMotion)}
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
          className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ right: on ? '4px' : '28px' }}
        />
      </span>
    </button>
  )
}

/** اعلان‌های گوشی (Web Push): روشن/خاموش برای همین دستگاه + ارسال آزمایشی */
function NotificationsSection() {
  const { user } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  useEffect(() => {
    void getPushState().then(setState)
  }, [])
  if (!user || user.role === 'super_admin') return null

  async function toggle() {
    setBusy(true)
    setMsg(null)
    try {
      if (state === 'on') {
        await disablePush()
        setMsg({ ok: true, t: 'اعلان‌ها روی این دستگاه خاموش شد.' })
      } else {
        await enablePush()
        setMsg({ ok: true, t: 'اعلان‌ها فعال شد. یک اعلان آزمایشی بفرستید تا مطمئن شوید.' })
      }
      setState(await getPushState())
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : 'خطا' })
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }
  async function test() {
    setBusy(true)
    setMsg(null)
    try {
      const n = await sendTestPush()
      setMsg(n > 0 ? { ok: true, t: 'اعلان آزمایشی ارسال شد؛ باید تا چند ثانیه‌ی دیگر برسد.' } : { ok: false, t: 'اشتراکی برای این حساب پیدا نشد. یک‌بار خاموش و دوباره روشن کنید.' })
    } catch {
      setMsg({ ok: false, t: 'ارسال ناموفق بود.' })
    } finally {
      setBusy(false)
    }
  }

  const hint =
    state === 'needs-install'
      ? 'در آیفون ابتدا همین را به صفحه‌ی اصلی اضافه کنید (Share ← Add to Home Screen) و از همان آیکن باز کنید.'
      : state === 'unsupported'
        ? 'این مرورگر از اعلان پشتیبانی نمی‌کند.'
        : state === 'blocked'
          ? 'اعلان برای این سایت مسدود است. از تنظیمات مرورگر/گوشی اجازه‌ی اعلان را بدهید.'
          : 'نتیجه‌ی رزرو، درخواست‌های جدید، مرسوله و پیام‌های مهم همان لحظه روی گوشی می‌آید.'
  const disabled = busy || state === null || state === 'unsupported' || state === 'needs-install' || state === 'blocked'

  return (
    <section>
      <h2 className="text-sm font-bold mb-1">اعلان‌ها</h2>
      <p className="text-xs text-muted mb-3">برای همین دستگاه تنظیم می‌شود</p>
      <div className="lg4-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <BellRing size={22} className="text-[var(--lg4-pri)] flex-none" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">اعلان‌های گوشی</p>
            <p className="text-xs text-muted mt-0.5 leading-6">{hint}</p>
          </div>
          <button
            role="switch"
            aria-checked={state === 'on'}
            aria-label="اعلان‌های گوشی"
            disabled={disabled}
            onClick={toggle}
            className="relative w-12 h-7 rounded-full flex-none transition-colors disabled:opacity-50"
            style={{ background: state === 'on' ? 'var(--lg4-pri)' : 'var(--lg-border-hairline)' }}
          >
            <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ right: state === 'on' ? '4px' : '28px' }} />
          </button>
        </div>
        {state === 'on' && (
          <button onClick={test} disabled={busy} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--lg4-pri)] min-h-[44px] disabled:opacity-60">
            <Send size={16} /> ارسال اعلان آزمایشی
          </button>
        )}
        {msg && <p className={`text-xs leading-6 ${msg.ok ? 'text-[var(--lg-text-secondary)]' : 'text-bad'}`}>{msg.t}</p>}
      </div>
    </section>
  )
}
