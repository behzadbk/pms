import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Loading, ErrorBlock } from '../../components/hm'
import { platformApi } from '../../lib/api'
import { errText, fa } from '../../lib/api/residents'
import type { AuditEntry } from '../../lib/api/platform'

const ACTION_LABELS: Record<string, string> = {
  'building.create': 'تعریف ساختمان',
  'building.update': 'ویرایش ساختمان',
  'building.suspend': 'تعلیق ساختمان',
  'building.reactivate': 'فعال‌سازی مجدد',
  'building.cancel': 'لغو قرارداد',
  'building.impersonate': 'ورود به‌جای مدیر',
  'building.export': 'خروجی داده',
  'billing.settle': 'ثبت تسویه',
  'billing.overdue': 'معوق شد',
  'invoice.create': 'صدور فاکتور',
  'invoice.generate': 'صدور گروهی فاکتور',
  'invoice.status': 'تغییر وضعیت فاکتور',
  'settings.update': 'تغییر تنظیمات',
  'scheduler.run': 'اجرای دستی زمان‌بند',
  'admin.create': 'افزودن عضو تیم',
  'admin.update': 'ویرایش عضو تیم',
  'admin.reset_password': 'بازنشانی رمز',
  'admin.reset_2fa': 'بازنشانی ۲FA',
  'admin.2fa_enable': 'روشن‌کردن ۲FA',
  'admin.2fa_disable': 'خاموش‌کردن ۲FA',
  'note.delete': 'حذف یادداشت',
}

/** رویدادهای حساس که در جدول پررنگ می‌شوند */
const SENSITIVE = new Set(['building.impersonate', 'building.export', 'building.cancel', 'building.suspend', 'admin.reset_password', 'admin.reset_2fa', 'admin.2fa_disable', 'settings.update'])

export function SuperAdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [admin, setAdmin] = useState('')
  const [action, setAction] = useState('')
  const [more, setMore] = useState(true)

  const load = useCallback(async (append = false) => {
    setLoading(true)
    setErr(null)
    try {
      const before = append && entries.length ? entries[entries.length - 1].id : undefined
      const r = await platformApi.listAudit({ admin: admin.trim().toLowerCase(), action, limit: 100, before })
      setEntries((prev) => (append ? [...prev, ...r.entries] : r.entries))
      setMore(r.entries.length === 100)
    } catch (e) {
      setErr(errText(e, 'دریافت لاگ ناموفق بود'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, action, entries])

  useEffect(() => { void load(false) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [admin, action])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">لاگ فعالیت تیم پلتفرم</h1>
          <p className="text-muted text-sm mt-1">هر کار تغییردهنده در پنل سوپرادمین و کارهای خودکار سیستم؛ فقط‌افزودنی و غیرقابل ویرایش</p>
        </div>
        <button onClick={() => load(false)} className="flex items-center gap-2 border border-line bg-card px-3 py-2.5 rounded-xl text-sm hover:bg-canvas" aria-label="بازخوانی">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">بازخوانی</span>
        </button>
      </div>

      {err && <ErrorBlock message={err} retry={() => load(false)} />}

      <Card>
        <CardHeader title="رویدادها" />
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          <input
            value={admin}
            onChange={(e) => setAdmin(e.target.value)}
            placeholder="نام کاربری (مثلاً behzad یا system)"
            dir="ltr"
            className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-tile/40 min-w-[14rem]"
          />
          <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-tile/40">
            <option value="">همه‌ی کارها</option>
            <option value="building.">ساختمان‌ها</option>
            <option value="billing.">مالی</option>
            <option value="invoice.">فاکتورها</option>
            <option value="admin.">تیم و امنیت</option>
            <option value="settings.">تنظیمات</option>
          </select>
        </div>

        {loading && entries.length === 0 ? (
          <Loading />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted text-center py-10">رویدادی ثبت نشده است</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5">زمان</th>
                  <th className="font-medium px-5 py-2.5">کاربر</th>
                  <th className="font-medium px-5 py-2.5">کار</th>
                  <th className="font-medium px-5 py-2.5">هدف</th>
                  <th className="font-medium px-5 py-2.5">جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-5 py-3 text-muted whitespace-nowrap">{new Date(e.at).toLocaleString('fa-IR')}</td>
                    <td className="px-5 py-3 font-mono text-xs" dir="ltr">{e.admin}{e.ip ? <span className="block text-muted">{e.ip}</span> : null}</td>
                    <td className="px-5 py-3">
                      <span className={SENSITIVE.has(e.action) ? 'font-semibold text-warn' : ''}>{ACTION_LABELS[e.action] ?? e.action}</span>
                    </td>
                    <td className="px-5 py-3">{e.buildingName ?? e.target ?? '—'}</td>
                    <td className="px-5 py-3 text-xs text-muted max-w-[22rem]">
                      {Object.keys(e.detail).length ? <code className="break-words" dir="ltr">{JSON.stringify(e.detail)}</code> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {more && entries.length > 0 && (
          <div className="p-4 text-center">
            <button disabled={loading} onClick={() => load(true)} className="text-sm text-tile font-medium disabled:opacity-50">
              {loading ? 'در حال دریافت…' : `نمایش قدیمی‌تر (${fa(entries.length)} مورد نمایش داده شد)`}
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
