import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Wallet, Users, AlertTriangle } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { toman } from '../../lib/mockData'
import { platformApi } from '../../lib/api'
import type { BuildingsResponse } from '../../lib/api/platform'

/** داشبورد پلتفرم — از ساختمان‌های واقعی ثبت‌شده (بدون داده‌ی نمونه) */
export function SuperAdminDashboard() {
  const [data, setData] = useState<BuildingsResponse | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    platformApi
      .listBuildings()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات'))
  }, [])
  const s = data?.summary
  const recent = [...(data?.buildings ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)
  const n = (v: number | undefined) => (v ?? 0).toLocaleString('fa-IR')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد پلتفرم</h1>
        <p className="text-muted text-sm mt-1">نمای کلی همه‌ی ساختمان‌های مشتری</p>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="درآمد ماهانه مکرر (MRR)" value={toman(s?.mrr ?? 0)} icon={Wallet} tone="ink" />
        <StatCard label="ساختمان‌های فعال" value={n(s?.activeBuildings)} sub={`${n(s?.trialBuildings)} در دوره آزمایشی`} icon={Building2} tone="tile" />
        <StatCard label="کل واحدهای تحت مدیریت" value={n(s?.totalUnits)} icon={Users} tone="brass" />
        <StatCard label="ساختمان‌های معلق" value={n(s?.suspendedBuildings)} icon={AlertTriangle} tone="bad" />
      </div>

      <Card>
        <CardHeader title="ساختمان‌های اخیر" />
        {data && recent.length === 0 ? (
          <div className="px-5 pb-6 text-sm text-muted">
            هنوز ساختمانی ثبت نشده است.{' '}
            <Link to="/super-admin/buildings" className="text-tile font-medium">
              ثبت اولین ساختمان
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">نام ساختمان</th>
                  <th className="font-medium px-5 py-2.5">سطح سرویس</th>
                  <th className="font-medium px-5 py-2.5">واحدها</th>
                  <th className="font-medium px-5 py-2.5">اشتراک ماهانه</th>
                  <th className="font-medium px-5 py-2.5">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{b.name}</td>
                    <td className="px-5 py-3 text-muted">{b.tierLabel}</td>
                    <td className="px-5 py-3 text-muted">{n(b.unitCount)}</td>
                    <td className="px-5 py-3">{b.monthlyFee ? toman(b.monthlyFee) : '—'}</td>
                    <td className="px-5 py-3"><StatusPill status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
