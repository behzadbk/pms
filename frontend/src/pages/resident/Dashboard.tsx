import { Wallet, QrCode, CalendarRange, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { myCharges, guestPasses, reservations, toman } from '../../lib/mockData'

export function ResidentDashboard() {
  const pending = myCharges.find((c) => c.status !== 'paid')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد واحد ۱۲</h1>
        <p className="text-muted text-sm mt-1">خلاصه وضعیت شارژ، مهمان‌ها و رزروهای شما</p>
      </div>

      {pending && (
        <Card className="bg-ink text-white border-none">
          <div className="p-5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-white/60 text-sm">شارژ {pending.period}</p>
              <p className="text-2xl font-bold mt-1">{toman(pending.total)}</p>
              <p className="text-white/50 text-xs mt-1">سررسید: {pending.dueDate}</p>
            </div>
            <Link to="/resident/charges" className="bg-tile px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
              پرداخت آنلاین
            </Link>
          </div>
        </Card>
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
            {reservations.slice(0, 2).map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
                <div>
                  <p className="text-sm font-medium">{r.amenity}</p>
                  <p className="text-xs text-muted mt-0.5">{r.date} · {r.time}</p>
                </div>
                <StatusPill status={r.status} />
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
    <Link to={to} className="bg-card rounded-2xl border border-line shadow-sm p-4 flex flex-col items-center gap-2.5 hover:border-tile transition-colors">
      <div className="bg-tile-soft text-tile rounded-xl p-2.5">
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium text-center">{label}</p>
    </Link>
  )
}
