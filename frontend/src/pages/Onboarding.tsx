/**
 * صفحات معرفی (Onboarding) — پیاده‌سازی طراحی «Onboarding - Hamino» (Claude Design).
 *
 * فلوی اصلی طراحی حفظ شده: اسپلش انیمیشنی (auto-advance) → ۴ اسلاید معرفی → صفحه‌ی
 * پایانی با CTA. رنگ‌ها با هویت بصری فعلی اپ (ink/tile در index.css، نه آبی #2f6bf0
 * فایل طراحی) هماهنگ شدند تا رنگ برند در کل اپ یکدست بماند.
 *
 * صفحه‌ی ورود با شماره‌موبایل/OTP در فایل طراحی صرفاً یک دموی نمایشی بود (خود کد آن
 * صراحتاً کامنت داشت: «در نسخه کامل، مستقیم وارد پنل می‌شوید») و به هیچ بک‌اندی وصل
 * نبود. به‌جای ساختن یک سیستم احراز هویت جعلی و موازی، دکمه‌ی «شروع کنید» مستقیم به
 * صفحه‌ی ورود واقعی و از قبل متصل به بک‌اند (ایمیل/رمز/subdomain، در Login.tsx) می‌رود.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, ShieldCheck, Wallet, Wrench, CalendarRange, Bell,
  Shield, Video, Coffee, TreePine, ArrowLeft,
} from 'lucide-react'

export const ONBOARDING_SEEN_KEY = 'hamino_onboarding_seen'

interface Slide {
  title: string
  body: string
  badges: { Icon: typeof Home; className: string }[]
}

const SLIDES: Slide[] = [
  {
    title: 'مدیریت کامل مجتمع',
    body: 'از امور مالی و شارژ تا خدمات، رزرو امکانات و ارتباط با مدیران، همه در یک پلتفرم.',
    badges: [
      { Icon: Home, className: 'top-1 -left-2 w-14 h-14 text-tile' },
      { Icon: Users, className: 'top-20 -left-6 w-14 h-14 text-tile animate-[ofloat_7s_ease-in-out_infinite] [animation-delay:.6s]' },
      { Icon: ShieldCheck, className: 'top-36 left-1 w-12 h-12 text-tile animate-[ofloat_6.5s_ease-in-out_infinite] [animation-delay:1.1s]' },
    ],
  },
  {
    title: 'همه چیز در دسترس شما',
    body: 'با اپلیکیشن همینو، به‌راحتی درخواست‌ها را ثبت کنید، وضعیت را پیگیری کنید و از آخرین اطلاعیه‌ها باخبر شوید.',
    badges: [
      { Icon: Wallet, className: 'top-2 right-0 w-14 h-14 text-tile' },
      { Icon: Wrench, className: 'top-20 right-2 w-13 h-13 text-tile animate-[ofloat_7s_ease-in-out_infinite] [animation-delay:.7s]' },
      { Icon: CalendarRange, className: 'top-36 right-0 w-13 h-13 text-tile animate-[ofloat_6.4s_ease-in-out_infinite] [animation-delay:1.2s]' },
      { Icon: Bell, className: 'top-52 right-1 w-12 h-12 text-tile animate-[ofloat_6.8s_ease-in-out_infinite] [animation-delay:1.6s]' },
    ],
  },
  {
    title: 'امنیت و آرامش بیشتر',
    body: 'با پنل نگهبانی و سیستم‌های امنیتی، آرامش و امنیت مجتمع شما همیشه در اولویت است.',
    badges: [
      { Icon: Shield, className: 'top-0 left-8 w-14 h-14 text-tile' },
      { Icon: Video, className: 'top-4 right-8 w-14 h-14 text-tile animate-[ofloat_7.2s_ease-in-out_infinite] [animation-delay:.8s]' },
    ],
  },
  {
    title: 'زندگی بهتر، در کنار هم',
    body: 'از رستوران و کافی‌شاپ گرفته تا امکانات تفریحی و خدمات رفاهی، همه برای یک زندگی راحت‌تر.',
    badges: [
      { Icon: Coffee, className: 'top-6 left-2 w-14 h-14 text-tile' },
      { Icon: TreePine, className: 'top-24 -left-2 w-13 h-13 text-tile animate-[ofloat_7.4s_ease-in-out_infinite] [animation-delay:.9s]' },
    ],
  },
]

/** ۰=اسپلش، ۱-۴=اسلایدهای معرفی، ۵=صفحه‌ی پایانی */
type Step = 0 | 1 | 2 | 3 | 4 | 5

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(0)

  // اسپلش بعد از ۲.۴ ثانیه خودکار به اولین اسلاید می‌رود
  useEffect(() => {
    if (step !== 0) return
    const t = setTimeout(() => setStep(1), 2400)
    return () => clearTimeout(t)
  }, [step])

  function goStart() {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    navigate('/login', { replace: true })
  }
  function skip() {
    setStep(5)
  }
  function next() {
    setStep((s) => (Math.min(5, s + 1) as Step))
  }
  function goTo(i: number) {
    setStep(i as Step)
  }

  // دسکتاپ: ناوبری با کیبورد (در RTL فلش چپ = بعدی)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setStep((s) => (s >= 1 && s < 5 ? ((s + 1) as Step) : s))
      else if (e.key === 'ArrowRight') setStep((s) => (s > 1 ? ((s - 1) as Step) : s))
      else if (e.key === 'Enter') setStep((s) => (s === 5 ? (localStorage.setItem(ONBOARDING_SEEN_KEY, '1'), navigate('/login', { replace: true }), s) : s === 0 ? 1 : s))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const slide = SLIDES[Math.min(3, Math.max(0, step - 1))]

  const Controls = () => (
    <>
      <div className="flex items-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i + 1)}
            aria-label={`اسلاید ${i + 1}`}
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: i === step - 1 ? 22 : 8, background: i === step - 1 ? 'var(--color-tile)' : 'var(--color-line)' }}
          />
        ))}
      </div>
      <button
        onClick={next}
        className="rounded-full bg-tile text-white flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:brightness-110 transition lg:w-auto lg:px-7"
        style={{ width: 52, height: 52, boxShadow: '0 12px 26px color-mix(in srgb, var(--color-tile) 35%, transparent)' }}
        aria-label="بعدی"
      >
        <span className="hidden lg:inline text-sm font-bold">{step === 4 ? 'شروع' : 'بعدی'}</span>
        <ArrowLeft size={22} />
      </button>
    </>
  )

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-canvas flex flex-col overflow-hidden relative font-sans">
      <style>{`
        @keyframes ofloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
        @keyframes osun { 0%, 100% { opacity: .85; transform: scale(1) } 50% { opacity: 1; transform: scale(1.05) } }
        @keyframes ofu { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
        .ob-oa { animation: ofu .5s cubic-bezier(.32,.72,0,1) both }
      `}</style>

      {/* ===== اسپلش (مرحله ۰) ===== */}
      {step === 0 && (
        <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-tile-soft via-tile-soft to-card">
          <div
            className="absolute w-24 h-24 lg:w-36 lg:h-36 rounded-full pointer-events-none right-[14%] bottom-[214px] lg:bottom-[34vh]"
            style={{
              background: 'radial-gradient(circle at 40% 40%, #f6d78a, var(--color-brass))',
              filter: 'blur(1px)', animation: 'osun 5s ease-in-out infinite',
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-80 lg:h-[42vh] z-[3] overflow-hidden"><div className="w-full h-full lg:scale-110 origin-bottom">
            <img src="/onboarding/splash-city.webp" alt="" className="w-full h-full object-cover" />
          </div></div>
          <div className="relative z-[2] flex-1 flex flex-col items-center pt-44 lg:pt-[18vh] px-8 pointer-events-none">
            <div className="ob-oa" style={{ animation: 'ofloat 6s ease-in-out infinite' }}>
              <div className="relative w-24 h-24 lg:w-32 lg:h-32 flex items-center justify-center">
                <Home className="w-24 h-24 lg:w-32 lg:h-32 text-tile drop-shadow-lg" strokeWidth={1.6} />
                <span className="absolute top-1.5 -right-0.5 w-5 h-5 rounded-full" style={{ background: 'linear-gradient(140deg,#e0b263,var(--color-brass))' }} />
              </div>
            </div>
            <p className="ob-oa mt-5 text-[40px] lg:text-6xl font-extrabold tracking-tight text-ink" style={{ animationDelay: '.1s' }}>همین</p>
            <p className="ob-oa mt-4 text-base lg:text-xl font-semibold text-ink-soft" style={{ animationDelay: '.18s' }}>برای یک ساختمان،همین کافیست</p>
          </div>
        </div>
      )}

      {/* ===== اسلایدهای معرفی (مراحل ۱-۴) ===== */}
      {step >= 1 && step <= 4 && (
        <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-card to-canvas overflow-y-auto">
          <div className="w-full max-w-6xl mx-auto flex flex-col flex-1 lg:px-12">
            <div className="flex items-center justify-between pt-14 lg:pt-10 px-6 lg:px-0">
              <button onClick={skip} className="text-sm font-semibold text-muted px-0.5 py-1.5 hover:text-ink-text transition-colors">رد کردن</button>
              <span className="hidden lg:flex items-center gap-2 text-xl font-extrabold text-ink">
                <Home size={24} className="text-tile" /> همین
              </span>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row lg:items-center lg:gap-20 justify-center px-7 lg:px-0 pb-7">
              {/* تصویر */}
              <div className="order-1 lg:order-2 w-full max-w-[420px] lg:max-w-[540px] mx-auto lg:flex-1">
                <div className="relative h-72 lg:h-[460px] flex items-center justify-center">
                  <div
                    className="absolute w-72 h-64 lg:w-[460px] lg:h-[400px] blur-[.5px]"
                    style={{
                      background: 'linear-gradient(150deg, color-mix(in srgb, var(--color-tile) 18%, transparent), color-mix(in srgb, var(--color-tile) 6%, transparent))',
                      borderRadius: '48% 52% 44% 56% / 52% 44% 56% 48%',
                    }}
                  />
                  <div className="relative w-56 h-56 lg:w-80 lg:h-80 flex flex-wrap items-center justify-center gap-3 lg:gap-5 p-6" style={{ animation: 'ofloat 7s ease-in-out infinite' }}>
                    {slide.badges.map(({ Icon }, i) => (
                      <Icon key={i} className="w-14 h-14 lg:w-24 lg:h-24 text-tile" strokeWidth={1.4} />
                    ))}
                  </div>
                  {slide.badges.map(({ Icon, className }, i) => (
                    <div
                      key={i}
                      className={`absolute pointer-events-none rounded-[20px] bg-card/70 backdrop-blur-md border border-card shadow-lg flex items-center justify-center p-2 lg:scale-125 ${className}`}
                    >
                      <Icon className="w-6 h-6 text-tile" strokeWidth={1.8} />
                    </div>
                  ))}
                </div>
              </div>

              {/* متن */}
              <div className="order-2 lg:order-1 lg:flex-1 lg:max-w-xl">
                <p className="ob-oa mt-8 lg:mt-0 text-center lg:text-right text-[25px] md:text-4xl lg:text-5xl lg:leading-tight font-extrabold tracking-tight text-ink" key={`t-${step}`}>{slide.title}</p>
                <p className="ob-oa mt-4 lg:mt-6 mx-auto lg:mx-0 max-w-[300px] md:max-w-[420px] lg:max-w-md text-center lg:text-right text-sm md:text-base lg:text-lg leading-loose text-muted" style={{ animationDelay: '.08s' }} key={`b-${step}`}>{slide.body}</p>
                <div className="hidden lg:flex items-center gap-8 mt-12" dir="rtl">
                  <Controls />
                </div>
              </div>
            </div>

            <div className="lg:hidden flex items-center justify-between px-7 pb-10" dir="ltr">
              <Controls />
            </div>
          </div>
        </div>
      )}

      {/* ===== پایانی (مرحله ۵) ===== */}
      {step === 5 && (
        <div className="absolute inset-0 flex flex-col">
          <img src="/onboarding/final-city.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(15,30,35,.88) 0%, rgba(15,45,45,.34) 30%, rgba(10,25,28,.26) 60%, rgba(8,18,20,.86) 100%)' }}
          />
          <div className="relative z-[3] flex-1 flex flex-col items-center pt-32 lg:pt-0 lg:justify-center px-8 pb-11 lg:pb-0 w-full max-w-xl mx-auto pointer-events-none">
            <div className="ob-oa relative w-19 h-19 flex items-center justify-center" style={{ animation: 'ofloat 6s ease-in-out infinite' }}>
              <Home className="w-16 h-16 text-white drop-shadow-lg" strokeWidth={1.5} />
              <span className="absolute top-1 -right-0.5 w-4 h-4 rounded-full" style={{ background: 'linear-gradient(140deg,#e0b263,var(--color-brass))' }} />
            </div>
            <p className="ob-oa mt-4 text-[36px] lg:text-6xl font-extrabold tracking-tight text-white" style={{ animationDelay: '.08s' }}>همین</p>
            <p className="ob-oa mt-3 text-sm lg:text-lg font-semibold text-white/75" style={{ animationDelay: '.14s' }}>همه‌چیز، همین‌جا.</p>

            <div className="flex-1 lg:flex-none lg:h-24" />

            <button
              onClick={goStart}
              className="ob-oa pointer-events-auto w-full rounded-full py-5 px-6 bg-tile text-white text-[17px] font-extrabold flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.99] transition-transform"
              style={{ animationDelay: '.2s', boxShadow: '0 16px 34px color-mix(in srgb, var(--color-tile) 45%, transparent)' }}
            >
              <span className="flex-1 text-center">شروع کنید</span>
              <ArrowLeft size={22} />
            </button>
            <p className="mt-4 text-center text-[11.5px] leading-loose text-white/60">
              با ورود، شما با قوانین و شرایط استفاده موافقت می‌کنید.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
