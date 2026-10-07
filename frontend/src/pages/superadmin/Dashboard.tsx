import { useCallback, useEffect, useState } from 'react'
import { Building2, Wallet, Users, AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { Loading, ErrorBlock } from '../../components/hm'
import { platformApi } from '../../lib/api'
import { errText, fa } from '../../lib/api/residents'
import { fmtToman, type PlatformSummary } from '../../lib/api/platform'

export function SuperAdminDashboard() {
  const [s, setS] = useState<PlatformSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setS(await platformApi.getSummary())
    } catch (e) {
      setErr(errText(e, 'دریافت اطلاعات پلتفرم ناموفق بود'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">داشبورد پلتفرم</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-line bg-card px-3 py-2.5 rounded-xl text-sm hover:bg-canvas" aria-label="بازخوانی">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">بازخوانی</span>
        </button>
      </div>

      {err && <ErrorBlock message={err} retry={load} />}
      {!s && loading && <Loading />}

      {s && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="درآمد ماهانه مکرر (MRR)" value={fmtToman(s.totalMrr)} sub={s.totalOutstanding > 0 ? `مطالبات معوق: ${fmtToman(s.totalOutstanding)}` : undefined} icon={Wallet} tone="ink" />
            <StatCard label="مجتمع‌های فعال" value={fa(s.activeTenants)} sub={`${fa(s.trialTenants)} در دوره آزمایشی`} icon={Building2} tone="tile" />
            <StatCard label="کل واحدهای تحت مدیریت" value={fa(s.totalUnitsManaged)} sub={`${fa(s.totalResidents)} ساکن فعال`} icon={Users} tone="brass" />
            <StatCard label="مجتمع‌های معلق" value={fa(s.suspendedTenants)} sub={s.overdueTenants ? `${fa(s.overdueTenants)} مجتمع با پرداخت معوق` : undefined} icon={AlertTriangle} tone="bad" />
          </div>

          <Card>
            <CardHeader title="مجتمع‌های اخیر" />
            {s.recentTenants.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">هنوز مجتمعی ثبت نشده است</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
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
                    {s.recentTenants.map((t) => (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-3 font-medium">{t.name}</td>
                        <td className="px-5 py-3 text-muted">{t.plan}</td>
                        <td className="px-5 py-3 text-muted">{fa(t.unitCount)} از {fa(t.unitLimit)}</td>
                        <td className="px-5 py-3">{t.monthlyFee ? fmtToman(t.monthlyFee) : '—'}</td>
                        <td className="px-5 py-3"><StatusPill status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
