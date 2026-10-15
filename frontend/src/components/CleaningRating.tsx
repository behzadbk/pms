import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Sparkles, Star } from 'lucide-react'
import { Card } from './ui/Card'
import { cleaningFeedbackApi, type FeedbackReason, type PendingCleaning } from '../lib/api/cleaning'
import { errText, fa } from '../lib/api/residents'
import { formatJalali } from '../lib/jalali'
import { tehranParts } from '../lib/tehran'

export const RATING_WORD: Record<number, string> = { 1: 'خیلی بد', 2: 'ضعیف', 3: 'متوسط', 4: 'خوب', 5: 'عالی' }

/** ردیف ستاره‌ی فقط‌نمایشی (برای فهرست بازخوردها) */
export function StarsView({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-warn" role="img" aria-label={`${fa(value)} از ۵ ستاره`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-current' : 'opacity-30'} />
      ))}
    </span>
  )
}

const when = (iso: string) => {
  const p = tehranParts(iso)
  return `${formatJalali(p.date, false)} · ${fa(String(p.hour).padStart(2, '0'))}:${fa(String(p.minute).padStart(2, '0'))}`
}

function RateOne({ item, reasons, onDone }: { item: PendingCleaning; reasons: FeedbackReason[]; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [thanks, setThanks] = useState(false)

  const low = rating > 0 && rating <= 3

  async function send(r: number, rs: string[] = [], c = '') {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await cleaningFeedbackApi.submit(item.session_id, { rating: r, reasons: rs, comment: c.trim() || undefined })
      setThanks(true)
      window.setTimeout(onDone, 2200)
    } catch (e) {
      setErr(errText(e, 'ثبت نظر ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  function pick(n: number) {
    setRating(n)
    setErr('')
    if (n >= 4) void send(n) // نمره‌ی خوب: فقط یک لمس
  }

  if (thanks) {
    return (
      <Card>
        <div className="p-6 text-center space-y-2">
          <CheckCircle2 size={36} className="mx-auto text-good" />
          <p className="font-bold">ممنون از نظرتان</p>
          <p className="text-xs text-muted">{rating <= 3 ? 'بازخورد شما به مسئول نظافت رسید و پیگیری می‌شود.' : 'نظر شما ثبت شد.'}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-tile/15 text-tile flex items-center justify-center shrink-0"><Sparkles size={20} /></div>
          <div>
            <p className="font-bold">نظافت منزل شما انجام شد؛ چطور بود؟</p>
            <p className="text-xs text-muted mt-0.5">{when(item.started_at)} · {fa(item.minutes)} دقیقه</p>
          </div>
        </div>

        <div className="flex justify-between gap-1.5" role="group" aria-label="نمره به نظافت">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => pick(n)}
              aria-label={`${fa(n)} ستاره، ${RATING_WORD[n]}`}
              aria-pressed={rating === n}
              className={`flex-1 min-h-[56px] rounded-2xl border flex items-center justify-center transition active:scale-95 disabled:opacity-60 ${n <= rating ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-card text-muted'}`}
            >
              <Star size={28} className={n <= rating ? 'fill-current' : ''} />
            </button>
          ))}
        </div>
        <p className="text-center text-sm min-h-[20px] font-medium">{rating ? RATING_WORD[rating] : <span className="text-muted font-normal">با لمس ستاره نمره بدهید</span>}</p>

        {low && (
          <div className="space-y-3">
            <p className="text-sm font-medium">مشکل چه بود؟ <span className="text-muted font-normal">(یک یا چند مورد)</span></p>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => {
                const on = picked.includes(r.code)
                return (
                  <button
                    key={r.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== r.code) : [...p, r.code]))}
                    className={`min-h-[44px] px-4 rounded-full border text-sm ${on ? 'border-tile bg-tile text-white font-medium' : 'border-line bg-card'}`}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="یا خودتان بنویسید…"
              aria-label="توضیح"
              className="w-full rounded-2xl border border-line px-4 py-3 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile"
            />
            {err && <p className="text-sm text-bad" role="alert">{err}</p>}
            <button
              type="button"
              onClick={() => void send(rating, picked, comment)}
              disabled={busy || (picked.length === 0 && !comment.trim())}
              className="w-full min-h-[52px] rounded-2xl bg-tile text-white font-bold disabled:opacity-50"
            >
              {busy ? 'در حال ثبت…' : 'ثبت نظر'}
            </button>
            {picked.length === 0 && !comment.trim() && <p className="text-xs text-muted text-center">برای ثبت، یک دلیل را انتخاب کنید یا بنویسید</p>}
          </div>
        )}
        {!low && err && <p className="text-sm text-bad" role="alert">{err}</p>}
      </div>
    </Card>
  )
}

/** کارت‌های «نظافت منزل شما چطور بود؟»؛ اگر نظافتِ بدون نمره‌ای نباشد چیزی نشان نمی‌دهد */
export function CleaningRatingCards() {
  const [pending, setPending] = useState<PendingCleaning[]>([])
  const [reasons, setReasons] = useState<FeedbackReason[]>([])

  const load = useCallback(async () => {
    try {
      const r = await cleaningFeedbackApi.pending()
      setPending(r.pending)
      setReasons(r.reasons)
    } catch {
      /* این کارت جانبی است؛ خطایش صفحه را خراب نکند */
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (pending.length === 0) return null
  return (
    <div className="space-y-3">
      {pending.map((p) => (
        <RateOne key={p.session_id} item={p} reasons={reasons} onDone={() => setPending((l) => l.filter((x) => x.session_id !== p.session_id))} />
      ))}
    </div>
  )
}
