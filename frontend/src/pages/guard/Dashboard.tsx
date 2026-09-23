import { QrCode, PackageCheck, CarFront, UserCheck, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { parcels, guardLiveFeed } from '../../lib/mockData'
import type { GuardLogEntry } from '../../lib/types'

const feedIcon: Record<GuardLogEntry['type'], typeof UserCheck> = {
  guest_entry: UserCheck,
  parcel: PackageCheck,
  vehicle_in: ArrowDownLeft,
  vehicle_out: ArrowUpRight,
}

export function GuardDashboard() {
  const pendingParcels = parcels.filter((p) => p.status === 'pending_pickup')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد نگهبانی</h1>
        <p className="text-muted text-sm mt-1">شیفت صبح — درب اصلی برج آفتاب</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="مرسولات در انتظار تحویل" value={String(pendingParcels.length)} icon={PackageCheck} tone="brass" />
        <StatCard label="مهمانان امروز" value="۳ نفر" icon={QrCode} tone="tile" />
        <StatCard label="تردد خودرو امروز" value="۱۴ مورد" icon={CarFront} tone="ink" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/guard/guest-check" className="bg-tile text-white rounded-2xl p-5 flex items-center gap-3 hover:opacity-90">
          <QrCode size={22} />
          <span className="font-medium text-sm">تایید کد مهمان</span>
        </Link>
        <Link to="/guard/parcels" className="bg-card border border-line rounded-2xl p-5 flex items-center gap-3 hover:border-tile">
          <PackageCheck size={22} className="text-brass" />
          <span className="font-medium text-sm">ثبت مرسوله جدید</span>
        </Link>
        <Link to="/guard/traffic" className="bg-card border border-line rounded-2xl p-5 flex items-center gap-3 hover:border-tile">
          <CarFront size={22} className="text-ink-soft" />
          <span className="font-medium text-sm">ثبت تردد خودرو</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="مرسولات در انتظار تحویل" />
          <div className="px-5 pb-5 space-y-3">
            {pendingParcels.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
                <div>
                  <p className="text-sm font-medium">{p.unit}</p>
                  <p className="text-xs text-muted mt-0.5">{p.courier} · دریافت: {p.receivedAt}</p>
                </div>
                <span className="text-xs text-warn bg-warn-soft rounded-full px-2.5 py-1">در انتظار</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="رویدادهای اخیر" />
          <div className="px-5 pb-5 space-y-3">
            {guardLiveFeed.map((g) => {
              const Icon = feedIcon[g.type]
              return (
                <div key={g.id} className="flex items-center gap-3 text-sm">
                  <div className="bg-canvas text-ink-soft rounded-lg p-2 shrink-0">
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{g.summary}</p>
                  </div>
                  <span className="text-xs text-muted shrink-0">{g.time}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
