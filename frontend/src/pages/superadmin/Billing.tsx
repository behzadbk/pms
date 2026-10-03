import { useEffect, useState } from 'react'
import { Wallet, Receipt, AlertCircle } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { toman } from '../../lib/mockData'
import { platformApi } from '../../lib/api'
import type { BuildingsResponse } from '../../lib/api/platform'

const BILLING: Record<string, 'paid' | 'pending' | 'overdue'> = { settled: 'paid', due: 'pending', overdue: 'overdue' }

/** وضعیت اشتراک هر ساختمان با ما — از داده‌ی واقعی ساختمان‌ها (جدا از حسابداری داخلی خودشان) */
export function SuperAdminBilling() {
  const [data, setData] = useState<BuildingsResponse | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    platformApi
      .listBuildings()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات'))
  }, [])
  const s = data?.summary
  const list = data?.buildings ?? []
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fa-IR') : '—')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تراکنش‌های پلتفرم</h1>
        <p className="text-muted text-sm mt-1">اشتراک ماهانه‌ی هر ساختمان به شرکت ارائه‌دهنده — جدا از دفترداری داخلی ساختمان‌ها</p>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="درآمد ماهانه مکرر" value={toman(s?.mrr ?? 0)} icon={Wallet} tone="ink" />
        <StatCard label="مانده‌ی وصول‌نشده" value={toman(s?.totalOutstanding ?? 0)} icon={Receipt} tone="tile" />
        <StatCard label="ساختمان‌های معوق" value={(s?.overdueCount ?? 0).toLocaleString('fa-IR')} icon={AlertCircle} tone="bad" />
      </div>

      <Card>
        <CardHeader title="اشتراک ساختمان‌ها" />
        {data && list.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted">هنوز ساختمانی ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">ساختمان</th>
                  <th className="font-medium px-5 py-2.5">اشتراک ماهانه</th>
                  <th className="font-medium px-5 py-2.5">مانده</th>
                  <th className="font-medium px-5 py-2.5">آخرین پرداخت</th>
                  <th className="font-medium px-5 py-2.5">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{b.name}</td>
                    <td className="px-5 py-3">{toman(b.monthlyFee)}</td>
                    <td className="px-5 py-3">{toman(b.outstandingAmount)}</td>
                    <td className="px-5 py-3 text-muted">{date(b.lastPaymentAt)}</td>
                    <td className="px-5 py-3"><StatusPill status={BILLING[b.billingStatus] ?? 'pending'} /></td>
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
