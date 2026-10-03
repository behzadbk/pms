import { Wallet, QrCode, CalendarRange, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { guestPasses, toman } from '../../lib/mockData'
import { useMyCharges, useMyUnit } from '../../lib/myUnit'
import { residentsApi, type ReservationRow } from '../../lib/api/residents'
import { DEMO_DATA } from '../../lib/demoMode'
import { reservations as demoReservations } from '../../lib/mockData'
import { useEffect, useState } from 'react'

export function ResidentDashboard() {
  const { charges: myCharges } = useMyCharges()
  const my = useMyUnit()
  const pending = myCharges.find((c) => c.status !== 'paid')
  // رزروهای واقعی ساکن (در حالت دمو نمونه)
  const [res, setRes] = useState<{ id: string; amenity: string; when: string; status: string }[]>(
    DEMO_DATA ? demoReservations.map((r) => ({ id: r.id, amenity: r.amenity, when: `${r.date} · ${r.time}`, status: r.status })) : [],
  )
  useEffect(() => {
    if (DEMO_DATA) return
    residentsApi
      .myReservations()
      .then((rows: ReservationRow[]) =>
        setRes(rows.map((r) => ({ id: r.id, amenity: r.amenity, when: new Date(r.start_at).toLocaleString('fa-IR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }), status: r.status }))),
      )
      .catch(() => setRes([]))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد {my.label ?? 'واحد من'}</h1>
        <p className="text-muted text-sm mt-1">خلاصه وضعیت شارژ، مهمان‌ها و رزروهای شما</p>
      </div>

      {pending && (
        <div className="lg4-hero p-5 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-white/78 text-sm">شارژ {pending.period}</p>
            <p className="text-2xl font-bold mt-1">{toman(pending.total)}</p>
            <p className="text-white/70 text-xs mt-1">سررسید: {pending.dueDate}</p>
          </div>
          <Link to="/resident/charges" className="lg4-capsule px-5 py-2.5 text-sm">
            پرداخت آنلاین
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink to="/resident/charges" icon={Wallet} label="شارژ و پرداخت" />
        <QuickLink to="/resident/guest" icon={QrCode} label="صدور کد مهمان" />
        <QuickLink to="/resident/reservations" icon={CalendarRange} label="رزرو مشاعات" />
        <QuickLink to="/resident/tickets" icon={PackageCheck} label="ثبت گزارش" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="کدهای مهمان اخیر" />
          <div className="px-5 pb-5 space-y-3">
            {guestPasses.length === 0 && <p className="text-sm text-muted">کد مهمانی صادر نشده است</p>}
            {guestPasses.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
                <div>
                  <p className="text-sm font-medium">{g.guestName}</p>
                  <p className="text-xs text-muted mt-0.5">کد: {g.code} · تا {g.validUntil}</p>
                </div>
                <StatusPill status={g.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="رزروهای من" />
          <div className="px-5 pb-5 space-y-3">
            {res.length === 0 && <p className="text-sm text-muted">رزروی ثبت نشده است</p>}
            {res.slice(0, 2).map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
                <div>
                  <p className="text-sm font-medium">{r.amenity}</p>
                  <p className="text-xs text-muted mt-0.5">{r.when}</p>
                </div>
                <StatusPill status={r.status as 'confirmed'} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Wallet; label: string }) {
  return (
    <Link to={to} className="lg4-card p-4 flex flex-col items-center gap-2.5">
      <Icon size={23} className="text-[var(--lg4-pri)]" />
      <p className="text-sm font-medium text-center">{label}</p>
    </Link>
  )
}
