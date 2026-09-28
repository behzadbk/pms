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
