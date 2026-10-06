/**
 * تشخیص خودکار دسته‌ی خرابی و تجهیز مرتبط از روی متن تیکت (کلیدواژه + شباهت نام/محل).
 * منطق همان است که پیش‌تر در استور دمو بود و اکنون سمت سرور اجرا می‌شود.
 */
export type AssetCategory = 'elevator' | 'lighting' | 'plumbing' | 'hvac' | 'fire' | 'electrical' | 'door' | 'other'

export const ASSET_CATEGORIES: AssetCategory[] = ['elevator', 'lighting', 'plumbing', 'hvac', 'fire', 'electrical', 'door', 'other']

export const CATEGORY_INFO: Record<AssetCategory, { label: string; keywords: string[] }> = {
  elevator: { label: 'آسانسور', keywords: ['آسانسور', 'اسانسور', 'بالابر', 'کابین'] },
  lighting: { label: 'روشنایی', keywords: ['چراغ', 'لامپ', 'مهتابی', 'روشنایی', 'پرژکتور', 'ال‌ای‌دی', 'led'] },
  plumbing: { label: 'لوله‌کشی و آب', keywords: ['نشتی', 'لوله', 'آب', 'فاضلاب', 'شیر', 'چکه', 'پمپ'] },
  hvac: { label: 'موتورخانه و تهویه', keywords: ['موتورخانه', 'پکیج', 'شوفاژ', 'چیلر', 'کولر', 'گرمایش', 'تهویه', 'رادیاتور'] },
  fire: { label: 'اطفا حریق', keywords: ['کپسول', 'آتش', 'حریق', 'اسپرینکلر', 'دتکتور'] },
  electrical: { label: 'برق', keywords: ['برق', 'فیوز', 'کنتور', 'پریز', 'سیم', 'تابلو برق'] },
  door: { label: 'درب و ورودی', keywords: ['درب', 'راهبند', 'جک', 'قفل', 'آیفون'] },
  other: { label: 'سایر', keywords: [] },
}

export interface AssetLite {
  id: string
  name: string
  category: string
  location: string | null
}

export function detectCategory(text: string): AssetCategory | null {
  const t = ` ${text.toLowerCase()} `
  let best: { cat: AssetCategory; score: number } | null = null
  for (const cat of ASSET_CATEGORIES) {
    const score = CATEGORY_INFO[cat].keywords.filter((k) => t.includes(k.toLowerCase())).length
    if (score > 0 && (!best || score > best.score)) best = { cat, score }
  }
  return best?.cat ?? null
}

const normalize = (x: string) => x.replace(/[‌\s\-–—]+/g, ' ').trim()

/**
 * اول دارایی انتخاب‌شده‌ی دستی، بعد دسته + شباهت نام/محل. متن اصلی معیار است؛ محل فقط
 * برای شکستن تساوی (وگرنه «بلوک A» در محل، «آسانسور B» را با «آسانسور A» اشتباه می‌گیرد).
 */
export function matchAsset(
  t: { subject: string; body?: string | null; location?: string | null; assetId?: string | null },
  assets: AssetLite[],
): { category: AssetCategory | null; asset: AssetLite | null; candidates: AssetLite[] } {
  const text = normalize(`${t.subject} ${t.body ?? ''}`)
  const loc = normalize(t.location ?? '')
  const detected = detectCategory(text) ?? (loc ? detectCategory(loc) : null)
  const chosen = t.assetId ? assets.find((a) => a.id === t.assetId) ?? null : null
  const category = (chosen?.category as AssetCategory | undefined) ?? detected
  const candidates = category ? assets.filter((a) => a.category === category) : []
  if (t.assetId) return { category, asset: chosen, candidates }

  const hits = (hay: string, words: string[]) => words.filter((w) => hay.includes(w)).length
  let asset: AssetLite | null = null
  let bestScore = 0
  for (const a of candidates) {
    // حرف تکی (مثل «B» در آسانسور B) جدا بررسی می‌شود تا با حروف دیگر اشتباه نشود
    const letter = a.name.match(/\s([A-Za-z])$/)?.[1]
    const words = normalize(`${a.name} ${a.location ?? ''}`).split(' ').filter((w) => w.length > 1)
    const letterHit = letter ? new RegExp(`(^|\\s)${letter}(\\s|$)`).test(text) : false
    // امتیاز شباهت دارایی به متن تیکت:
    //   + هر کلمه‌ی نام/محلِ دارایی که در متن اصلی بیاید = ۱ امتیاز
    //   + اگر حرف تکیِ نام (مثل B در «آسانسور B») در متن باشد = ۲ امتیاز بونوس؛ اگر دارایی حرف دارد ولی در متن نیست = ۲ جریمه
    //     (تا «آسانسور A» برای تیکتِ «آسانسور B» انتخاب نشود)
    //   + کلمه‌های «محل» فقط نصف وزن دارند و برای شکستن تساوی‌اند، نه معیار اصلی
    const total = hits(text, words) + (letterHit ? 2 : 0) - (letter && !letterHit ? 2 : 0) + 0.5 * hits(loc, words)
    if (total > bestScore) {
      bestScore = total
      asset = a
    }
  }
  // وقتی چند کاندید داریم و بهترین امتیاز ضعیف است (<۲) حدس نمی‌زنیم: asset = null می‌شود
  // و کاربر/مسئول از میان candidates انتخاب می‌کند؛ حدس غلط بدتر از حدس‌نزدن است.
  if (asset && bestScore < 2 && candidates.length > 1) asset = null
  // تنها یک دارایی در این دسته وجود دارد ⇒ ابهامی نیست، حتی با امتیاز صفر همان را انتخاب کن.
  if (!asset && candidates.length === 1) asset = candidates[0]
  return { category, asset, candidates }
}
