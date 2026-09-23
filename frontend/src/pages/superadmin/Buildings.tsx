import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Building2, CheckCircle2, Layers, Loader2, Plus, RefreshCw, Search, Wallet,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { toman } from '../../lib/mockData'
import { tierById, tiers, type BuildingTier } from '../../lib/tiers'
import { platformApi, ApiError } from '../../lib/api'
import type { Building, BuildingsSummary, BillingStatus } from '../../lib/api/platform'
import { NewBuildingDialog } from './NewBuildingDialog'

const billingLabels: Record<BillingStatus, { label: string; className: string }> = {
  settled: { label: 'تسویه‌شده', className: 'bg-good-soft text-good' },
  due: { label: 'سررسید نزدیک', className: 'bg-warn-soft text-warn' },
  overdue: { label: 'معوق', className: 'bg-bad-soft text-bad' },
}

function TierBadge({ tier }: { tier: BuildingTier }) {
  const def = tierById[tier]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${def.accent}`}>
      {def.label}
    </span>
  )
}

export function SuperAdminBuildings() {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [summary, setSummary] = useState<BuildingsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<BuildingTier | 'all'>('all')
  const [billingFilter, setBillingFilter] = useState<BillingStatus | 'all'>('all')
  const [settlingId, setSettlingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await platformApi.listBuildings()
      setBuildings(res.buildings)
      setSummary(res.summary)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `دریافت لیست ساختمان‌ها ناموفق بود (${err.status}): ${err.message}`
          : 'اتصال به سرویس identity برقرار نشد — مطمئن شوید بک‌اند در حال اجراست.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim()
    return buildings.filter((b) => {
      if (tierFilter !== 'all' && b.tier !== tierFilter) return false
      if (billingFilter !== 'all' && b.billingStatus !== billingFilter) return false
      if (q && !b.name.includes(q) && !b.subdomain.includes(q.toLowerCase())) return false
      return true
    })
  }, [buildings, query, tierFilter, billingFilter])

  async function handleSettle(b: Building) {
    setSettlingId(b.id)
    try {
      const updated = await platformApi.settleBuilding(b.id)
      setBuildings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت تسویه ناموفق بود')
    } finally {
      setSettlingId(null)
    }
  }

  function handleCreated(created: Building) {
    setBuildings((prev) => [created, ...prev])
    setDialogOpen(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">ساختمان‌ها و برج‌ها</h1>
          <p className="text-muted text-sm mt-1">
            مجموعه‌هایی که با آن‌ها همکاری داریم — سطح سرویس، تعداد واحد و وضعیت تسویه‌ی اشتراک
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 border border-line bg-card text-ink-text px-3 py-2.5 rounded-xl text-sm hover:bg-canvas"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            بازخوانی
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90"
          >
            <Plus size={16} />
            تعریف برج / ساختمان جدید
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="ساختمان‌های تحت همکاری"
            value={String(summary.totalBuildings)}
            sub={`${summary.activeBuildings} فعال · ${summary.trialBuildings} آزمایشی`}
            icon={Building2}
            tone="ink"
          />
          <StatCard label="مجموع واحدهای تحت مدیریت" value={summary.totalUnits.toLocaleString('fa-IR')} icon={Layers} tone="tile" />
          <StatCard label="درآمد ماهانه مکرر (MRR)" value={toman(summary.mrr)} icon={Wallet} tone="brass" />
          <StatCard
            label="مانده بدهی اشتراک"
            value={toman(summary.totalOutstanding)}
            sub={`${summary.overdueCount} ساختمان معوق`}
            icon={AlertTriangle}
            tone={summary.overdueCount > 0 ? 'bad' : 'tile'}
          />
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1 min-w-[12rem]">{error}</span>
          <button onClick={load} className="font-medium underline shrink-0">
            تلاش دوباره
          </button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-5 pb-3">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی نام پروژه یا subdomain…"
              className="w-full rounded-xl border border-line bg-canvas ps-3 pe-9 py-2 text-sm outline-none focus:ring-2 focus:ring-tile/40"
            />
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as BuildingTier | 'all')}
            className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-tile/40"
          >
            <option value="all">همه سطوح</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={billingFilter}
            onChange={(e) => setBillingFilter(e.target.value as BillingStatus | 'all')}
            className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-tile/40"
          >
            <option value="all">همه وضعیت‌های مالی</option>
            <option value="settled">تسویه‌شده</option>
            <option value="due">سررسید نزدیک</option>
            <option value="overdue">معوق</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">نام پروژه</th>
                <th className="font-medium px-5 py-2.5">سطح</th>
                <th className="font-medium px-5 py-2.5">تعداد واحد</th>
                <th className="font-medium px-5 py-2.5">اشتراک ماهانه</th>
                <th className="font-medium px-5 py-2.5">وضعیت مالی</th>
                <th className="font-medium px-5 py-2.5">وضعیت</th>
                <th className="font-medium px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    <Loader2 size={18} className="animate-spin inline-block me-2" />
                    در حال دریافت لیست ساختمان‌ها…
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    {buildings.length === 0
                      ? 'هنوز ساختمانی تعریف نشده — با دکمه‌ی «تعریف برج / ساختمان جدید» اولین مورد را اضافه کنید.'
                      : 'موردی با این فیلترها پیدا نشد.'}
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((b) => {
                  const billing = billingLabels[b.billingStatus]
                  return (
                    <tr key={b.id} className="border-b border-line last:border-0 align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted font-mono mt-0.5" dir="ltr">
                          {b.subdomain}.pms.app
                        </p>
                        {b.managerName && <p className="text-xs text-muted mt-0.5">مدیر: {b.managerName}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <TierBadge tier={b.tier} />
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {b.unitCount.toLocaleString('fa-IR')} واحد
                        {b.floorCount ? (
                          <span className="block text-xs">{b.floorCount.toLocaleString('fa-IR')} طبقه</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">{toman(b.monthlyFee)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${billing.className}`}>
                          {billing.label}
                        </span>
                        <span className="block text-xs text-muted mt-1">
                          {b.outstandingAmount > 0 ? `مانده: ${toman(b.outstandingAmount)}` : 'بدون بدهی'}
                        </span>
                        {b.nextDueAt && (
                          <span className="block text-xs text-muted" dir="ltr">
                            سررسید بعدی: {b.nextDueAt}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={b.status} />
                      </td>
                      <td className="px-5 py-3">
                        {b.outstandingAmount > 0 ? (
                          <button
                            onClick={() => handleSettle(b)}
                            disabled={settlingId === b.id}
                            className="flex items-center gap-1.5 text-xs font-medium text-tile hover:underline whitespace-nowrap disabled:opacity-50"
                          >
                            {settlingId === b.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={13} />
                            )}
                            ثبت تسویه
                          </button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {dialogOpen && <NewBuildingDialog onClose={() => setDialogOpen(false)} onCreated={handleCreated} />}
    </div>
  )
}
