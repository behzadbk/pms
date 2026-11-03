import { useCallback, useEffect, useState } from 'react'
import { Activity, Database, RefreshCw, ShieldAlert } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { Loading, ErrorBlock } from '../../components/hm'
import { platformApi } from '../../lib/api'
import { errText, fa } from '../../lib/api/residents'
import type { HealthReport } from '../../lib/api/platform'

const NAMES: Record<string, string> = {
  identity: 'هویت و ورود', property: 'ملک و واحد', facility: 'مشاعات و تأسیسات', finance: 'مالی', guard: 'نگهبانی',
  notification: 'اعلان‌ها', audit: 'لاگ رفتار', fnb: 'غذا و کافی‌شاپ', integration: 'اتصال ERP',
}

const OVERALL = {
  ok: { label: 'همه‌چیز سالم است', cls: 'bg-good-soft text-good' },
  degraded: { label: 'برخی سرویس‌ها پاسخ نمی‌دهند', cls: 'bg-warn-soft text-warn' },
  critical: { label: 'وضعیت بحرانی — سرویس هویت/دیتابیس در دسترس نیست', cls: 'bg-bad-soft text-bad' },
} as const

const mb = (b: number) => (b / 1024 / 1024 >= 1024 ? `${fa((b / 1024 ** 3).toFixed(1))} گیگابایت` : `${fa(Math.round(b / 1024 / 1024))} مگابایت`)

export function SuperAdminHealth() {
  const [h, setH] = useState<HealthReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setH(await platformApi.getHealth())
    } catch (e) {
      setErr(errText(e, 'دریافت وضعیت سلامت ناموفق بود'))
    } finally {
      setLoading(false)
    }
  }, [])

  // هر ۳۰ ثانیه تازه می‌شود تا صفحه‌ی بازِ روی مانیتور همیشه به‌روز باشد
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const o = h ? OVERALL[h.overall] : null
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">سلامت سیستم</h1>
          <p className="text-muted text-sm mt-1">وضعیت لحظه‌ای سرویس‌ها و دیتابیس؛ هر ۳۰ ثانیه خودکار تازه می‌شود</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-line bg-card px-3 py-2.5 rounded-xl text-sm hover:bg-canvas" aria-label="بازخوانی">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">بازخوانی</span>
        </button>
      </div>

      {err && <ErrorBlock message={err} retry={load} />}
      {!h && loading && <Loading />}

      {h && o && (
        <>
          <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${o.cls}`}>
            {o.label}
            <span className="text-xs font-normal opacity-80 ms-3">آخرین بررسی: {new Date(h.checkedAt).toLocaleTimeString('fa-IR')} ({fa(h.tookMs)} میلی‌ثانیه)</span>
          </div>

          <div className="lg5-grid">
            <StatCard label="حجم دیتابیس" value={mb(h.database.sizeBytes)} icon={Database} tone="tile" />
            <StatCard label="اتصال‌های دیتابیس" value={`${fa(h.database.connections)} از ${fa(h.database.maxConnections)}`} sub={h.database.connections / Math.max(h.database.maxConnections, 1) > 0.8 ? 'نزدیک به سقف' : undefined} icon={Activity} tone={h.database.connections / Math.max(h.database.maxConnections, 1) > 0.8 ? 'bad' : 'ink'} />
            <StatCard label="ورودهای قفل‌شده" value={fa(h.database.lockedLogins)} sub="تلاش ناموفق زیاد در حال حاضر" icon={ShieldAlert} tone={h.database.lockedLogins > 0 ? 'bad' : 'brass'} />
            <StatCard label="فاکتورهای ناموفق / ساختمان‌های معوق" value={`${fa(h.database.failedInvoices)} / ${fa(h.database.overdueBuildings)}`} icon={Activity} tone={h.database.failedInvoices + h.database.overdueBuildings > 0 ? 'bad' : 'brass'} />
          </div>

          <Card>
            <CardHeader title="سرویس‌ها" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-right text-muted border-y border-line">
                    <th className="font-medium px-5 py-2.5">سرویس</th>
                    <th className="font-medium px-5 py-2.5">وضعیت</th>
                    <th className="font-medium px-5 py-2.5">تأخیر</th>
                  </tr>
                </thead>
                <tbody>
                  {h.services.map((s) => (
                    <tr key={s.name} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 font-medium">{NAMES[s.name] ?? s.name} <span className="text-xs text-muted font-mono" dir="ltr">{s.name}</span></td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${s.status === 'up' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>
                          {s.status === 'up' ? 'سالم' : s.error === 'timeout' ? 'بدون پاسخ' : s.error?.startsWith('HTTP') ? `خطا (${s.error})` : 'در دسترس نیست'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">{s.latencyMs === null ? '—' : `${fa(s.latencyMs)} میلی‌ثانیه`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted leading-6">
            این صفحه وضعیت لحظه‌ای را نشان می‌دهد. نرخ خطای تاریخی و هشدار خودکار (پیامک/تلگرام وقتی سرویسی می‌افتد) به ابزار بیرونی مثل Uptime Kuma یا Sentry نیاز دارد.
          </p>
        </>
      )}
    </div>
  )
}
