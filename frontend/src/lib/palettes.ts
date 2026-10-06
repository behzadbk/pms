/**
 * رنگ‌بندی‌های همین — هفت پالت لوکس (ورودی: طراحی «Best Luxury Color Palettes»).
 * هر پالت برای حالت روشن و تاریک جداگانه تنظیم شده تا کنتراست متن/دکمه همیشه خوانا بماند.
 * ThemeContext همه‌ی این توکن‌ها را روی <html> می‌نویسد؛ هدر، منوی کشویی، کارت‌ها و دکمه‌ها
 * همه از همین منبع واحد رنگ می‌گیرند.
 */

export type Palette = 'ruby' | 'sapphire' | 'candle' | 'linen' | 'rosegold' | 'emerald' | 'ocean'

export interface PaletteTokens {
  base: string // پس‌زمینه‌ی صفحه
  elevated: string // کارت/شیت
  pri: string // رنگ اصلی دکمه و تأکید
  acc: string // رنگ ثانویه
  heroA: string
  heroB: string
  hdr: string // هدر / منوی کشویی
  hdrSoft: string
  hdrAcc: string
}

export interface PaletteDef {
  id: Palette
  label: string
  /** سه رنگ نمونه برای دایره‌ی انتخاب (شروع، پایان گرادیان، رنگ تأکید) */
  swatch: [string, string, string]
  light: PaletteTokens
  dark: PaletteTokens
}

export const PALETTE_DEFS: PaletteDef[] = [
  {
    id: 'ocean',
    label: 'اقیانوس',
    swatch: ['#0a6a99', '#004E72', '#FF6E42'],
    light: { base: '#f1f5f8', elevated: '#ffffff', pri: '#004E72', acc: '#e0552c', heroA: '#0a6a99', heroB: '#004E72', hdr: '#004E72', hdrSoft: '#0b648f', hdrAcc: '#FF6E42' },
    dark: { base: '#061a24', elevated: '#0d2a38', pri: '#5bb5e0', acc: '#FF8A63', heroA: '#0a6a99', heroB: '#092634', hdr: '#092634', hdrSoft: '#103a4d', hdrAcc: '#FF6E42' },
  },
  {
    id: 'ruby',
    label: 'یاقوت',
    swatch: ['#D72638', '#9B111E', '#3F0D12'],
    light: { base: '#fcf1f0', elevated: '#ffffff', pri: '#C81F33', acc: '#8a1019', heroA: '#D72638', heroB: '#9B111E', hdr: '#9B111E', hdrSoft: '#b3202f', hdrAcc: '#ff6b78' },
    dark: { base: '#1b0a0d', elevated: '#2a1115', pri: '#f27a86', acc: '#ff9aa4', heroA: '#D72638', heroB: '#5e0b14', hdr: '#3F0D12', hdrSoft: '#58141b', hdrAcc: '#D72638' },
  },
  {
    id: 'sapphire',
    label: 'یاقوت کبود',
    swatch: ['#2f6fd6', '#0F52BA', '#000926'],
    light: { base: '#eef3fa', elevated: '#ffffff', pri: '#0F52BA', acc: '#4f7fa6', heroA: '#2f6fd6', heroB: '#0b3f94', hdr: '#0b3f94', hdrSoft: '#0F52BA', hdrAcc: '#6fa1f0' },
    dark: { base: '#030a1f', elevated: '#0b1530', pri: '#86adf7', acc: '#a6c5d7', heroA: '#0F52BA', heroB: '#001a5c', hdr: '#000926', hdrSoft: '#0a1840', hdrAcc: '#0F52BA' },
  },
  {
    id: 'candle',
    label: 'شمع',
    swatch: ['#9a3a36', '#7D2826', '#898861'],
    light: { base: '#f6f2e6', elevated: '#fffdf7', pri: '#7D2826', acc: '#6b6a48', heroA: '#9a3a36', heroB: '#7D2826', hdr: '#343723', hdrSoft: '#4a4e33', hdrAcc: '#a9a77c' },
    dark: { base: '#14160d', elevated: '#20241a', pri: '#e3978f', acc: '#b4b28a', heroA: '#8a2f2c', heroB: '#4a1514', hdr: '#1b1d12', hdrSoft: '#2b2f1e', hdrAcc: '#898861' },
  },
  {
    id: 'linen',
    label: 'کتان',
    swatch: ['#FF6D1F', '#D4500A', '#222222'],
    light: { base: '#faf5e8', elevated: '#fffdf8', pri: '#D4500A', acc: '#222222', heroA: '#FF6D1F', heroB: '#D4500A', hdr: '#222222', hdrSoft: '#343434', hdrAcc: '#FF6D1F' },
    dark: { base: '#141414', elevated: '#222222', pri: '#ff8f55', acc: '#f5e7c6', heroA: '#FF6D1F', heroB: '#a8400c', hdr: '#111111', hdrSoft: '#262626', hdrAcc: '#FF6D1F' },
  },
  {
    id: 'rosegold',
    label: 'رزگلد',
    swatch: ['#B66E79', '#8C4E4F', '#3B1F1B'],
    light: { base: '#fcf1f2', elevated: '#ffffff', pri: '#9E5560', acc: '#8C4E4F', heroA: '#B66E79', heroB: '#8C4E4F', hdr: '#3B1F1B', hdrSoft: '#5a3330', hdrAcc: '#d596a0' },
    dark: { base: '#1a0f0e', elevated: '#281816', pri: '#e3a5ae', acc: '#d596a0', heroA: '#B66E79', heroB: '#5a2f2e', hdr: '#231210', hdrSoft: '#3b2220', hdrAcc: '#B66E79' },
  },
  {
    id: 'emerald',
    label: 'زمرد',
    swatch: ['#2FA463', '#0B6E4F', '#013220'],
    light: { base: '#edf8f4', elevated: '#ffffff', pri: '#0B6E4F', acc: '#2a9a5d', heroA: '#2FA463', heroB: '#0B6E4F', hdr: '#013220', hdrSoft: '#0a4a35', hdrAcc: '#50C878' },
    dark: { base: '#04140d', elevated: '#0b2418', pri: '#62d994', acc: '#50C878', heroA: '#0B6E4F', heroB: '#013220', hdr: '#01180f', hdrSoft: '#052a1c', hdrAcc: '#50C878' },
  },
]

