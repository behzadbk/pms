/**
 * صفحات معرفی (Onboarding) «همین» — بازطراحی کامل.
 *
 * ایده‌ی طراحی: یک «روز در مجتمع». اسپلش سپیده‌دم است، چهار اسلاید با رنگ‌مایه‌ی
 * متفاوت به‌ترتیب می‌گذرند و صفحه‌ی پایانی شب است؛ یعنی کاربر در طی معرفی، یک
 * شبانه‌روز زندگی در ساختمان را می‌بیند. همه‌ی تصاویر اختصاصی و SVG هستند
 * (onboarding/illustrations.tsx) و از توکن‌های رنگ اپ و سیستم شیشه‌ای v4 استفاده می‌کنند.
 *
 * رفتار:
 *  - اسپلش خودکار بعد از ۲.۶ ثانیه به اسلاید اول می‌رود (یا با لمس/Enter).
 *  - جابه‌جایی با دکمه، نقطه‌ها، کشیدن انگشت (RTL: کشیدن به راست = بعدی)، یا کلیدهای جهت‌دار.
 *  - دکمه‌ی اصلی در ناحیه‌ی شست (پایین صفحه) و تمام‌عرض است.
 *  - «شروع کنید» مستقیم به صفحه‌ی ورود واقعی (Login.tsx) می‌رود؛ ورود جعلی ساخته نشده است.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  SplashScene, ManageScene, PhoneScene, SecurityScene, LifeScene, NightSky, NightScene,
} from './onboarding/illustrations'

export const ONBOARDING_SEEN_KEY = 'hamino_onboarding_seen'

interface Slide {
  eyebrow: string
  title: string
  body: string
  /** درصد رنگ برند در پس‌زمینه؛ هر اسلاید کمی متفاوت است (سیر روز) */
  tint: number
  Scene: (p: { className?: string }) => ReactNode
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'مدیریت',
    title: 'مدیریت کامل مجتمع',
    body: 'امور مالی و شارژ، خدمات، رزرو امکانات و ارتباط با مدیر؛ همه در یک پلتفرم.',
    tint: 14,
    Scene: ManageScene,
  },
  {
    eyebrow: 'دسترسی',
    title: 'همه‌چیز در دسترس شما',
    body: 'درخواستتان را ثبت کنید، مرحله‌به‌مرحله پیگیری کنید و از اطلاعیه‌ها باخبر شوید.',
    tint: 20,
    Scene: PhoneScene,
  },
  {
    eyebrow: 'امنیت',
    title: 'امنیت و آرامش بیشتر',
    body: 'پنل نگهبانی، ثبت تردد و کد QR مهمان؛ آرامش مجتمع همیشه در اولویت است.',
    tint: 26,
    Scene: SecurityScene,
  },
  {
    eyebrow: 'زندگی',
    title: 'زندگی بهتر، در کنار هم',
    body: 'از کافی‌شاپ و رستوران تا استخر و باشگاه، رزرو و سفارش با چند لمس.',
    tint: 32,
    Scene: LifeScene,
  },
]

/** ۰=اسپلش، ۱-۴=اسلایدها، ۵=صفحه‌ی پایانی */
type Step = 0 | 1 | 2 | 3 | 4 | 5
const LAST_SLIDE = SLIDES.length as Step
const FINAL = (SLIDES.length + 1) as Step

const fa = (n: number) => n.toLocaleString('fa-IR')

