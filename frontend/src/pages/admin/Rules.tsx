import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ShieldAlert, Info } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { residentsApi, errText, fa, type BuildingRules } from '../../lib/api/residents'
import { Badge, Cta, ErrorBlock, Loading, Note, PageTitle, Seg, StickyCta, useLoad, useToast } from '../../components/hm'

type Mode = 'free' | 'locked'
const PRESETS = [7, 15, 30, 60]

/**
 * «قوانین و برج» — پنل یکپارچه‌ی مدیر:
 *  • قوانین برج: مهلت بدهکاری + برای هر بخش/مشاع «آزاد / بسته برای واحد بدهکار»
 *  • قوانین رزرو هر مشاع (سقف، پیش‌رزرو، تایم‌تیبل) در صفحه‌ی «مشاعات» تنظیم می‌شود
 */
export function AdminRules() {
  const [sp] = useSearchParams()
  // لینک‌های قدیمی تب «رزرو هوشمند» → صفحه‌ی مشاعات
  if (sp.get('tab') === 'amenities') return <Navigate to="/admin/reservations?tab=setup" replace />
  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="مدیریت ساختمان" title="قوانین و برج" />
      <TowerRules />
      <p className="text-xs text-[var(--hm-t2)]">
        سقف رزرو، حداکثر ساعت و تایم‌تیبل هر مشاع در <Link to="/admin/reservations?tab=setup" className="font-bold underline">صفحه‌ی مشاعات</Link> تنظیم می‌شود.
      </p>
    </div>
  )
}

function TowerRules() {
  const { user } = useAuth()
  const buildingId = user?.tenantId ?? ''
  const { data, error, loading, reload } = useLoad<BuildingRules>(() => residentsApi.rules(buildingId), [buildingId])
  const [days, setDays] = useState('30')
  const [res, setRes] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()

  useEffect(() => {
    if (!data) return
    setDays(String(data.debtor_grace_days))
    setRes(data.restrictions ?? {})
  }, [data])

  const n = Number(days.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
  const daysOk = Number.isInteger(n) && n >= 0 && n <= 365
  const dirty = useMemo(() => {
    if (!data) return false
    const a = Object.entries(res).filter(([, v]) => v).map(([k]) => k).sort().join()
    const b = Object.entries(data.restrictions ?? {}).filter(([, v]) => v).map(([k]) => k).sort().join()
    return a !== b || n !== data.debtor_grace_days
  }, [data, res, n])

  const set = (k: string, m: Mode) => setRes((r) => ({ ...r, [k]: m === 'locked' }))
  const mode = (k: string): Mode => (res[k] ? 'locked' : 'free')
  const allAmenities = !!res['module:amenity']

  async function save() {
    if (!daysOk) return toast('مهلت باید عددی بین ۰ تا ۳۶۵ روز باشد')
    setBusy(true)
    try {
      const clean = Object.fromEntries(Object.entries(res).filter(([, v]) => v))
      await residentsApi.saveRules(buildingId, { debtor_grace_days: n, restrictions: clean })
      toast('قوانین برج ذخیره شد')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? ''} retry={() => reload()} />

  const lockedCount = Object.values(res).filter(Boolean).length
  return (
    <div className="flex flex-col gap-4">
      <div className="hm-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-[var(--hm-warn)]" />
          <p className="text-sm font-bold">مهلت بدهکاری</p>
          {data.debtor_units_now > 0 && <Badge tone="bad">{fa(data.debtor_units_now)} واحد بدهکار فعلی</Badge>}
        </div>
        <p className="text-xs leading-6 text-[var(--hm-t2)]">
          واحدی که شارژ سررسیدشده‌اش را بعد از این تعداد روز نپردازد «بدهکار» حساب می‌شود و بخش‌های انتخاب‌شده‌ی زیر برایش بسته می‌شود. با پرداخت شارژ، فوراً باز می‌شود.
        </p>
        <label className="flex items-center gap-3">
          <input
            className="hm-input !w-24 text-center"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="تعداد روز مهلت"
          />
          <span className="text-sm">روز پس از سررسید شارژ</span>
        </label>
        {!daysOk && <p className="text-xs font-bold text-[var(--hm-bad)]">عددی بین ۰ تا ۳۶۵ وارد کنید</p>}
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p} className="hm-chip" data-on={n === p} onClick={() => setDays(String(p))}>
              {fa(p)} روز
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm font-bold">محدودیت واحد بدهکار</p>

      <div className="hm-card px-4 py-1 hm-divided">
        {(data.modules ?? []).map((m) => (
          <RuleRow key={m.key} title={m.label} hint={m.hint} value={mode(m.key)} onChange={(v) => set(m.key, v)} />
        ))}
      </div>

      <p className="text-sm font-bold">مشاعات</p>
      <div className="hm-card px-4 py-1 hm-divided">
        {(data.amenities ?? []).length === 0 && <p className="py-3 text-xs text-[var(--hm-t2)]">مشاع فعالی ثبت نشده است</p>}
        {allAmenities && (
          <p className="py-2 text-xs text-[var(--hm-warn)]">گزینه‌ی «همه‌ی مشاعات» بسته است؛ همه‌ی مشاعات زیر برای بدهکار بسته می‌ماند.</p>
        )}
        {(data.amenities ?? []).map((a) => (
          <RuleRow
            key={a.key}
            title={a.label}
            value={allAmenities ? 'locked' : mode(a.key)}
            disabled={allAmenities}
            onChange={(v) => set(a.key, v)}
          />
        ))}
      </div>

      <Note tone="pri" icon={Info}>
        پرداخت شارژ، تیکت، اعلانات، مرسوله و تماس اضطراری هرگز بسته نمی‌شود تا ساکن بدهکار بتواند بدهی را تسویه کند و به کمک اضطراری دسترسی داشته باشد.
      </Note>

      <StickyCta>
        <Cta onClick={save} busy={busy} disabled={!dirty || !daysOk}>
          {dirty ? `ذخیره‌ی قوانین${lockedCount ? ` · ${fa(lockedCount)} محدودیت` : ''}` : 'بدون تغییر'}
        </Cta>
      </StickyCta>
      {toastNode}
    </div>
  )
}

function RuleRow({ title, hint, value, onChange, disabled }: { title: string; hint?: string; value: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div className="py-3 flex flex-col gap-2" style={disabled ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
      <div>
        <p className="text-sm font-bold">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--hm-t2)]">{hint}</p>}
      </div>
      <Seg<Mode> small options={[['free', 'آزاد'], ['locked', 'بسته برای بدهکار']]} value={value} onChange={onChange} colors={{ locked: 'var(--hm-bad)' }} />
    </div>
  )
}
