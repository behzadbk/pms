import { useState } from 'react'
import { Plus, Globe } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { platformTenants } from '../../lib/mockData'

export function SuperAdminTenants() {
  const [tenants, setTenants] = useState(platformTenants)

  function toggleSuspend(id: string) {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: t.status === 'suspended' ? 'active' : 'suspended' } : t)),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">مجتمع‌ها (Tenants)</h1>
          <p className="text-muted text-sm mt-1">ایجاد، تعلیق و مدیریت مشتریان پلتفرم</p>
        </div>
        <button className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={16} />
          مجتمع جدید
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-b border-line">
                <th className="font-medium px-5 py-3">نام مجتمع</th>
                <th className="font-medium px-5 py-3">Subdomain</th>
                <th className="font-medium px-5 py-3">پلن</th>
                <th className="font-medium px-5 py-3">واحدها</th>
                <th className="font-medium px-5 py-3">تاریخ عضویت</th>
                <th className="font-medium px-5 py-3">وضعیت</th>
                <th className="font-medium px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{t.name}</td>
                  <td className="px-5 py-3 text-muted">
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      <Globe size={12} /> {t.subdomain}.pms.app
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{t.plan}</td>
                  <td className="px-5 py-3 text-muted">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-canvas overflow-hidden">
                        <div className="h-full bg-tile" style={{ width: `${(t.unitCount / t.unitLimit) * 100}%` }} />
                      </div>
                      <span className="text-xs">{t.unitCount}/{t.unitLimit}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{t.joinedAt}</td>
                  <td className="px-5 py-3"><StatusPill status={t.status} /></td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleSuspend(t.id)} className="text-xs font-medium text-tile hover:underline whitespace-nowrap">
                      {t.status === 'suspended' ? 'فعال‌سازی مجدد' : 'تعلیق'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
