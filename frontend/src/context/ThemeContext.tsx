import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * شخصی‌سازی ظاهر همین — بخش «Settings · Personalization» طراحی Liquid Glass نسخه ۴.
 * حالت نمایش (روشن/تاریک/سیستم)، رنگ‌بندی و حالت آسان (بزرگ‌نمایی + رابط ساده‌شده برای
 * ساکنان مسن‌تر) را روی <html> به‌صورت data-attribute تنظیم می‌کند تا liquid-glass.css
 * توکن‌های متناظر را اعمال کند. تنظیمات در localStorage ذخیره و بین جلسات حفظ می‌شود.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
import { PALETTE_DEFS, DEFAULT_PALETTE, normalizePalette, paletteVars, paletteDef, type Palette } from '../lib/palettes'

export type { Palette }
export const PALETTES = PALETTE_DEFS.map((p) => ({ id: p.id, label: p.label, swatch: p.swatch }))

interface ThemePrefs {
  mode: ThemeMode
  palette: Palette
  easy: boolean
}

const DEFAULTS: ThemePrefs = { mode: 'system', palette: DEFAULT_PALETTE, easy: false }
const STORAGE_KEY = 'hamin.theme-prefs.v1'

function readPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw)
    // reducedMotion گزینه‌ی حذف‌شده است؛ اگر در ذخیره‌ی قدیمی مانده، نادیده گرفته می‌شود
    return { mode: p.mode ?? DEFAULTS.mode, palette: normalizePalette(p.palette), easy: p.easy === true }
  } catch {
    return DEFAULTS
  }
}

interface ThemeContextValue extends ThemePrefs {
  resolvedTheme: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
  setPalette: (p: Palette) => void
  setEasy: (v: boolean) => void
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
    root.removeAttribute('data-lg-motion')
    root.style.colorScheme = resolvedTheme

    // همه‌ی توکن‌های رنگ پالت (هدر، کارت، دکمه، قهرمان) از یک منبع
    const vars = paletteVars(prefs.palette, resolvedTheme)
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    // نوار وضعیت گوشی/مرورگر هم همان رنگ هدر را بگیرد
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paletteDef(prefs.palette)[resolvedTheme].hdr)
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolvedTheme)
  }, [resolvedTheme, prefs.palette, prefs.easy])

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...prefs,
      resolvedTheme,
      setMode: (mode) => setPrefs((p) => ({ ...p, mode })),
      setPalette: (palette) => setPrefs((p) => ({ ...p, palette })),
      setEasy: (easy) => setPrefs((p) => ({ ...p, easy })),
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
