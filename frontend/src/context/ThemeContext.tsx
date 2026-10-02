import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * شخصی‌سازی ظاهر همین — بخش «Settings · Personalization» طراحی Liquid Glass نسخه ۴.
 * حالت نمایش (روشن/تاریک/سیستم)، رنگ‌بندی، حالت آسان (بزرگ‌نمایی برای ساکنان مسن‌تر)
 * و کاهش حرکت را روی <html> به‌صورت data-attribute تنظیم می‌کند تا liquid-glass.css
 * توکن‌های متناظر را اعمال کند. تنظیمات در localStorage ذخیره و بین جلسات حفظ می‌شود.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type Palette = 'teal' | 'blue' | 'violet' | 'coral' | 'rose' | 'graphite'

export const PALETTES: { id: Palette; label: string }[] = [
  { id: 'teal', label: 'فیروزه‌ای' },
  { id: 'blue', label: 'آبی' },
  { id: 'violet', label: 'بنفش' },
  { id: 'coral', label: 'مرجانی' },
  { id: 'rose', label: 'رز' },
  { id: 'graphite', label: 'گرافیتی' },
]

/** رنگ هدر موبایل و منوی کشویی (همبرگر) — یک منبع واحد تا هر دو همیشه یک‌رنگ و هماهنگ با رنگ‌بندی انتخابی باشند */
const HEADER_COLORS: Record<Palette, { light: [string, string, string]; dark: [string, string, string] }> = {
  // [پس‌زمینه، پس‌زمینه‌ی نرم (پاپ‌آپ)، رنگ تأکید (آیکن/آیتم فعال)]
  teal: { light: ['#0f4a44', '#17625a', '#14a695'], dark: ['#0a2a27', '#103a35', '#14a695'] },
  blue: { light: ['#1d3f9e', '#2a52b8', '#4a88ff'], dark: ['#0f1f4a', '#182c63', '#3f74e8'] },
  violet: { light: ['#3b2594', '#4d34b0', '#8467f0'], dark: ['#1b1245', '#271a5e', '#6a4cdb'] },
  coral: { light: ['#9c3216', '#b8421f', '#f07650'], dark: ['#40160a', '#5a2010', '#d4552f'] },
  rose: { light: ['#8a1c55', '#a52a69', '#e0559a'], dark: ['#3d0c25', '#561434', '#c2387a'] },
  graphite: { light: ['#232a38', '#313a4d', '#6b7a96'], dark: ['#10141c', '#1a202b', '#4d586e'] },
}

interface ThemePrefs {
  mode: ThemeMode
  palette: Palette
  easy: boolean
  reducedMotion: boolean
}

const DEFAULTS: ThemePrefs = { mode: 'system', palette: 'teal', easy: false, reducedMotion: false }
const STORAGE_KEY = 'hamin.theme-prefs.v1'

function readPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

interface ThemeContextValue extends ThemePrefs {
  resolvedTheme: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
  setPalette: (p: Palette) => void
  setEasy: (v: boolean) => void
  setReducedMotion: (v: boolean) => void
  reset: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePrefs>(readPrefs)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  const resolvedTheme: 'light' | 'dark' = prefs.mode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.mode

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.setAttribute('data-pal', prefs.palette)
    root.setAttribute('data-lg-easy', prefs.easy ? 'on' : 'off')
    root.setAttribute('data-lg-motion', prefs.reducedMotion ? 'off' : 'on')
    root.style.colorScheme = resolvedTheme

    const [bg, soft, acc] = HEADER_COLORS[prefs.palette][resolvedTheme]
    root.style.setProperty('--hdr-bg', bg)
    root.style.setProperty('--hdr-soft', soft)
    root.style.setProperty('--hdr-acc', acc)
    // نوار وضعیت گوشی/مرورگر هم همان رنگ هدر را بگیرد
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolvedTheme)
  }, [resolvedTheme, prefs.palette, prefs.easy, prefs.reducedMotion])

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...prefs,
      resolvedTheme,
      setMode: (mode) => setPrefs((p) => ({ ...p, mode })),
      setPalette: (palette) => setPrefs((p) => ({ ...p, palette })),
      setEasy: (easy) => setPrefs((p) => ({ ...p, easy })),
      setReducedMotion: (reducedMotion) => setPrefs((p) => ({ ...p, reducedMotion })),
      reset: () => setPrefs(DEFAULTS),
    }),
    [prefs, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme باید داخل ThemeProvider استفاده شود')
  return ctx
}
