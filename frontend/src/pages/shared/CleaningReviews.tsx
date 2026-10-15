import { useCallback, useEffect, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { ErrorBlock, Loading } from '../../components/hm'
import { StarsView } from '../../components/CleaningRating'
import { cleaningFeedbackApi, type CleanerSummary, type FeedbackItem, type FeedbackReason } from '../../lib/api/cleaning'
import { errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { tehranParts } from '../../lib/tehran'

const when = (iso: string) => {
  const p = tehranParts(iso)
  return `${formatJalali(p.date, false)} · ${fa(String(p.hour).padStart(2, '0'))}:${fa(String(p.minute).padStart(2, '0'))}`
}
const avgText = (n: number) => fa(n.toFixed(1).replace(/\.0$/, '')).replace('.', '٫')

/**
 * بازخورد ساکنان از نظافت منازل — برای مدیر ساختمان (/admin/cleaning-feedback) و مسئول نظافت (/staff/cleaning-reviews).
 * بالا: میانگین ۹۰ روز اخیر هر نظافتچی (کم‌امتیازها اول)؛ پایین: بازخوردها با دلیل و متن ساکن.
 */
export function CleaningReviews() {
  const [data, setData] = useState<{ summary: CleanerSummary[]; items: FeedbackItem[]; reasons: FeedbackReason[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [low, setLow] = useState(false)
  const [cleaner, setCleaner] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await cleaningFeedbackApi.list({ low, cleanerId: cleaner ?? undefined, limit: 100 }))
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت بازخوردها ناموفق بود'))
    }
  }, [low, cleaner])
  useEffect(() => { void load() }, [load])

  if (error && !data) return <ErrorBlock message={error} retry={load} />
  if (!data) return <Loading />
  const label = (code: string) => data.reasons.find((r) => r.code === code)?.label ?? code

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">بازخورد نظافت منازل</h1>
        <p className="text-muted text-sm mt-1">نمره و نظر ساکنان بعد از هر نظافت. بازخورد بد (۱ تا ۳ ستاره) برای شما اعلان هم می‌شود.</p>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <p className="text-sm font-semibold">میانگین ۹۰ روز اخیر</p>
          {data.summary.length === 0 ? (
            <p className="text-sm text-muted py-3">هنوز بازخوردی ثبت نشده است</p>
          ) : (
            <div className="space-y-2">
              {data.summary.map((s) => (
                <button
                  key={s.cleaner_id}
                  type="button"
                  onClick={() => setCleaner(cleaner === s.cleaner_id ? null : s.cleaner_id)}
                  aria-pressed={cleaner === s.cleaner_id}
                  className={`w-full min-h-[60px] rounded-2xl border px-4 py-3 flex items-center gap-3 text-right ${cleaner === s.cleaner_id ? 'border-tile bg-tile/5' : 'border-line bg-card'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.cleaner_name ?? 'نظافتچی'}</p>
                    <p className="text-xs text-muted mt-0.5">{fa(s.count)} نظر{s.low_count > 0 && <span className="text-bad"> · {fa(s.low_count)} بد</span>}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-lg font-extrabold">{avgText(s.average)}</p>
                    <StarsView value={s.average} size={13} />
                  </div>
                </button>
              ))}
            </div>
          )}
          {cleaner && <button type="button" onClick={() => setCleaner(null)} className="text-sm text-tile font-medium">نمایش همه‌ی نظافتچی‌ها</button>}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/5 max-w-xs" role="group" aria-label="فیلتر">
        {([[false, 'همه'], [true, 'فقط بدها']] as const).map(([v, t]) => (
          <button key={t} type="button" aria-pressed={low === v} onClick={() => setLow(v)} className={`min-h-[42px] rounded-xl text-sm ${low === v ? 'bg-card shadow font-bold' : 'text-muted font-medium'}`}>{t}</button>
        ))}
      </div>

      {data.items.length === 0 ? (
        <Card><p className="p-10 text-center text-sm text-muted">{low ? 'بازخورد بدی ثبت نشده است' : 'هنوز بازخوردی ثبت نشده است'}</p></Card>
      ) : (
        <div className="space-y-2.5">
          {data.items.map((i) => (
            <Card key={i.id}>
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <StarsView value={i.rating} size={18} />
                  <span className="text-xs text-muted">{when(i.created_at)}</span>
                </div>
                <p className="text-sm">
                  واحد <b>{fa(i.unit_number)}</b>
                  {i.cleaner_name && <> · نظافتچی: <b>{i.cleaner_name}</b></>}
                  <span className="text-muted"> · {fa(i.minutes)} دقیقه</span>
                </p>
                {i.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {i.reasons.map((r) => <span key={r} className="text-xs rounded-full bg-bad-soft text-bad px-3 py-1.5">{label(r)}</span>)}
                  </div>
                )}
                {i.comment && (
                  <p className="text-sm leading-7 bg-[var(--lg-bg-base)] rounded-xl px-3.5 py-2.5 flex gap-2">
                    <MessageSquareWarning size={16} className="shrink-0 mt-1.5 text-muted" />
                    <span>{i.comment}</span>
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