export const DEFAULT_PALETTE: Palette = 'ocean'

/** شناسه‌های قدیمی (قبل از پالت‌های جدید) که ممکن است در localStorage کاربران مانده باشد */
const LEGACY: Record<string, Palette> = {
  teal: 'ocean', // «teal» پیش‌فرض قدیمیِ ذخیره‌شده بود، نه انتخاب کاربر → پیش‌فرض فعلی (قبلاً سبزِ زمرد می‌شد)
  blue: 'sapphire',
  violet: 'sapphire',
  coral: 'linen',
  rose: 'rosegold',
  graphite: 'ocean',
}

export function normalizePalette(id: unknown): Palette {
  if (typeof id === 'string') {
    if (PALETTE_DEFS.some((p) => p.id === id)) return id as Palette
    if (LEGACY[id]) return LEGACY[id]
  }
  return DEFAULT_PALETTE
}

export function paletteDef(id: Palette): PaletteDef {
  return PALETTE_DEFS.find((p) => p.id === id) ?? PALETTE_DEFS[0]
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** نسبت کنتراست WCAG بین دو رنگ هگز */
function lum(hex: string): number {
  const f = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = rgb(hex)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** رنگ متن خوانا (سفید یا تقریباً مشکی) روی یک پس‌زمینه‌ی رنگی */
export function readableOn(bg: string): string {
  const L = lum(bg)
  const white = 1.05 / (L + 0.05)
  const dark = (L + 0.05) / 0.055
  return white >= dark ? '#ffffff' : '#0b1620'
}
const a = (hex: string, alpha: number) => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** همه‌ی CSS variable هایی که یک پالت/حالت باید بنویسد */
export function paletteVars(id: Palette, mode: 'light' | 'dark'): Record<string, string> {
  const t = paletteDef(id)[mode]
  const dark = mode === 'dark'
  const vars: Record<string, string> = {
    '--hdr-bg': t.hdr,
    '--hdr-soft': t.hdrSoft,
    '--hdr-acc': t.hdrAcc,
    '--hdr-acc-fg': readableOn(t.hdrAcc),
    // متن روی دکمه/تگ رنگ اصلی و رنگ برس (در حالت تیره رنگ اصلی روشن است و متن سفید ناخوانا می‌شود)
    '--on-pri': readableOn(t.pri),
    '--on-acc': readableOn(t.acc),
    '--lg-bg-base': t.base,
    '--lg-bg-elevated': t.elevated,
    '--color-canvas': t.base,
    '--color-card': t.elevated,
    '--lg-primary': t.pri,
    '--lg-primary-hover': t.pri,
    '--lg-primary-soft': a(t.pri, dark ? 0.18 : 0.1),
    '--lg-accent': t.acc,
    '--lg-accent-soft': a(t.acc, dark ? 0.18 : 0.12),
    '--color-tile': t.pri,
    '--color-tile-soft': a(t.pri, dark ? 0.18 : 0.1),
    '--color-ink': t.hdr,
    '--color-ink-soft': t.hdrSoft,
    '--lg4-pri': t.pri,
    '--lg4-acc': t.acc,
    '--lg4-hero-a': t.heroA,
    '--lg4-hero-b': t.heroB,
  }
  if (dark) {
    vars['--lg4-card'] = a(t.elevated, 0.72)
    vars['--lg4-bar'] = a(t.elevated, 0.7)
    vars['--lg4-sheet'] = a(t.elevated, 0.92)
    vars['--lg4-fade'] = a(t.base, 0.78)
  } else {
    vars['--lg4-card'] = a(t.elevated, 0.62)
    vars['--lg4-bar'] = a(t.elevated, 0.6)
    vars['--lg4-sheet'] = a(t.elevated, 0.88)
    vars['--lg4-fade'] = a(t.base, 0.8)
  }
  return vars
}