/** آیکن برند: کارت سفید گرد + خانه‌ی فیروزه‌ای + نقطه‌ی برنجی (مطابق آیکن اپ) */
function BrandMark({ size = 96, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="bm-sh" filterUnits="userSpaceOnUse" x="-30" y="-30" width="160" height="170">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#052f30" floodOpacity={dark ? 0.5 : 0.25} />
        </filter>
      </defs>
      <rect x="6" y="6" width="84" height="84" rx="26" fill="white" filter="url(#bm-sh)" />
      <path
        d="M24 50 L48 28 L72 50 V68 a5 5 0 0 1 -5 5 H29 a5 5 0 0 1 -5 -5Z"
        fill="var(--color-tile)"
      />
      <path d="M41 73 V58 a7 7 0 0 1 14 0 V73Z" fill="white" />
      <circle cx="68" cy="30" r="7" fill="var(--color-brass)" />
    </svg>
  )
}

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    navigate('/login', { replace: true })
  }, [navigate])

  const go = useCallback((to: number) => {
    setStep((cur) => {
      const clamped = Math.max(0, Math.min(FINAL, to)) as Step
      setDir(clamped >= cur ? 1 : -1)
      return clamped
    })
  }, [])

  const next = useCallback(() => setStep((s) => { setDir(1); return Math.min(FINAL, s + 1) as Step }), [])
  const prev = useCallback(() => setStep((s) => { setDir(-1); return Math.max(1, s - 1) as Step }), [])

  // اسپلش خودکار جلو می‌رود
  useEffect(() => {
    if (step !== 0) return
    const t = setTimeout(() => go(1), 2600)
    return () => clearTimeout(t)
  }, [step, go])

  // کیبورد (RTL: فلش چپ = بعدی)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') { if (step >= 1 && step < FINAL) next() }
      else if (e.key === 'ArrowRight') { if (step > 1 && step <= FINAL) prev() }
      else if (e.key === 'Enter') { if (step === 0) go(1); else if (step === FINAL) finish() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, next, prev, go, finish])

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touch.current
    touch.current = null
    if (!s || step < 1) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    // RTL: انگشت به راست = صفحه‌ی بعد
    if (dx > 0) { if (step < FINAL) next() } else if (step > 1) prev()
  }

  const slide = step >= 1 && step <= LAST_SLIDE ? SLIDES[step - 1] : null

  const nextButton = (
    <button
      onClick={next}
      className="lg4-capsule w-full min-h-[56px] px-6 text-[17px] flex items-center justify-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tile)]"
    >
      <span>{step === LAST_SLIDE ? 'ادامه' : 'بعدی'}</span>
      <ArrowLeft size={20} />
    </button>
  )

  return (
    <div
      dir="rtl"
      data-onboarding
      className="lg-motion relative min-h-[100dvh] overflow-hidden font-sans bg-canvas text-ink-text select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{`
        @keyframes ob-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @keyframes ob-glow { 0%,100% { opacity: .75 } 50% { opacity: 1 } }
        @keyframes ob-twinkle { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes ob-win { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @keyframes ob-steam { 0% { opacity: 0; transform: translateY(6px) } 40% { opacity: .9 } 100% { opacity: 0; transform: translateY(-8px) } }
        @keyframes ob-wave { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-9px) } }
        @keyframes ob-sway { 0%,100% { transform: rotate(-5deg) } 50% { transform: rotate(5deg) } }
        @keyframes ob-sun { 0% { transform: translateY(70px); opacity: 0 } 100% { transform: none; opacity: 1 } }
        @keyframes ob-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
        @keyframes ob-in-next { from { opacity: 0; transform: translateX(-36px) } to { opacity: 1; transform: none } }
        @keyframes ob-in-prev { from { opacity: 0; transform: translateX(36px) } to { opacity: 1; transform: none } }
        .ob-anim { animation-duration: 6.5s; animation-timing-function: ease-in-out; animation-iteration-count: infinite; transform-box: fill-box }
        .ob-float { animation-name: ob-float }
        .ob-glow { animation-name: ob-glow; animation-duration: 2.8s }
        .ob-twinkle { animation-name: ob-twinkle; animation-duration: 3.4s }
        .ob-win { animation-name: ob-win; animation-duration: 4.6s }
        .ob-steam { animation-name: ob-steam; animation-duration: 2.8s }
        .ob-wave { animation-name: ob-wave; animation-duration: 4s }
        .ob-sway { animation-name: ob-sway; animation-duration: 5s }
        .ob-rise { animation: ob-rise .6s cubic-bezier(.32,.72,0,1) both }
        .ob-next { animation: ob-in-next .5s cubic-bezier(.32,.72,0,1) both }
        .ob-prev { animation: ob-in-prev .5s cubic-bezier(.32,.72,0,1) both }
        /* چیدمان واکنش‌گرا: ستونی روی موبایل/پرتره، دو‌ستونه روی دسکتاپ و گوشی افقی */
        .ob-body { display: flex; flex-direction: column; justify-content: center; gap: 20px; padding: 16px 0 8px; min-height: 0 }
        .ob-art { display: flex; align-items: center; justify-content: center; flex: 0 1 auto; min-height: 0 }
        .ob-card { width: 100%; max-width: 400px; padding: 12px; border-radius: 32px }
        .ob-scene { display: block; width: 100%; height: auto; max-height: min(40dvh, 360px) }
        .ob-copy { flex: 0 0 auto; text-align: center }
        .ob-title { font-size: clamp(24px, 2.2vw + 15px, 48px); line-height: 1.25 }
        .ob-text { font-size: clamp(14px, .45vw + 12px, 18px); line-height: 2; max-width: 30rem; margin-inline: auto }
        .ob-cta-d { display: none }
        .ob-world { --wh: min(46dvh, calc(min(100vw, 760px) * .7143)); position: absolute; inset-inline: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; pointer-events: none }
        .ob-world-svg { height: var(--wh); width: auto; max-width: 100%; aspect-ratio: 420 / 300; display: block }
        .ob-ground { width: 100%; height: calc(var(--wh) * .04) }
        @media (max-height: 700px) {
          .ob-body { gap: 12px; padding-top: 8px }
          .ob-scene { max-height: min(30dvh, 300px) }
          .ob-card { padding: 8px }
        }
        @media (min-width: 1024px), (orientation: landscape) and (min-width: 640px) {
          .ob-body { flex-direction: row; align-items: center; gap: clamp(32px, 5vw, 80px); padding: 0 }
          .ob-art { flex: 1 1 0 }
          .ob-card { max-width: 520px; padding: 24px }
          .ob-scene { max-height: min(60dvh, 460px) }
          .ob-copy { flex: 1 1 0; max-width: 36rem; text-align: right }
          .ob-text { margin-inline: 0 }
          .ob-cta-m { display: none }
          .ob-cta-d { display: block }
        }
        @media (min-width: 640px) and (max-width: 1023px) and (orientation: portrait) {
          .ob-card { max-width: 520px }
          .ob-scene { max-height: min(44dvh, 460px) }
        }
        @media (max-height: 520px) {
          .ob-brand svg { width: 56px; height: 56px }
          .ob-world { --wh: min(40dvh, calc(min(100vw, 760px) * .7143)) }
        }
        @media (orientation: landscape) and (max-height: 520px) {
          .ob-card { padding: 8px; border-radius: 24px }
          .ob-scene { max-height: 58dvh }
          .ob-title { font-size: clamp(20px, 3.4dvh + 8px, 32px) }
        }
        @media (min-width: 1024px) and (min-height: 900px) { .ob-scene { max-height: min(54dvh, 500px) } }
        @media (prefers-reduced-motion: reduce) {
          [data-onboarding] *, [data-onboarding] *::before { animation: none !important; transition: none !important }
        }
      `}</style>

      {/* ───────── ۰) اسپلش: سپیده‌دم ───────── */}
      {step === 0 && (
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="شروع معرفی"
          className="absolute inset-0 flex flex-col items-center text-center cursor-pointer overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--color-brass) 22%, var(--color-card)) 0%, color-mix(in srgb, var(--color-tile) 14%, var(--color-card)) 55%, var(--color-card) 100%)',
          }}
        >
          {/* خورشید در حال طلوع (داخل محدوده‌ی مرکزی تا روی صفحه‌ی عریض از افق دور نشود) */}
          <div className="absolute inset-y-0 w-full max-w-[760px] pointer-events-none">
            <div
              className="absolute right-[9%] top-[7%] w-20 h-20 lg:w-28 lg:h-28 rounded-full"
              style={{
                background: 'radial-gradient(circle at 38% 36%, color-mix(in srgb, var(--color-brass) 35%, white), var(--color-brass))',
                boxShadow: '0 0 90px 28px color-mix(in srgb, var(--color-brass) 38%, transparent)',
                animation: 'ob-sun 1.4s cubic-bezier(.32,.72,0,1) both',
              }}
            />
          </div>
          <div className="relative z-[2] flex flex-col items-center px-8" style={{ paddingTop: 'clamp(20px, 15dvh, 160px)' }}>
            <div className="ob-brand ob-rise" style={{ animation: 'ob-rise .6s cubic-bezier(.32,.72,0,1) both, ob-float 6s ease-in-out .6s infinite' }}>
              <BrandMark size={104} />
            </div>
            <p className="ob-rise mt-6 font-extrabold tracking-tight" style={{ animationDelay: '.12s', fontSize: 'clamp(40px, 3vw + 24px, 64px)' }}>همین</p>
            <p className="ob-rise mt-3 font-semibold text-muted" style={{ animationDelay: '.22s', fontSize: 'clamp(15px, .6vw + 12px, 20px)' }}>
              برای یک ساختمان، همین کافیست
            </p>
          </div>
          <div className="ob-world z-[3]">
            <SplashScene className="ob-world-svg" />
            <div className="ob-ground" style={{ background: 'color-mix(in srgb, var(--color-tile) 45%, var(--color-ink))' }} />
          </div>
        </button>
      )}

      {/* ───────── ۱–۴) اسلایدها ───────── */}
      {slide && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            background: `linear-gradient(180deg, color-mix(in srgb, var(--color-tile) ${slide.tint}%, var(--color-card)) 0%, var(--color-canvas) 68%)`,
            transition: 'background .6s ease',
          }}
        >
          <div className="w-full max-w-6xl mx-auto flex flex-col flex-1 min-h-0 overflow-y-auto px-6 lg:px-12">
            {/* نوار پیشرفت به سبک استوری */}
            <div className="pt-[max(env(safe-area-inset-top),20px)] lg:pt-10">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="مراحل معرفی">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.title}
                    role="tab"
                    aria-selected={i + 1 === step}
                    aria-label={`مرحله ${fa(i + 1)}: ${s.title}`}
                    onClick={() => go(i + 1)}
                    className="flex-1 h-8 flex items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tile)] rounded-full"
                  >
                    <span className="block w-full h-1 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-tile) 18%, transparent)' }}>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: i + 1 <= step ? '100%' : '0%',
                          background: 'var(--color-tile)',
                          transition: 'width .45s cubic-bezier(.32,.72,0,1)',
                        }}
                      />
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[13px] font-semibold text-muted">{fa(step)} از {fa(SLIDES.length)}</span>
                <button
                  onClick={() => go(FINAL)}
                  className="lg4-capsule-outline px-4 min-h-[44px] text-[13px] text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tile)]"
                >
                  رد کردن
                </button>
              </div>
            </div>

            {/* محتوا؛ با key جدا می‌شود تا هر اسلاید انیمیشن ورود خودش را داشته باشد */}
            <div
              key={step}
              className={`ob-body flex-1 ${dir === 1 ? 'ob-next' : 'ob-prev'}`}
              role="group"
              aria-roledescription="اسلاید"
              aria-label={`${fa(step)} از ${fa(SLIDES.length)}`}
            >
              <div className="ob-art lg:order-2 lg:flex-1">
                <div className="ob-card lg4-card lg4-card-float">
                  <slide.Scene className="ob-scene" />
                </div>
              </div>

              <div className="ob-copy lg:order-1">
                <span
                  className="inline-block px-3 py-1 rounded-full text-[12px] font-bold"
                  style={{ background: 'var(--color-brass-soft)', color: 'color-mix(in srgb, var(--color-brass) 78%, black)' }}
                >
                  {slide.eyebrow}
                </span>
                <h1 className="ob-title mt-3 font-extrabold tracking-tight">{slide.title}</h1>
                <p className="ob-text mt-3 text-muted">{slide.body}</p>
                {/* دسکتاپ و گوشی افقی: دکمه کنار متن */}
                <div className="ob-cta-d mt-8 max-w-xs">{nextButton}</div>
              </div>
            </div>

            {/* موبایل: دکمه در ناحیه‌ی شست */}
            <div className="ob-cta-m pt-3 pb-[max(env(safe-area-inset-bottom),24px)] w-full">{nextButton}</div>
          </div>
        </div>
      )}

      {/* ───────── ۵) صفحه‌ی پایانی: شب ───────── */}
      {step === FINAL && (
        <div className="absolute inset-0 flex flex-col">
          <NightSky />
          <div className="ob-world">
            <NightScene className="ob-world-svg" />
            <div className="ob-ground" style={{ background: 'color-mix(in srgb, var(--color-tile) 30%, black)' }} />
          </div>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(6,18,22,0) 52%, rgba(6,18,22,.7) 82%, rgba(6,18,22,.9) 100%)' }}
          />
          <div className="relative z-[3] flex-1 flex flex-col items-center px-7 w-full max-w-md mx-auto pb-[max(env(safe-area-inset-bottom),28px)]" style={{ paddingTop: 'max(env(safe-area-inset-top), clamp(16px, 10dvh, 120px))' }}>
            <div className="ob-brand ob-rise" style={{ animation: 'ob-rise .6s cubic-bezier(.32,.72,0,1) both, ob-float 6s ease-in-out .6s infinite' }}>
              <BrandMark size={84} dark />
            </div>
            <h1 className="ob-rise mt-5 text-[38px] lg:text-5xl font-extrabold tracking-tight text-white" style={{ animationDelay: '.1s' }}>همین</h1>
            <p className="ob-rise mt-2 text-base font-semibold text-white/80" style={{ animationDelay: '.18s' }}>همه‌چیز، همین‌جا.</p>

            <div className="flex-1" />

            <button
              onClick={finish}
              className="lg4-capsule ob-rise w-full min-h-[58px] px-6 text-[17px] font-extrabold flex items-center justify-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ animationDelay: '.26s' }}
            >
              <span>شروع کنید</span>
              <ArrowLeft size={20} />
            </button>
            <button
              onClick={prev}
              className="ob-rise mt-3 min-h-[44px] px-4 text-[13px] font-semibold text-white/75 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded-full"
              style={{ animationDelay: '.32s' }}
            >
              بازگشت به معرفی
            </button>
            <p className="mt-2 text-center text-[11.5px] leading-6 text-white/55">
              با ورود، شما با قوانین و شرایط استفاده موافقت می‌کنید.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
