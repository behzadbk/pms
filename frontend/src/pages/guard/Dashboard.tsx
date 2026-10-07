import { useCallback, useEffect, useState } from 'react'
import { QrCode, PackageCheck, CarFront, UserCheck, ArrowDownLeft, ArrowUpRight, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { ErrorBlock, Loading } from '../../components/hm'
import { guardApi, type FeedEntry, type GuardSummary, type Parcel } from '../../lib/api/guard'
import { ago, errText, fa } from '../../lib/api/residents'
import { fmtTime } from './shared'

const feedIcon: Record<FeedEntry['type'], typeof UserCheck> = {
  guest_entry: UserCheck,
  parcel: PackageCheck,
  vehicle_in: ArrowDownLeft,
  vehicle_out: ArrowUpRight,
}

export function GuardDashboard() {
  const [summary, setSummary] = useState<GuardSummary | null>(null)
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, p, f] = await Promise.all([guardApi.summary(), guardApi.parcels('pending_pickup'), guardApi.feed(20)])
      setSummary(s)
      setParcels(p)
      setFeed(f)
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت اطلاعات ناموفق بود'))
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(load, 10_000) // رویدادهای زنده
    return () => clearInterval(t)
  }, [load])

  if (error && !summary) return <ErrorBlock message={error} retry={load} />
  if (!summary) return <Loading />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد نگهبانی</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="مرسولات در انتظار تحویل" value={fa(summary.pending_parcels)} icon={PackageCheck} tone="brass" />
        <StatCard label="مهمانان امروز" value={`${fa(summary.guests_today)} نفر`} icon={QrCode} tone="tile" />
        <StatCard label="مهمانان منتظر (کد فعال)" value={`${fa(summary.expected_guests)} کد`} icon={Users} tone="tile" />
        <StatCard label="تردد خودرو امروز" value={`${fa(summary.vehicles_today)} مورد`} icon={CarFront} tone="ink" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/guard/guest-check" className="bg-tile text-white rounded-2xl p-5 flex items-center gap-3 hover:opacity-90 min-h-[64px]">
          <QrCode size={22} />
          <span className="font-medium text-sm">تایید کد مهمان</span>
        </Link>
        <Link to="/guard/parcels" className="bg-card border border-line rounded-2xl p-5 flex items-center gap-3 hover:border-tile min-h-[64px]">
          <PackageCheck size={22} className="text-brass" />
          <span className="font-medium text-sm">ثبت مرسوله جدید</span>
        </Link>
        <Link to="/guard/traffic" className="bg-card border border-line rounded-2xl p-5 flex items-center gap-3 hover:border-tile min-h-[64px]">
          <CarFront size={22} className="text-muted" />
          <span className="font-medium text-sm">ثبت تردد خودرو</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="مرسولات در انتظار تحویل" />
          <div className="px-5 pb-5 space-y-3">
            {parcels.length === 0 && <p className="text-sm text-muted py-4 text-center">مرسوله‌ی منتظری نیست</p>}
            {parcels.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line">
                <div className="min-w-0">
                  <p className="text-sm font-medium">واحد {fa(p.unit_number ?? '—')}</p>
                  <p className="text-xs text-muted mt-0.5 truncate">{p.courier_company || 'بدون نام پیک'} · دریافت: {ago(p.received_at)}</p>
                </div>
                <span className="text-xs text-warn bg-warn-soft rounded-full px-2.5 py-1 shrink-0">در انتظار</span>
              </div>
            ))}
            {parcels.length > 8 && <Link to="/guard/parcels" className="block text-center text-xs text-tile">مشاهده‌ی همه ({fa(parcels.length)})</Link>}
          </div>
        </Card>

        <Card>
          <CardHeader title="رویدادهای اخیر" />
          <div className="px-5 pb-5 space-y-3">
            {feed.length === 0 && <p className="text-sm text-muted py-4 text-center">هنوز رویدادی ثبت نشده</p>}
            {feed.map((g) => {
              const Icon = feedIcon[g.type]
              return (
                <div key={g.id} className="flex items-center gap-3 text-sm">
                  <div className="bg-canvas text-muted rounded-lg p-2 shrink-0"><Icon size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{g.summary}{g.unit_number ? ` · واحد ${fa(g.unit_number)}` : ''}</p>
                  </div>
                  <span className="text-xs text-muted shrink-0">{fmtTime(g.at)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
