import { useCallback, useEffect, useState } from 'react'
import { Camera, CheckCircle2, QrCode, Search, XCircle, Ban, ClipboardPlus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { entitlementsApi, type DeskUnit, type ScanResult, type UnitSummary, type UsageEvent } from '../../lib/api/entitlements'
import { errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { tehranParts } from '../../lib/tehran'
import { useQrScanner } from '../../lib/useQrScanner'
import { money, qty, qtyUnit, usedPct } from '../../lib/entitlementsFmt'

type Tab = 'scan' | 'usage'

const inputCls = 'w-full rounded-xl border border-line px-3.5 py-2.5 text-sm bg-card min-h-[46px] focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile'

const whenLabel = (iso: string) => {
  const p = tehranParts(iso)
  return `${formatJalali(p.date, false)} ${fa(String(p.hour).padStart(2, '0'))}:${fa(String(p.minute).padStart(2, '0'))}`
}

/* ───────────── اسکن بلیت QR مهمان ───────────── */

function ScanTab() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [err, setErr] = useState('')

  async function submit(raw: string) {
    const c = raw.trim()
    if (!c || busy) return
    setBusy(true)
    setErr('')
    setResult(null)
    try {
      setResult(await entitlementsApi.scan(c))
      setCode('')
    } catch (e) {
      setErr(errText(e, 'بررسی بلیت ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }
  const scanner = useQrScanner((v) => void submit(v))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card>
        <CardHeader title="اسکن بلیت مهمان" />
        <div className="px-5 pb-5 space-y-4">
          {scanner.active ? (
            <div className="rounded-xl overflow-hidden bg-black relative">
              <video ref={scanner.videoRef} muted playsInline className="w-full max-h-64 object-cover" />
              <button onClick={() => scanner.setActive(false)} className="absolute top-2 left-2 bg-white/90 text-xs px-3 py-1.5 rounded-lg">بستن دوربین</button>
            </div>
          ) : scanner.supported ? (
            <button onClick={() => scanner.setActive(true)} className="w-full border-2 border-dashed border-line rounded-xl flex flex-col items-center justify-center py-8 text-muted gap-2 hover:border-tile hover:text-tile min-h-[120px]">
              <Camera size={30} />
              <span className="text-xs">اسکن QR با دوربین</span>
              {scanner.cameraErr && <span className="text-xs text-bad">{scanner.cameraErr}</span>}
            </button>
          ) : (
            <div className="border-2 border-dashed border-line rounded-xl flex flex-col items-center justify-center py-8 text-muted gap-2">
              <QrCode size={32} />
              <p className="text-xs text-center px-4">اسکن با دوربین در این مرورگر پشتیبانی نمی‌شود؛ متن کد بلیت را وارد کنید.</p>
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(code) }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد بلیت (ent-guest:…)" dir="ltr" maxLength={100} className={`${inputCls} flex-1 min-w-0 font-mono`} />
            <button type="submit" disabled={busy || !code.trim()} className="bg-tile text-white px-5 rounded-xl text-sm font-medium hover:opacity-90 min-h-[46px] disabled:opacity-50">ثبت ورود</button>
          </form>
          <p className="text-xs text-muted leading-6">با اسکن موفق، ورود همان لحظه ثبت و از سهمیه‌ی واحد کم می‌شود؛ هر بلیت فقط یک‌بار قابل استفاده است.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="نتیجه" />
        <div className="px-5 pb-6 flex flex-col items-center justify-center min-h-[220px] text-center" aria-live="polite">
          {!result && !err && <p className="text-sm text-muted">پس از اسکن، نتیجه اینجا نمایش داده می‌شود</p>}
          {err && (
            <div className="flex flex-col items-center gap-3">
              <XCircle size={44} className="text-bad" />
              <p className="font-semibold text-bad text-sm leading-7">{err}</p>
            </div>
          )}
          {result && (
            <div className="flex flex-col items-center gap-2.5">
              <CheckCircle2 size={44} className="text-good" />
              <p className="font-semibold text-good">ورود ثبت شد</p>
              <p className="text-sm">{result.guest_name} — مهمان واحد {fa(result.unit_number)}</p>
              <p className="text-xs text-muted">{result.service_title}</p>
              {result.charged ? (
                <p className="text-sm font-medium text-warn bg-warn-soft rounded-xl px-3.5 py-2.5">سهمیه تمام شده؛ {money(result.amount)} به شارژ واحد اضافه می‌شود</p>
              ) : (
                <p className="text-sm font-medium text-good bg-good-soft rounded-xl px-3.5 py-2.5">
                  رایگان — {result.remaining === null ? '' : `${qtyUnit(result.remaining, result.unit_label)} از سهمیه‌ی ماه باقی مانده`}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ───────────── ثبت دستی مصرف ───────────── */

function UsageTab() {
  const [q, setQ] = useState('')
  const [units, setUnits] = useState<DeskUnit[]>([])
  const [unit, setUnit] = useState<DeskUnit | null>(null)
  const [sum, setSum] = useState<UnitSummary | null>(null)
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [serviceCode, setServiceCode] = useState('')
  const [variant, setVariant] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (unit) return
    const t = setTimeout(() => {
      entitlementsApi.deskUnits(q).then(setUnits).catch(() => setUnits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, unit])

  const loadUnit = useCallback(async (u: DeskUnit) => {
    try {
      const [s, e] = await Promise.all([entitlementsApi.deskSummary(u.id), entitlementsApi.deskEvents({ unitId: u.id, limit: 15 })])
      setSum(s)
      setEvents(e)
    } catch (e) {
      setErr(errText(e, 'دریافت اطلاعات واحد ناموفق بود'))
    }
  }, [])

  function pick(u: DeskUnit) {
    setUnit(u)
    setSum(null)
    setEvents([])
    setOkMsg('')
    setErr('')
    void loadUnit(u)
  }

  const service = sum?.services.find((s) => s.code === serviceCode) ?? null

  async function submit() {
    if (!unit || !service) return
    const n = Number(quantity.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace('٫', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setErr('مقدار مصرف را درست وارد کنید')
      return
    }
    setBusy(true)
    setErr('')
    setOkMsg('')
    try {
      const r = await entitlementsApi.record({ unitId: unit.id, serviceCode: service.code, variantCode: variant || undefined, quantity: n, note: note.trim() || undefined })
      setOkMsg(r.event.amount > 0 ? `ثبت شد — ${money(r.event.amount)} به شارژ واحد اضافه می‌شود` : 'ثبت شد — از سهمیه‌ی رایگان کم شد')
      setQuantity('1')
      setNote('')
      await loadUnit(unit)
    } catch (e) {
      setErr(errText(e, 'ثبت مصرف ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  async function doVoid(id: string) {
    if (reason.trim().length < 2) return
    try {
      await entitlementsApi.voidEvent(id, reason.trim())
      setVoiding(null)
      setReason('')
      if (unit) await loadUnit(unit)
    } catch (e) {
      setErr(errText(e, 'ابطال ممکن نشد'))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card>
        <CardHeader title="ثبت مصرف خدمات" />
        <div className="px-5 pb-5 space-y-4">
          {!unit ? (
            <>
              <div className="relative">
                <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="شماره واحد را جست‌وجو کنید" className={`${inputCls} pr-10`} inputMode="numeric" />
              </div>
              <div className="flex flex-wrap gap-2">
                {units.map((u) => (
                  <button key={u.id} onClick={() => pick(u)} className="px-3.5 py-2 rounded-xl border border-line text-sm hover:border-tile hover:text-tile min-h-[44px]">
                    واحد {fa(u.unit_number)}{u.area ? ` · ${fa(u.area)} متر` : ''}
                  </button>
                ))}
                {units.length === 0 && <p className="text-xs text-muted">واحدی پیدا نشد</p>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-canvas">
                <p className="text-sm font-medium">
                  واحد {fa(unit.unit_number)}
                  {sum?.tier ? <span className="text-xs text-muted"> · سطح {sum.tier.name}</span> : null}
                </p>
                <button onClick={() => { setUnit(null); setSum(null) }} className="text-xs text-tile">تغییر واحد</button>
              </div>

              {sum && (
                <>
                  <label className="block">
                    <span className="text-xs text-muted">خدمت</span>
                    <select value={serviceCode} onChange={(e) => { setServiceCode(e.target.value); setVariant('') }} className={`${inputCls} mt-1.5`}>
                      <option value="">انتخاب کنید…</option>
                      {sum.services.filter((s) => s.kind !== 'free').map((s) => <option key={s.code} value={s.code}>{s.title}</option>)}
                    </select>
                  </label>

                  {service && (
                    <div className="p-3.5 rounded-xl border border-line space-y-2">
                      {service.kind === 'quota' ? (
                        <>
                          <p className="text-xs text-muted">{service.window_label}</p>
                          <div className="h-2 rounded-full bg-canvas overflow-hidden">
                            <div className={`h-full rounded-full ${service.overage_qty > 0 ? 'bg-bad' : 'bg-good'}`} style={{ width: `${usedPct(service)}%` }} />
                          </div>
                          <p className="text-xs">
                            مصرف {qty(service.used)} از {service.included === null ? '—' : qty(service.included)} {service.unit_label}
                            {service.remaining !== null && <span className="text-muted"> · باقی‌مانده {qty(service.remaining)}</span>}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted">این خدمت پولی است؛ کل مبلغ به شارژ واحد اضافه می‌شود.</p>
                      )}
                    </div>
                  )}

                  {service && service.tariffs.length > 1 && (
                    <label className="block">
                      <span className="text-xs text-muted">نوع</span>
                      <select value={variant} onChange={(e) => setVariant(e.target.value)} className={`${inputCls} mt-1.5`}>
                        {service.tariffs.map((t) => <option key={t.code} value={t.is_default ? '' : t.code}>{t.title}</option>)}
                      </select>
                    </label>
                  )}

                  {service && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs text-muted">مقدار ({service.unit_label})</span>
                        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1.5`} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-muted">توضیح (اختیاری)</span>
                        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={`${inputCls} mt-1.5`} />
                      </label>
                    </div>
                  )}
                </>
              )}

              {err && <p className="text-sm text-bad">{err}</p>}
              {okMsg && <p className="text-sm text-good">{okMsg}</p>}
              <button onClick={submit} disabled={busy || !service} className="w-full flex items-center justify-center gap-2 bg-tile text-white py-3 rounded-xl text-sm font-medium hover:opacity-90 min-h-[48px] disabled:opacity-50">
                <ClipboardPlus size={16} />
                {busy ? 'در حال ثبت…' : 'ثبت مصرف'}
              </button>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={unit ? `آخرین مصرف‌های واحد ${fa(unit.unit_number)}` : 'آخرین مصرف‌ها'} />
        <div className="px-5 pb-5">
          {!unit && <p className="text-sm text-muted text-center py-8">یک واحد انتخاب کنید</p>}
          {unit && events.length === 0 && <p className="text-sm text-muted text-center py-8">مصرفی ثبت نشده است</p>}
          <div className="divide-y divide-line">
            {events.map((e) => (
              <div key={e.id} className={`py-3 text-sm ${e.status === 'void' ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{e.service_title}{e.tariff_title && e.tariff_title !== e.service_title ? ` — ${e.tariff_title}` : ''}</p>
                    <p className="text-xs text-muted mt-0.5">{qtyUnit(e.quantity, e.unit_label)} · {whenLabel(e.occurred_at)}{e.note ? ` · ${e.note}` : ''}</p>
                  </div>
                  <div className="text-left shrink-0 text-xs space-y-1">
                    {e.status === 'void' ? <span className="text-muted">ابطال‌شده</span> : e.amount > 0 ? <span className="text-bad font-medium">{money(e.amount)}</span> : <span className="text-good">رایگان</span>}
                    {e.status === 'active' && !e.billed && (
                      <button onClick={() => { setVoiding(voiding === e.id ? null : e.id); setReason('') }} className="flex items-center gap-1 text-bad min-h-[32px]"><Ban size={12} /> ابطال</button>
                    )}
                    {e.billed && e.status === 'active' && <span className="block text-muted">در شارژ</span>}
                  </div>
                </div>
                {voiding === e.id && (
                  <div className="flex gap-2 mt-2">
                    <input value={reason} onChange={(e2) => setReason(e2.target.value)} placeholder="دلیل ابطال" maxLength={200} className={`${inputCls} flex-1 min-w-0`} />
                    <button onClick={() => void doVoid(e.id)} disabled={reason.trim().length < 2} className="bg-bad text-white px-4 rounded-xl text-sm min-h-[46px] disabled:opacity-50">تأیید</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

export function EntitlementDesk() {
  const [tab, setTab] = useState<Tab>('scan')
  const tabBtn = (id: Tab, label: string, Icon: typeof QrCode) => (
    <button onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${tab === id ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}>
      <Icon size={15} /> {label}
    </button>
  )
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">میز خدمات واحدها</h1>
        <p className="text-muted text-sm mt-1">اسکن بلیت مهمان استخر و ثبت مصرف خدمات (کارواش، نظافت، بولینگ و …) — مازاد بر سهمیه خودکار به شارژ ماه بعد می‌رود</p>
      </div>
      <div className="flex gap-1.5 bg-canvas rounded-xl p-1 w-fit max-w-full">
        {tabBtn('scan', 'اسکن بلیت', QrCode)}
        {tabBtn('usage', 'ثبت مصرف', ClipboardPlus)}
      </div>
      {tab === 'scan' ? <ScanTab /> : <UsageTab />}
    </div>
  )
}
