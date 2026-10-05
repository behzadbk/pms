import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, Ban } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { ErrorBlock, Loading } from '../../components/hm'
import { guardApi, type GuestPass } from '../../lib/api/guard'
import { errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { addDays, tehranParts, tehranToday, weekdayIndex } from '../../lib/tehran'

type Validity = 'today' | 'week' | 'custom'

const STATUS: Record<GuestPass['status'], { label: string; cls: string }> = {
  active: { label: 'فعال', cls: 'bg-good-soft text-good' },
  used: { label: 'استفاده‌شده', cls: 'bg-canvas text-muted' },
  expired: { label: 'منقضی', cls: 'bg-canvas text-muted' },
  revoked: { label: 'باطل‌شده', cls: 'bg-bad-soft text-bad' },
}

/** پایان روز به وقت تهران (UTC+03:30، بدون ساعت تابستانی) */
const endOfDay = (isoDate: string) => `${isoDate}T23:59:00+03:30`

function untilFor(v: Validity, days: number): string {
  const today = tehranToday()
  if (v === 'today') return endOfDay(today)
  // هفته‌ی ایرانی شنبه تا جمعه است؛ weekdayIndex شنبه = ۰
  if (v === 'week') return endOfDay(addDays(today, Math.max(0, 6 - weekdayIndex(today))))
  return endOfDay(addDays(today, Math.min(Math.max(days, 1), 30) - 1))
}

const whenLabel = (iso: string) => {
  const p = tehranParts(iso)
  return `${formatJalali(p.date, false)} ${fa(String(p.hour).padStart(2, '0'))}:${fa(String(p.minute).padStart(2, '0'))}`
}

export function ResidentGuestPass() {
  const [name, setName] = useState('')
  const [validity, setValidity] = useState<Validity>('today')
  const [days, setDays] = useState(3)
  const [maxUses, setMaxUses] = useState(1)
  const [passes, setPasses] = useState<GuestPass[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<GuestPass | null>(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = useCallback(async () => {
    try {
      setPasses(await guardApi.myPasses())
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت کدها ناموفق بود'))
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(load, 20_000) // تا ورود مهمان و تغییر وضعیت کد دیده شود
    return () => clearInterval(t)
  }, [load])

  async function handleIssue() {
    if (!name.trim()) return
    setBusy(true)
    setFormErr('')
    try {
      const p = await guardApi.issuePass({ guestName: name.trim(), validUntil: untilFor(validity, days), maxUses })
      setShown(p)
      setName('')
      await load()
    } catch (e) {
      setFormErr(errText(e, 'صدور کد ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    try {
      await guardApi.revokePass(id)
      if (shown?.id === id) setShown(null)
      await load()
    } catch (e) {
      setFormErr(errText(e))
    }
  }

  if (error && !passes) return <ErrorBlock message={error} retry={load} />
  if (!passes) return <Loading />

  const inputCls = 'mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm bg-card min-h-[46px] focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">صدور کد مهمان</h1>
        <p className="text-muted text-sm mt-1">برای مهمانان خود یک کد ورود صادر کنید؛ نگهبان با اسکن یا ورود کد، ورودشان را ثبت می‌کند و به شما اطلاع می‌رسد</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="دعوت مهمان جدید" />
          <div className="px-5 pb-5 space-y-4">
            <label className="block">
              <span className="text-xs text-muted">نام مهمان</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="مثلاً آرش محمدی" className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted">بازه اعتبار</span>
                <select value={validity} onChange={(e) => setValidity(e.target.value as Validity)} className={inputCls}>
                  <option value="today">فقط امروز</option>
                  <option value="week">تا پایان هفته</option>
                  <option value="custom">چند روز</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted">دفعات ورود</span>
                <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={inputCls}>
                  {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n === 1 ? 'یک‌بار' : `${fa(n)} بار`}</option>)}
                </select>
              </label>
            </div>
            {validity === 'custom' && (
              <label className="block">
                <span className="text-xs text-muted">تعداد روز (از امروز، حداکثر ۳۰)</span>
                <input value={days} inputMode="numeric" onChange={(e) => setDays(Number(e.target.value.replace(/[^\d]/g, '')) || 1)} className={inputCls} />
              </label>
            )}
            {formErr && <p className="text-sm text-bad">{formErr}</p>}
            <button onClick={handleIssue} disabled={busy || !name.trim()} className="w-full flex items-center justify-center gap-2 bg-tile text-white py-3 rounded-xl text-sm font-medium hover:opacity-90 min-h-[48px] disabled:opacity-50">
              <QrCode size={16} />
              {busy ? 'در حال صدور…' : 'صدور کد ورود'}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader title="کد صادرشده" />
          <div className="px-5 pb-6 flex flex-col items-center justify-center min-h-[220px]">
            {shown ? (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-white rounded-xl border border-line">
                  <QRCodeSVG value={`guest-pass:${shown.code}`} size={140} fgColor="#16324F" />
                </div>
                <p className="text-sm font-medium">{shown.guest_name}</p>
                <p className="text-xs text-muted">کد عددی: <span className="font-mono text-ink-text text-base">{fa(shown.code)}</span></p>
                <p className="text-xs text-muted">اعتبار تا {whenLabel(shown.valid_until)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted text-center">پس از صدور (یا انتخاب یک کد از سوابق)، کد QR و عددی مهمان اینجا نمایش داده می‌شود</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="سوابق کدهای مهمان" />
        <div className="px-5 pb-5 space-y-3">
          {passes.length === 0 && <p className="text-sm text-muted text-center py-6">هنوز کدی صادر نکرده‌اید</p>}
          {passes.map((g) => {
            const st = STATUS[g.status]
            return (
              <div key={g.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line flex-wrap">
                <button onClick={() => setShown(g)} className="text-right min-w-0 flex-1">
                  <p className="text-sm font-medium">{g.guest_name}</p>
                  <p className="text-xs text-muted mt-0.5">
                    کد: <span className="font-mono">{fa(g.code)}</span> · اعتبار تا {whenLabel(g.valid_until)} · ورود {fa(g.uses_count)} از {fa(g.max_uses)}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  {g.status === 'active' && (
                    <button onClick={() => revoke(g.id)} className="flex items-center gap-1 text-xs text-bad px-2.5 py-2 rounded-lg hover:bg-bad-soft min-h-[40px]" aria-label={`ابطال کد ${g.guest_name}`}>
                      <Ban size={13} /> ابطال
                    </button>
                  )}
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
