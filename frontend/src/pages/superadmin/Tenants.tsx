import { useCallback, useEffect, useState } from 'react'
import { Plus, Globe, Download, RefreshCw } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { Loading, ErrorBlock } from '../../components/hm'
import { platformApi } from '../../lib/api'
import { errText, fa } from '../../lib/api/residents'
import type { PlatformTenant } from '../../lib/api/platform'
import { NewBuildingDialog } from './NewBuildingDialog'

export function SuperAdminTenants() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setTenants((await platformApi.listTenants()).tenants)
    } catch (e) {
      setErr(errText(e, 'دریافت لیست مجتمع‌ها ناموفق بود'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function toggleSuspend(t: PlatformTenant) {
    const suspend = t.status !== 'suspended'
    if (suspend && !window.confirm(`مجتمع «${t.name}» معلق شود؟ ساکنان و کارکنان آن دیگر نمی‌توانند وارد شوند.`)) return
    setBusy(t.id)
    try {
      await platformApi.updateBuilding(t.id, { status: suspend ? 'suspended' : 'active' })
      await load()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(null)
    }
  }

  /** دانلود خروجی کامل داده‌ی مجتمع (JSON) برای پشتیبان‌گیری/انتقال */
  async function exportData(t: PlatformTenant) {
    setBusy(t.id)
    try {
      const data = await platformApi.exportBuilding(t.id)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${t.subdomain}-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">مجتمع‌ها (Tenants)</h1>
          <p className="text-muted text-sm mt-1">ایجاد، تعلیق و مدیریت مشتریان پلتفرم</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 border border-line bg-card px-3 py-2.5 rounded-xl text-sm hover:bg-canvas" aria-label="بازخوانی">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setDialog(true)} className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
            <Plus size={16} />
            مجتمع جدید
          </button>
        </div>
      </div>

      {err && <ErrorBlock message={err} retry={load} />}

      <Card>
        {loading && tenants.length === 0 ? (
          <Loading />
        ) : tenants.length === 0 ? (
          <p className="text-sm text-muted text-center py-10">هنوز مجتمعی ثبت نشده است</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-right text-muted border-b border-line">
                  <th className="font-medium px-5 py-3">نام مجتمع</th>
                  <th className="font-medium px-5 py-3">Subdomain</th>
                  <th className="font-medium px-5 py-3">پلن</th>
                  <th className="font-medium px-5 py-3">واحدها (ثبت‌شده/قرارداد)</th>
                  <th className="font-medium px-5 py-3">ساکنان</th>
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
                      <span className="flex items-center gap-1.5 font-mono text-xs" dir="ltr">
                        <Globe size={12} /> {t.subdomain}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">{t.plan}</td>
                    <td className="px-5 py-3 text-muted">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-canvas overflow-hidden">
                          <div className="h-full bg-tile" style={{ width: `${Math.min(100, t.unitLimit ? (t.unitCount / t.unitLimit) * 100 : 0)}%` }} />
                        </div>
                        <span className="text-xs">{fa(t.unitCount)}/{fa(t.unitLimit)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{fa(t.residentCount)}</td>
                    <td className="px-5 py-3 text-muted">{new Date(t.joinedAt).toLocaleDateString('fa-IR')}</td>
                    <td className="px-5 py-3"><StatusPill status={t.status} /></td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-3">
                        <button disabled={busy === t.id} onClick={() => toggleSuspend(t)} className="text-xs font-medium text-tile hover:underline disabled:opacity-50">
                          {t.status === 'suspended' ? 'فعال‌سازی مجدد' : 'تعلیق'}
                        </button>
                        <button disabled={busy === t.id} onClick={() => exportData(t)} className="text-xs font-medium text-muted hover:underline flex items-center gap-1 disabled:opacity-50" title="دانلود خروجی کامل داده‌ها (JSON)">
                          <Download size={12} /> خروجی داده
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog && (
        <NewBuildingDialog
          onClose={() => setDialog(false)}
          onCreated={() => {
            setDialog(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
