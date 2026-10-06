import { useState } from 'react'
import { Gift, RefreshCw, Trash2, Plus, Wand2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { ErrorBlock, Loading, useLoad, useToast } from '../../components/hm'
import { entitlementsApi, type Catalog, type CatalogService, type Tariff } from '../../lib/api/entitlements'
import { errText, fa } from '../../lib/api/residents'
import { money, priceText } from '../../lib/entitlementsFmt'
import { EntitlementDesk } from '../staff/EntitlementDesk'

type Tab = 'desk' | 'quotas' | 'tariffs' | 'tiers'
const TABS: { id: Tab; label: string }[] = [
  { id: 'desk', label: 'میز مصرف' },
  { id: 'quotas', label: 'سهمیه‌ها' },
  { id: 'tariffs', label: 'نرخ‌ها' },
  { id: 'tiers', label: 'سطوح متراژ' },
]

const cell = 'w-20 rounded-lg border border-line px-2 py-1.5 text-sm text-center bg-card min-h-[40px] focus:outline-none focus:ring-2 focus:ring-tile/40'
const fromFa = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٬,]/g, '').replace('٫', '.'))

/** عدد قابل‌ویرایش که با خروج از فیلد ذخیره می‌شود */
function NumCell({ value, onSave, width = 'w-20', label }: { value: number; onSave: (n: number) => Promise<void>; width?: string; label: string }) {
  const [v, setV] = useState(String(value))
  const [busy, setBusy] = useState(false)
  return (
    <input
      value={v}
      aria-label={label}
      disabled={busy}
      inputMode="decimal"
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={async () => {
        const n = fromFa(v)
        if (!Number.isFinite(n) || n < 0) return setV(String(value))
        if (n === value) return
        setBusy(true)
        try {
          await onSave(n)
        } catch {
          setV(String(value))
        } finally {
          setBusy(false)
        }
      }}
      className={`${cell} ${width}`}
    />
  )
}

