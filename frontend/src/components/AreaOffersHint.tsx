import { useEffect, useState } from 'react'
import { Gift } from 'lucide-react'
import { entitlementsApi, type AreaPreview } from '../lib/api/entitlements'
import { qty } from '../lib/entitlementsFmt'

/**
 * پیش‌نمایش زنده‌ی آفرهای رایگان بر اساس متراژ، هنگام تعریف/ویرایش واحد.
 * سهمیه‌ها پس از ذخیره‌ی متراژ خودکار برای واحد اعمال می‌شود. اگر دسترسی نباشد یا آفری تعریف نشده باشد، چیزی نمایش داده نمی‌شود.
 */
export function AreaOffersHint({ area }: { area: number }) {
  const [data, setData] = useState<AreaPreview | null>(null)

  useEffect(() => {
    if (!Number.isFinite(area) || area <= 0) {
      setData(null)
      return
    }
    let stale = false
    const t = setTimeout(() => {
      entitlementsApi.preview(area).then((r) => !stale && setData(r)).catch(() => !stale && setData(null))
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [area])

  if (!data?.tier || data.quotas.length === 0) return null
  return (
    <div className="mx-2 rounded-2xl bg-[var(--hm-pri-soft,rgba(0,0,0,0.04))] px-4 py-3 text-xs leading-6 text-[var(--hm-t2)]">
      <p className="flex items-center gap-1.5 font-bold text-[var(--hm-t1)]">
        <Gift size={14} /> آفرهای این واحد — سطح {data.tier.name}
      </p>
      {data.tier_match === 'below_min' && <p className="mt-0.5">متراژ کمتر از کوچک‌ترین سطح است؛ سهمیه‌ی کوچک‌ترین سطح اعمال می‌شود.</p>}
      <p className="mt-1">
        {data.quotas.map((q) => `${q.title}: ${qty(q.included)} ${q.unit_label}${q.period_type === 'year' ? ' در سال' : ' در ماه'}`).join(' · ')}
      </p>
    </div>
  )
}
