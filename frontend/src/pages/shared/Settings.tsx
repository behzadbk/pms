import { useNavigate } from 'react-router-dom'
import { Sun, Moon, MonitorSmartphone, Check, Sparkles, Waves, RotateCcw, ChevronRight } from 'lucide-react'
import { PALETTES, useTheme, type ThemeMode, type Palette } from '../../context/ThemeContext'

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

const PALETTE_SWATCH: Record<Palette, string> = {
  teal: 'linear-gradient(150deg,#1a9a88,#0b5e54)',
  blue: 'linear-gradient(150deg,#4a88ff,#2458d6)',
  violet: 'linear-gradient(150deg,#8467f0,#4a2fb8)',
  coral: 'linear-gradient(150deg,#f07650,#b83d1d)',
  rose: 'linear-gradient(150deg,#e0559a,#9c2360)',
  graphite: 'linear-gradient(150deg,#4d586e,#232a38)',
}

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
        <div className="lg4-card p-4 grid grid-cols-3 gap-4">
          {PALETTES.map((p) => {
            const active = palette === p.id
            return (
              <button
                key={p.id}
                onClick={() => setPalette(p.id)}
                aria-pressed={active}
                aria-label={p.label}
                className="flex flex-col items-center gap-2"
              >
                <span
                  className="relative w-14 h-14 rounded-full flex items-center justify-center transition-transform"
                  style={{
                    background: PALETTE_SWATCH[p.id],
                    boxShadow: active ? '0 0 0 3px var(--lg-bg-elevated), 0 0 0 5px var(--lg4-pri)' : 'none',
                    transform: active ? 'scale(1.06)' : 'scale(1)',
                  }}
                >
                  {active && (
                    <span className="w-6 h-6 rounded-full bg-white/95 flex items-center justify-center">
                      <Check size={16} className="text-[var(--lg4-pri)]" />
                    </span>
                  )}
                </span>
                <span className={`text-xs ${active ? 'font-bold' : 'text-muted'}`}>{p.label}</span>
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