function QuotaGrid({ cat, run }: { cat: Catalog; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const quota = cat.services.filter((s) => s.kind === 'quota')
  if (cat.tiers.length === 0 || quota.length === 0) return <p className="p-5 text-sm text-muted">ابتدا قالب آفرها را اعمال کنید یا سطح متراژ بسازید.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-muted border-y border-line">
            <th className="font-medium px-4 py-2.5 sticky right-0 bg-card">خدمت</th>
            {cat.tiers.map((t) => <th key={t.id} className="font-medium px-2 py-2.5 text-center whitespace-nowrap">{t.name}<span className="block text-xs">{fa(t.min_area)}+ متر</span></th>)}
          </tr>
        </thead>
        <tbody>
          {quota.map((s) => (
            <tr key={s.id} className="border-b border-line">
              <td className="px-4 py-2 font-medium whitespace-nowrap sticky right-0 bg-card">{s.title}<span className="block text-xs text-muted font-normal">{s.unit_label} · {s.period_type === 'year' ? 'سالانه' : 'ماهانه'}</span></td>
              {cat.tiers.map((t) => (
                <td key={t.id} className="px-2 py-2 text-center">
                  <NumCell
                    value={cat.quotas[s.id]?.[t.id] ?? 0}
                    label={`${s.title} — ${t.name}`}
                    onSave={(n) => run(() => entitlementsApi.setQuota({ tierId: t.id, serviceId: s.id, included: n }), 'سهمیه ذخیره شد')}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TariffRow({ s, t, run }: { s: CatalogService; t: Tariff; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const save = (b: Parameters<typeof entitlementsApi.patchTariff>[1]) => run(() => entitlementsApi.patchTariff(t.id, b), 'نرخ ذخیره شد')
  return (
    <div className={`flex flex-wrap items-center gap-3 py-2.5 ${t.is_active ? '' : 'opacity-50'}`}>
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm font-medium">{t.title}</p>
        <p className="text-xs text-muted">{priceText(t, s.unit_label)}{t.counts_toward_quota || s.kind !== 'quota' ? '' : ' · از سهمیه کم نمی‌شود'}</p>
      </div>
      <label className="text-xs text-muted flex items-center gap-1.5">
        قیمت (تومان)
        <NumCell value={t.unit_price} width="w-28" label={`قیمت ${t.title}`} onSave={(n) => save({ unit_price: n })} />
      </label>
      {s.unit_kind === 'minutes' || t.step > 1 ? (
        <label className="text-xs text-muted flex items-center gap-1.5">
          گام ({s.unit_label})
          <NumCell value={t.step} width="w-16" label={`گام ${t.title}`} onSave={(n) => (n >= 1 ? save({ step: n }) : Promise.reject(new Error('x')))} />
        </label>
      ) : null}
      <button onClick={() => save({ is_active: !t.is_active })} className="text-xs text-tile px-2 py-2 min-h-[40px]">{t.is_active ? 'غیرفعال' : 'فعال‌سازی'}</button>
    </div>
  )
}

export function AdminEntitlements() {
  const cfg = useLoad(() => entitlementsApi.config(), [])
  const [tab, setTab] = useState<Tab>('desk')
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()
  const [newArea, setNewArea] = useState('')
  const [newName, setNewName] = useState('')

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      toast(ok)
      await cfg.reload(true)
    } catch (e) {
      toast(errText(e))
      throw e
    }
  }

  async function template() {
    setBusy(true)
    try {
      await entitlementsApi.applyTemplate(false)
      toast('قالب آفرهای برج باران ۳ اعمال شد')
      await cfg.reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function recompute() {
    setBusy(true)
    try {
      const r = await entitlementsApi.recompute()
      toast(`محاسبه‌ی مجدد انجام شد (${fa(r.pairs)} مورد)`)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (cfg.loading) return <Loading />
  if (cfg.error || !cfg.data) return <ErrorBlock message={cfg.error ?? 'خطا در دریافت تنظیمات آفرها'} retry={cfg.reload} />
  const cat = cfg.data
  const empty = cat.services.length === 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">آفرها و خدمات واحدها</h1>
        <p className="text-muted text-sm mt-1">سهمیه‌ی رایگان بر اساس متراژ هر واحد؛ مصرف مازاد به شارژ ماه بعد اضافه می‌شود</p>
      </div>

      {empty ? (
        <Card>
          <div className="p-6 flex flex-col items-center text-center gap-3">
            <Gift size={34} className="text-tile" />
            <p className="font-semibold">هنوز آفری تعریف نشده است</p>
            <p className="text-sm text-muted leading-7 max-w-md">می‌توانید جدول آفرها و نرخ‌های ۱۴۰۵ برج باران ۳ (۹ سطح متراژ و ۲۰ خدمت) را یک‌جا اعمال و سپس مطابق ساختمان خودتان ویرایش کنید.</p>
            <button onClick={template} disabled={busy} className="flex items-center gap-2 bg-tile text-white px-5 py-3 rounded-xl text-sm font-medium hover:opacity-90 min-h-[48px] disabled:opacity-60">
              <Wand2 size={16} /> {busy ? 'در حال اعمال…' : 'اعمال قالب برج باران ۳'}
            </button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 bg-card border border-line rounded-2xl p-1.5 w-fit max-w-full overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap min-h-[44px] ${tab === t.id ? 'bg-ink text-white' : 'text-muted hover:text-ink-text'}`}>{t.label}</button>
              ))}
            </div>
            {tab !== 'desk' && (
              <button onClick={recompute} disabled={busy} className="flex items-center gap-1.5 text-xs text-tile px-3 py-2 rounded-xl border border-line min-h-[44px] disabled:opacity-50" title="پس از تغییر متراژ واحدها، سهمیه‌ی مصرف‌های ثبت‌شده را دوباره حساب می‌کند">
                <RefreshCw size={14} /> محاسبه‌ی مجدد مصرف‌ها
              </button>
            )}
          </div>

          {tab === 'desk' && <div className="staff-embedded"><EntitlementDesk /></div>}

          {tab === 'quotas' && (
            <Card>
              <CardHeader title="سهمیه‌ی رایگان هر سطح" />
              <QuotaGrid cat={cat} run={run} />
              <p className="px-5 py-3 text-xs text-muted leading-6">با هر تغییر، مازاد مصرف‌های ثبت‌شده‌ی بدون صورتحساب دوباره محاسبه می‌شود؛ مصرف‌هایی که قبلاً به شارژ رفته‌اند ثابت می‌مانند.</p>
            </Card>
          )}

          {tab === 'tariffs' && (
            <div className="space-y-4">
              {cat.services.filter((s) => s.tariffs.length > 0).map((s) => (
                <Card key={s.id}>
                  <CardHeader title={`${s.title}${s.kind === 'quota' ? ' (سهمیه‌دار)' : s.kind === 'free' ? ' (رایگان)' : ''}`} />
                  <div className="px-5 pb-4 divide-y divide-line">
                    {s.tariffs.map((t) => <TariffRow key={t.id} s={s} t={t} run={run} />)}
                  </div>
                </Card>
              ))}
              <p className="text-xs text-muted leading-6">تغییر نرخ فقط روی مصرف‌های بعدی اثر دارد؛ هر مصرف نرخ لحظه‌ی ثبت خود را نگه می‌دارد. نرخ فعلی نمونه: {money(cat.services.flatMap((s) => s.tariffs)[0]?.unit_price ?? 0)}</p>
            </div>
          )}

          {tab === 'tiers' && (
            <Card>
              <CardHeader title="سطوح متراژ" />
              <div className="px-5 pb-5 space-y-3">
                {cat.tiers.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium min-w-[6rem]">{t.name}</span>
                    <label className="text-xs text-muted flex items-center gap-1.5">
                      از متراژ
                      <NumCell value={t.min_area} label={`حداقل متراژ ${t.name}`} onSave={(n) => run(() => entitlementsApi.patchTier(t.id, { min_area: n }), 'سطح ذخیره شد')} />
                    </label>
                    <button
                      onClick={() => run(() => entitlementsApi.deleteTier(t.id), 'سطح حذف شد').catch(() => undefined)}
                      className="text-bad p-2 rounded-lg hover:bg-bad-soft min-h-[40px]"
                      aria-label={`حذف ${t.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <form
                  className="flex flex-wrap items-end gap-3 pt-3 border-t border-line"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const a = fromFa(newArea)
                    if (!Number.isFinite(a) || a < 1) return toast('متراژ را درست وارد کنید')
                    await run(() => entitlementsApi.addTier({ min_area: a, name: newName.trim() || undefined }), 'سطح اضافه شد').then(() => { setNewArea(''); setNewName('') }).catch(() => undefined)
                  }}
                >
                  <label className="text-xs text-muted block">
                    از متراژ
                    <input value={newArea} onChange={(e) => setNewArea(e.target.value)} inputMode="decimal" className={`${cell} block mt-1 w-24`} />
                  </label>
                  <label className="text-xs text-muted block">
                    نام (اختیاری)
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} className={`${cell} block mt-1 w-36`} />
                  </label>
                  <button type="submit" className="flex items-center gap-1.5 bg-tile text-white px-4 rounded-xl text-sm font-medium min-h-[44px]"><Plus size={15} /> افزودن سطح</button>
                </form>
                <p className="text-xs text-muted leading-6">واحد با متراژ X در بالاترین سطحی قرار می‌گیرد که حداقل متراژش ≤ X باشد.</p>
              </div>
            </Card>
          )}
        </>
      )}
      {toastNode}
    </div>
  )
}
