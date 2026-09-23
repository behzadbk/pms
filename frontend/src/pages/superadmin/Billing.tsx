import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { Wallet, Receipt, AlertCircle } from 'lucide-react'
import { platformInvoices, platformSummary, toman } from '../../lib/mockData'

export function SuperAdminBilling() {
  const failedCount = platformInvoices.filter((i) => i.status === 'failed').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تراکنش‌های پلتفرم</h1>
        <p className="text-muted text-sm mt-1">صورتحساب اشتراک ماهانه هر مجتمع به شرکت ارائه‌دهنده — جدا از دفترداری داخلی ساختمان‌ها</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="درآمد ماهانه مکرر" value={toman(platformSummary.totalMrr)} icon={Wallet} tone="ink" />
        <StatCard label="فاکتورهای این ماه" value={String(platformInvoices.length)} icon={Receipt} tone="tile" />
        <StatCard label="پرداخت‌های ناموفق" value={String(failedCount)} icon={AlertCircle} tone="bad" />
      </div>

      <Card>
        <CardHeader title="فاکتورهای اشتراک" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">مجتمع</th>
                <th className="font-medium px-5 py-2.5">دوره</th>
                <th className="font-medium px-5 py-2.5">مبلغ</th>
                <th className="font-medium px-5 py-2.5">تاریخ</th>
                <th className="font-medium px-5 py-2.5">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {platformInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{inv.tenantName}</td>
                  <td className="px-5 py-3 text-muted">{inv.period}</td>
                  <td className="px-5 py-3 font-medium">{toman(inv.amount)}</td>
                  <td className="px-5 py-3 text-muted">{inv.date}</td>
                  <td className="px-5 py-3"><StatusPill status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
