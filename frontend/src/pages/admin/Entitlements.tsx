import { useEffect, useRef, useState } from 'react'
import { Gift, Minus, RefreshCw, Trash2, Plus, Wand2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { ErrorBlock, Loading, useLoad, useToast } from '../../components/hm'
import { entitlementsApi, type Catalog, type CatalogService, type Tariff } from '../../lib/api/entitlements'
import { errText, fa } from '../../lib/api/residents'
import { money, priceText } from '../../lib/entitlementsFmt'

/** ثبت مصرف و اسکن بلیت کار مسئول مشاعات است (پنل کارکنان)؛ این صفحه فقط تنظیمات مدیر است */
type Tab = 'quotas' | 'tariffs' | 'tiers'
const TABS: { id: Tab; label: string }[] = [
  { id: 'quotas', label: 'سهمیه‌ها' },
  { id: 'tariffs', label: 'نرخ‌ها' },
  { id: 'tiers', label: 'سطوح متراژ' },
]

const cell = 'rounded-lg border border-line px-2 py-1.5 text-sm text-center bg-card min-h-[40px] focus:outline-none focus:ring-2 focus:ring-tile/40'
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

/** «۲۴۰ متر» — دقیقاً همان متراژِ ستون برگه‌ی آفرها (نام سطح فقط «واحد ۲۴۰ متری» را تکرار می‌کرد) */
const areaLabel = (a: number) => `${fa(a)} متر`
const periodLabel = (t: 'month' | 'year') => (t === 'year' ? 'سالانه' : 'ماهانه')

/**
 * مقدار سهمیه با دکمه‌های − و ＋ (هدف لمسی ۴۴px) و ورودی عددی. تغییر با ۶۰۰ میلی‌ثانیه تأخیر ذخیره می‌شود
 * تا چند ضربه‌ی پشت‌سرهم فقط یک بار محاسبه‌ی مجدد سرور را اجرا کند. اگر ذخیره شکست بخورد مقدار قبلی برمی‌گردد.
 */
function QuotaStepper({ value, label, onSave, step = 1 }: { value: number; label: string; onSave: (n: number) => Promise<void>; step?: number }) {
  const [v, setV] = useState(value)
  const [text, setText] = useState(String(value))
  const timer = useRef<number | undefined>(undefined)
  const saved = useRef(value)
  useEffect(() => {
    setV(value)
    setText(String(value))
    saved.current = value
  }, [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function commit(n: number) {
    const next = Math.max(0, Math.round(n * 100) / 100)
    setV(next)
    setText(String(next))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      if (next === saved.current) return
      try {
        await onSave(next)
        saved.current = next
      } catch {
        setV(saved.current)
        setText(String(saved.current))
      }
    }, 600)
  }
  const btn = 'w-11 h-11 shrink-0 rounded-xl border border-line flex items-center justify-center text-ink-text hover:border-tile hover:text-tile active:scale-95 transition disabled:opacity-40'
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => commit(v - step)} disabled={v <= 0} aria-label="کم کردن"><Minus size={16} /></button>
      <input
        value={text}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const n = fromFa(text)
          if (Number.isFinite(n) && n >= 0) commit(n)
          else setText(String(v))
        }}
        className="w-16 h-11 rounded-xl border border-line text-center text-base font-semibold bg-card focus:outline-none focus:ring-2 focus:ring-tile/40"
      />
      <button type="button" className={btn} onClick={() => commit(v + step)} aria-label="زیاد کردن"><Plus size={16} /></button>
    </div>
  )
}

function QuotaGrid({ cat, run }: { cat: Catalog; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const quota = cat.services.filter((s) => s.kind === 'quota')
  const [tierId, setTierId] = useState<string>('')
  if (cat.tiers.length === 0 || quota.length === 0) return <p className="p-5 text-sm text-muted">ابتدا قالب آفرها را اعمال کنید یا سطح متراژ بسازید.</p>
  const active = cat.tiers.find((t) => t.id === tierId) ?? cat.tiers[0]
  const save = (serviceId: string, tId: string) => (n: number) =>
    run(() => entitlementsApi.setQuota({ tierId: tId, serviceId, included: n }), 'سهمیه ذخیره شد')

  return (
    <>
      {/* موبایل و تبلت: یک متراژ را انتخاب می‌کنی و سهمیه‌ی همه‌ی خدماتش را زیر هم می‌بینی (کارت‌های لمسی) */}
      <div className="md:hidden px-4 pb-4 space-y-4">
        <div role="tablist" aria-label="متراژ واحد" className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 snap-x">
          {cat.tiers.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === active.id}
              onClick={() => setTierId(t.id)}
              className={`snap-start shrink-0 min-h-[44px] px-4 rounded-full text-sm font-medium border whitespace-nowrap transition ${t.id === active.id ? 'bg-ink text-white border-ink' : 'bg-card text-muted border-line'}`}
            >
              {areaLabel(t.min_area)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">سهمیه‌ی رایگان واحدهای <b className="text-ink-text">{areaLabel(active.min_area)}</b></p>
        <div className="space-y-3">
          {quota.map((s) => (
            <div key={`${active.id}-${s.id}`} className="rounded-2xl border border-line p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted mt-0.5">{s.unit_label} · {periodLabel(s.period_type)}</p>
              </div>
              <QuotaStepper value={cat.quotas[s.id]?.[active.id] ?? 0} label={`${s.title} — ${areaLabel(active.min_area)}`} onSave={save(s.id, active.id)} />
            </div>
          ))}
        </div>
      </div>

      {/* دسکتاپ: جدول کامل مثل برگه‌ی آفرها (هر ستون یک متراژ) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-muted border-y border-line">
              <th scope="col" className="font-medium px-4 py-2.5 sticky right-0 bg-card">خدمت</th>
              {cat.tiers.map((t) => <th scope="col" key={t.id} className="font-medium px-1 py-2.5 text-center whitespace-nowrap">{areaLabel(t.min_area)}</th>)}
            </tr>
          </thead>
          <tbody>
            {quota.map((s) => (
              <tr key={s.id} className="border-b border-line">
                <th scope="row" className="px-4 py-2 font-medium text-right whitespace-nowrap sticky right-0 bg-card">{s.title}<span className="block text-xs text-muted font-normal">{s.unit_label} · {periodLabel(s.period_type)}</span></th>
                {cat.tiers.map((t) => (
                  <td key={t.id} className="px-1 py-2 text-center">
                    <NumCell value={cat.quotas[s.id]?.[t.id] ?? 0} width="w-16" label={`${s.title} — ${areaLabel(t.min_area)}`} onSave={save(s.id, t.id)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
  const [tab, setTab] = useState<Tab>('quotas')
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
            <button onClick={recompute} disabled={busy} className="flex items-center gap-1.5 text-xs text-tile px-3 py-2 rounded-xl border border-line min-h-[44px] disabled:opacity-50" title="پس از تغییر متراژ واحدها، سهمیه‌ی مصرف‌های ثبت‌شده را دوباره حساب می‌کند">
              <RefreshCw size={14} /> محاسبه‌ی مجدد مصرف‌ها
            </button>
          </div>

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
                    <span className="text-sm font-medium min-w-[6rem]">{areaLabel(t.min_area)}</span>
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
