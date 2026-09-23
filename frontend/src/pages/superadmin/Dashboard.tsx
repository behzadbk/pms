import { Building2, Wallet, Users, AlertTriangle } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { platformSummary, platformTenants, toman } from '../../lib/mockData'

export function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد پلتفرم</h1>
        <p className="text-muted text-sm mt-1">نمای کلی سلامت کسب‌وکار SaaS — همه مجتمع‌های مشتری</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="درآمد ماهانه مکرر (MRR)" value={toman(platformSummary.totalMrr)} icon={Wallet} tone="ink" />
        <StatCard label="مجتمع‌های فعال" value={String(platformSummary.activeTenants)} sub={`${platformSummary.trialTenants} در دوره آزمایشی`} icon={Building2} tone="tile" />
        <StatCard label="کل واحدهای تحت مدیریت" value={String(platformSummary.totalUnitsManaged)} icon={Users} tone="brass" />
        <StatCard label="مجتمع‌های معلق" value={String(platformSummary.suspendedTenants)} icon={AlertTriangle} tone="bad" />
      </div>

      <Card>
        <CardHeader title="مجتمع‌های اخیر" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">نام مجتمع</th>
                <th className="font-medium px-5 py-2.5">پلن</th>
                <th className="font-medium px-5 py-2.5">واحدها</th>
                <th className="font-medium px-5 py-2.5">درآمد ماهانه</th>
                <th className="font-medium px-5 py-2.5">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {platformTenants.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{t.name}</td>
                  <td className="px-5 py-3 text-muted">{t.plan}</td>
                  <td className="px-5 py-3 text-muted">{t.unitCount} از {t.unitLimit}</td>
                  <td className="px-5 py-3">{t.mrr ? toman(t.mrr) : '—'}</td>
                  <td className="px-5 py-3"><StatusPill status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
