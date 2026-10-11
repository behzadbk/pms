import { useEffect, useState } from 'react'
import { Wallet, QrCode, CalendarRange, PackageCheck } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { EasyHide, Widget, WidgetGrid } from '../../components/ui/Widget'
import { StatusPill } from '../../components/ui/StatusPill'
import { Loading } from '../../components/hm'
import { api } from '../../lib/api/client'
import { residentsApi, fa, toman, type Household, type ReservationRow } from '../../lib/api/residents'
import { toJalali } from '../../lib/jalali'
import { ExpandList } from '../../components/ui/ExpandList'

interface ChargeRow { id: string; period: string; total_amount: string | number; due_date: string | null; status: string }
interface GuestPassRow { id: string; guest_name: string; code: string; valid_until: string; status: string }

const faTime = (iso: string) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
const faDay = (iso: string) => new Date(iso).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' })

/** «1405-07» → «مهر ۱۴۰۵» (نام ماه شمسی) */
function periodLabel(p: string) {
  const [y, m] = p.split('-').map(Number)
  const names = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
  return Number.isFinite(y) && names[m - 1] ? `${names[m - 1]} ${fa(y)}` : p
}

function dueLabel(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${fa(j.jd)} ${['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][j.jm - 1]}`
}

export function ResidentDashboard() {
  const [loading, setLoading] = useState(true)
  const [household, setHousehold] = useState<Household | null>(null)
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [passes, setPasses] = useState<GuestPassRow[]>([])
  const [reservations, setReservations] = useState<ReservationRow[]>([])

  useEffect(() => {
    let alive = true
    async function load() {
      // هر بخش مستقل بارگذاری می‌شود تا خطای یکی (مثلاً سرویس مالی) بقیه را خالی نکند
      const [h, res, gp, ch] = await Promise.allSettled([
        residentsApi.household(),
        residentsApi.myReservations(),
        api.get<GuestPassRow[]>('/guard/me/guest-passes'),
        api.get<ChargeRow[]>('/finance/me/charges'),
      ])
      if (!alive) return
      if (h.status === 'fulfilled') setHousehold(h.value)
      if (ch.status === 'fulfilled') setCharges(ch.value)
      if (res.status === 'fulfilled') setReservations(res.value)
      if (gp.status === 'fulfilled') setPasses(gp.value)
      if (alive) setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [])

  // قدیمی‌ترین شارژ پرداخت‌نشده (نزدیک‌ترین سررسید)
  const pending = [...charges].filter((c) => c.status !== 'paid').sort((a, b) => a.period.localeCompare(b.period))[0]
  const activePasses = passes.filter((g) => g.status === 'active').length
  const upcoming = reservations
    .filter((r) => (r.status === 'confirmed' || r.status === 'pending') && new Date(r.end_at).getTime() > Date.now())
    .sort((a, b) => a.start_at.localeCompare(b.start_at))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{household ? `داشبورد واحد ${fa(household.unit.no)}` : 'داشبورد'}</h1>
      </div>

      {loading && <Loading />}

      <WidgetGrid>
        {pending && (
          <Widget
            hero
            essential
            to="/resident/charges"
            icon={Wallet}
            label={`شارژ ${periodLabel(pending.period)}${pending.status === 'overdue' ? ' — معوق' : ''}`}
            value={`${toman(Number(pending.total_amount))} تومان`}
            sub={`سررسید: ${dueLabel(pending.due_date)}`}
            cta="پرداخت آنلاین"
          />
        )}
        <Widget essential to="/resident/charges" icon={Wallet} label="شارژ و پرداخت" value={pending ? 'در انتظار' : 'تسویه'} sub={pending ? periodLabel(pending.period) : 'بدهی ندارید'} tone={pending ? 'acc' : 'ok'} />
        <Widget essential to="/resident/guest" icon={QrCode} label="کد مهمان" value={`${fa(activePasses)} فعال`} sub="صدور کد جدید" tone="pri" />
        <Widget essential to="/resident/reservations" icon={CalendarRange} label="رزرو مشاعات" value={`${fa(upcoming.length)} رزرو`} sub={upcoming[0] ? `بعدی: ${upcoming[0].amenity}` : 'رزرو پیش‌رو ندارید'} tone="acc" />
        <Widget essential to="/resident/tickets" icon={PackageCheck} label="ثبت گزارش" sub="خرابی یا درخواست" tone="ink" />
      </WidgetGrid>

      <EasyHide>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="کدهای مهمان اخیر" />
          <div className="px-5 pb-5 space-y-3">
            {!loading && passes.length === 0 && <p className="text-sm text-muted text-center py-6">هنوز کد مهمانی صادر نکرده‌اید</p>}
            <ExpandList className="space-y-3" items={passes} render={(g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{g.guest_name}</p>
                  <p className="text-xs text-muted mt-0.5">کد: {fa(g.code)} · تا {faDay(g.valid_until)} {faTime(g.valid_until)}</p>
                </div>
                <StatusPill status={g.status === 'revoked' ? 'cancelled' : g.status} />
              </div>
            )} />
          </div>
        </Card>

        <Card>
          <CardHeader title="رزروهای من" />
          <div className="px-5 pb-5 space-y-3">
            {!loading && upcoming.length === 0 && <p className="text-sm text-muted text-center py-6">رزرو پیش‌رویی ندارید</p>}
            <ExpandList className="space-y-3" items={upcoming} render={(r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.amenity}</p>
                  <p className="text-xs text-muted mt-0.5">{faDay(r.start_at)} · {faTime(r.start_at)} تا {faTime(r.end_at)}</p>
                </div>
                <StatusPill status={r.status} />
              </div>
            )} />
          </div>
        </Card>
      </div>
      </EasyHide>
    </div>
  )
}
