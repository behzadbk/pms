import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, Ban, Gift, Info, QrCode, Waves } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { ErrorBlock, Loading } from '../../components/hm'
import { entitlementsApi, type ServiceLine, type Ticket, type UnitSummary, type UsageEvent } from '../../lib/api/entitlements'
import { errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { addDays, tehranParts, tehranToday, weekdayName } from '../../lib/tehran'
import { money, priceText, qty, qtyUnit, usedPct } from '../../lib/entitlementsFmt'

const TICKET_STATUS: Record<Ticket['status'], { label: string; cls: string }> = {
  issued: { label: 'آماده‌ی ورود', cls: 'bg-good-soft text-good' },
  used: { label: 'استفاده‌شده', cls: 'bg-canvas text-muted' },
  expired: { label: 'منقضی', cls: 'bg-canvas text-muted' },
  void: { label: 'باطل‌شده', cls: 'bg-bad-soft text-bad' },
}

const whenLabel = (iso: string) => {
  const p = tehranParts(iso)
  return `${formatJalali(p.date, false)} ${fa(String(p.hour).padStart(2, '0'))}:${fa(String(p.minute).padStart(2, '0'))}`
}

function QuotaCard({ s }: { s: ServiceLine }) {
  const pct = usedPct(s)
  const over = s.overage_qty > 0
  return (
    <div className="p-4 rounded-xl border border-line space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{s.title}</p>
          <p className="text-xs text-muted mt-0.5">{s.window_label}</p>
        </div>
        <div className="text-left shrink-0">
          <p className="text-sm font-bold">{s.remaining === null ? '—' : qtyUnit(s.remaining, s.unit_label)}</p>
          <p className="text-xs text-muted">باقی‌مانده</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-canvas overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`مصرف ${s.title}`}>
        <div className={`h-full rounded-full ${over ? 'bg-bad' : pct >= 80 ? 'bg-warn' : 'bg-good'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">
        مصرف‌شده {qty(s.used)} از {s.included === null ? '—' : qty(s.included)} {s.unit_label}
      </p>
      {over && (
        <p className="text-xs text-bad flex items-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          مازاد {qtyUnit(s.overage_qty, s.unit_label)} — {money(s.overage_amount)} به شارژ ماه بعد اضافه می‌شود
        </p>
      )}
      {s.tariffs.length > 0 && (
        <p className="text-xs text-muted leading-6">
          نرخ مازاد: {s.tariffs.map((t) => `${t.title} ${priceText(t, s.unit_label)}${t.counts_toward_quota ? '' : ' (از سهمیه کم نمی‌شود)'}`).join(' · ')}
        </p>
      )}
      {s.note && <p className="text-xs text-muted">{s.note}</p>}
    </div>
  )
}

function TicketSection({ service, onChanged }: { service: ServiceLine; onChanged: () => void }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [name, setName] = useState('')
  const [dayOffset, setDayOffset] = useState(0)
  const [shown, setShown] = useState<Ticket | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      setTickets((await entitlementsApi.myTickets()).filter((t) => t.service_code === service.code))
    } catch (e) {
      setErr(errText(e, 'دریافت بلیت‌ها ناموفق بود'))
    }
  }, [service.code])
  useEffect(() => {
    void load()
    const t = setInterval(load, 20_000) // تا لحظه‌ی ورود مهمان و تغییر وضعیت بلیت دیده شود
    return () => clearInterval(t)
  }, [load])

  const today = tehranToday()
  const dates = [0, 1, 2, 3].map((n) => addDays(today, n))

  async function issue() {
    if (name.trim().length < 2) return
    setBusy(true)
    setErr('')
    try {
      const t = await entitlementsApi.issueTicket({ serviceCode: service.code, guestName: name.trim(), date: dates[dayOffset] })
      setShown(t)
      setName('')
      await load()
      onChanged()
    } catch (e) {
      setErr(errText(e, 'صدور بلیت ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  async function voidTicket(id: string) {
    try {
      await entitlementsApi.voidTicket(id)
      if (shown?.id === id) setShown(null)
      await load()
    } catch (e) {
      setErr(errText(e))
    }
  }

  const inputCls = 'mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm bg-card min-h-[46px] focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile'

  return (
    <Card>
      <CardHeader title={`بلیت QR مهمان — ${service.title}`} />
      <div className="px-4 sm:px-5 pb-5 space-y-4">
        <p className="text-xs text-muted leading-6">
          برای هر مهمان یک بلیت QR یک‌بارمصرف بگیرید. مسئول {service.title.includes('استخر') ? 'استخر' : 'مجموعه'} هنگام ورود آن را اسکن می‌کند و یک ورود از سهمیه‌ی ماهانه‌ی شما کم می‌شود؛
          پس از اتمام سهمیه، هر ورود طبق نرخ ({service.tariffs[0] ? priceText(service.tariffs[0], service.unit_label) : '—'}) به شارژ ماه بعد اضافه می‌شود.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-muted">نام مهمان</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="مثلاً آرش محمدی" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs text-muted">روز ورود</span>
              <select value={dayOffset} onChange={(e) => setDayOffset(Number(e.target.value))} className={inputCls}>
                {dates.map((d, i) => (
                  <option key={d} value={i}>{i === 0 ? 'امروز' : i === 1 ? 'فردا' : weekdayName(d)} — {formatJalali(d, false)}</option>
                ))}
              </select>
            </label>
            {err && <p className="text-sm text-bad">{err}</p>}
            <button onClick={issue} disabled={busy || name.trim().length < 2} className="w-full flex items-center justify-center gap-2 bg-tile text-white py-3 rounded-xl text-sm font-medium hover:opacity-90 min-h-[48px] disabled:opacity-50">
              <QrCode size={16} />
              {busy ? 'در حال صدور…' : 'صدور بلیت QR'}
            </button>
          </div>
          <div className="flex flex-col items-center justify-center min-h-[200px] rounded-xl bg-canvas/60 p-4">
            {shown ? (
              <div className="flex flex-col items-center gap-2.5">
                <div className="p-3 bg-white rounded-xl border border-line">
                  <QRCodeSVG value={shown.qr} size={150} fgColor="#16324F" />
                </div>
                <p className="text-sm font-medium">{shown.guest_name}</p>
                <p className="text-xs text-muted">اعتبار تا {whenLabel(shown.valid_until)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted text-center">پس از صدور (یا انتخاب بلیت از فهرست)، کد QR اینجا نمایش داده می‌شود</p>
            )}
          </div>
        </div>

        {tickets && tickets.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <p className="text-xs font-medium text-muted">بلیت‌های اخیر</p>
            {tickets.map((t) => {
              const st = TICKET_STATUS[t.status]
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line flex-wrap">
                  <button onClick={() => t.status === 'issued' && setShown(t)} className="text-right min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.guest_name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {t.status === 'used' && t.used_at ? `ورود ${whenLabel(t.used_at)}` : `اعتبار تا ${whenLabel(t.valid_until)}`}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    {t.status === 'issued' && (
                      <button onClick={() => voidTicket(t.id)} className="flex items-center gap-1 text-xs text-bad px-2.5 py-2 rounded-lg hover:bg-bad-soft min-h-[40px]" aria-label={`ابطال بلیت ${t.guest_name}`}>
                        <Ban size={13} /> ابطال
                      </button>
                    )}
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

export function ResidentOffers() {
  const [sum, setSum] = useState<UnitSummary | null>(null)
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([entitlementsApi.me(), entitlementsApi.myEvents(40)])
      setSum(s)
      setEvents(e)
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت آفرها ناموفق بود'))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (error && !sum) return <ErrorBlock message={error} retry={load} />
  if (!sum) return <Loading />

  const quota = sum.services.filter((s) => s.kind === 'quota')
  const paid = sum.services.filter((s) => s.kind === 'paid')
  const free = sum.services.filter((s) => s.kind === 'free')
  const ticketServices = sum.services.filter((s) => s.supports_ticket)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">آفرها و مصرف خدمات</h1>
        <p className="text-muted text-sm mt-1">
          واحد {fa(sum.unit.unit_number)}
          {sum.unit.area ? ` · ${fa(sum.unit.area)} متر` : ''}
          {sum.tier ? ` · سطح ${sum.tier.name}` : ''} — {sum.period_label}
        </p>
      </div>

      {sum.tier_match !== 'exact' && (
        <p className="text-xs leading-6 bg-warn-soft text-warn rounded-xl px-3.5 py-3 flex gap-2">
          <Info size={15} className="shrink-0 mt-1" />
          <span>
            {sum.tier_match === 'unknown'
              ? 'متراژ واحد شما ثبت نشده؛ سهمیه‌ها تا ثبت متراژ توسط مدیریت تعیین نمی‌شود.'
              : 'متراژ واحد شما کمتر از کوچک‌ترین سطح جدول آفرهاست؛ سهمیه‌ی کوچک‌ترین سطح برای شما اعمال شده است.'}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="p-5">
            <p className="text-xs text-muted">مازاد مصرف این ماه</p>
            <p className="text-xl font-bold mt-1.5">{money(sum.totals.overage_this_period)}</p>
          </div>
        </Card>
        <Card className={sum.totals.unbilled > 0 ? 'border-warn/40' : ''}>
          <div className="p-5">
            <p className="text-xs text-muted">مازاد در انتظار ورود به شارژ</p>
            <p className="text-xl font-bold mt-1.5">{money(sum.totals.unbilled)}</p>
            <p className="text-xs text-muted mt-1">در صدور شارژ ماه بعد اضافه می‌شود</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="سهمیه‌ی رایگان شما" />
        <div className="px-4 sm:px-5 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {quota.length === 0 && <p className="text-sm text-muted">هنوز سهمیه‌ای برای ساختمان تعریف نشده است.</p>}
          {quota.map((s) => <QuotaCard key={s.code} s={s} />)}
        </div>
      </Card>

      {ticketServices.map((s) => <TicketSection key={s.code} service={s} onChanged={load} />)}

      {(paid.length > 0 || free.length > 0) && (
        <Card>
          <CardHeader title="سایر خدمات و نرخ‌ها" />
          <div className="px-4 sm:px-5 pb-5 space-y-4">
            {free.length > 0 && (
              <div className="flex items-start gap-2.5 text-sm">
                <Gift size={16} className="text-good shrink-0 mt-1" />
                <p className="leading-7"><span className="font-medium">رایگان برای ساکنین: </span>{free.map((s) => s.title).join('، ')}</p>
              </div>
            )}
            {paid.length > 0 && (
              <div className="divide-y divide-line">
                {paid.map((s) => (
                  <div key={s.code} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{s.title}</p>
                      {s.used > 0 && <p className="text-xs text-muted mt-0.5">مصرف این ماه: {qtyUnit(s.used, s.unit_label)}</p>}
                    </div>
                    <div className="text-left text-xs text-muted shrink-0 space-y-0.5">
                      {s.tariffs.map((t) => <p key={t.code}>{s.tariffs.length > 1 ? `${t.title}: ` : ''}{priceText(t, s.unit_label)}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="سوابق مصرف" />
        <div className="px-4 sm:px-5 pb-5">
          {events.length === 0 && <p className="text-sm text-muted text-center py-6">هنوز مصرفی ثبت نشده است</p>}
          <div className="divide-y divide-line">
            {events.map((e) => (
              <div key={e.id} className={`py-3 flex items-start justify-between gap-3 text-sm ${e.status === 'void' ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="font-medium flex items-center gap-1.5">
                    {e.source === 'qr_guest' && <Waves size={13} className="text-tile shrink-0" />}
                    {e.service_title}{e.tariff_title && e.tariff_title !== e.service_title ? ` — ${e.tariff_title}` : ''}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{qtyUnit(e.quantity, e.unit_label)} · {whenLabel(e.occurred_at)}{e.note ? ` · ${e.note}` : ''}</p>
                </div>
                <div className="text-left shrink-0 text-xs">
                  {e.status === 'void' ? <span className="text-muted">ابطال‌شده</span> : e.amount > 0 ? (
                    <span className="text-bad font-medium">{money(e.amount)}{e.billed ? ' · در شارژ' : ''}</span>
                  ) : <span className="text-good">رایگان</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
