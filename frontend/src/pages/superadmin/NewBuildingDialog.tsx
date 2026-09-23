import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { featureLabels, suggestMonthlyFee, tierById, tiers, type BuildingTier } from '../../lib/tiers'
import { toman } from '../../lib/mockData'
import { platformApi, ApiError } from '../../lib/api'
import type { Building } from '../../lib/api/platform'

/**
 * فرم «تعریف برج / ساختمان جدید» — نکته‌ی اصلی این فرم انتخاب سطح سرویس است:
 * با تغییر سطح، هم فهرست ماژول‌های فعالِ آن مجتمع عوض می‌شود و هم مبلغ پیشنهادی
 * اشتراک ماهانه (قیمت پایه‌ی هر سطح × تعداد واحد) دوباره محاسبه می‌شود.
 */
export function NewBuildingDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (building: Building) => void
}) {
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [tier, setTier] = useState<BuildingTier>('simple')
  const [unitCount, setUnitCount] = useState('')
  const [floorCount, setFloorCount] = useState('')
  const [managerName, setManagerName] = useState('')
  const [managerPhone, setManagerPhone] = useState('')
  const [address, setAddress] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [status, setStatus] = useState<'trial' | 'active'>('trial')
  const [feeTouched, setFeeTouched] = useState(false)
  const [monthlyFee, setMonthlyFee] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const units = Number(unitCount) || 0
  const suggestedFee = useMemo(() => suggestMonthlyFee(tier, units), [tier, units])

  // تا وقتی کاربر دستی مبلغ را عوض نکرده، مبلغ پیشنهادی با سطح/تعداد واحد همگام می‌ماند
  useEffect(() => {
    if (!feeTouched) setMonthlyFee(suggestedFee ? String(suggestedFee) : '')
  }, [suggestedFee, feeTouched])

  // بستن با Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedTier = tierById[tier]

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (units < 1) {
      setError('تعداد واحد باید حداقل ۱ باشد')
      return
    }
    if (adminEmail.trim() && adminPassword.length < 8) {
      setError('رمز مدیر مجتمع باید حداقل ۸ کاراکتر باشد')
      return
    }
    setSubmitting(true)
    try {
      const created = await platformApi.createBuilding({
        name: name.trim(),
        subdomain: subdomain.trim().toLowerCase(),
        tier,
        unitCount: units,
        floorCount: floorCount ? Number(floorCount) : undefined,
        address: address.trim() || undefined,
        managerName: managerName.trim() || undefined,
        managerPhone: managerPhone.trim() || undefined,
        monthlyFee: monthlyFee ? Number(monthlyFee) : undefined,
        status,
        adminEmail: adminEmail.trim() || undefined,
        adminPassword: adminEmail.trim() ? adminPassword : undefined,
        adminFullName: managerName.trim() || undefined,
      })
      onCreated(created)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'ثبت ساختمان ناموفق بود — اتصال به بک‌اند را بررسی کنید.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-card z-10">
          <h2 className="font-semibold">تعریف برج / ساختمان جدید</h2>
          <button onClick={onClose} className="text-muted hover:text-ink-text p-1" aria-label="بستن">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {/* --- سطح سرویس --- */}
          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium">سطح سرویس</p>
              <p className="text-xs text-muted mt-0.5">
                سطح انتخابی تعیین می‌کند کدام ماژول‌ها برای این مجتمع فعال شود.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {tiers.map((t) => {
                const active = t.id === tier
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTier(t.id)}
                    className={`text-right rounded-xl border p-4 transition-colors ${
                      active ? 'border-tile ring-1 ring-tile bg-tile-soft/40' : 'border-line hover:bg-canvas'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{t.label}</span>
                      {active && <Check size={16} className="text-tile shrink-0" />}
                    </div>
                    <p className="text-xs text-muted mt-1.5 leading-5">{t.summary}</p>
                    <p className="text-xs mt-2.5 text-ink-text">
                      {t.pricePerUnit.toLocaleString('fa-IR')} تومان / واحد در ماه
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-xs text-muted mb-2">{selectedTier.fitFor}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                {selectedTier.features.map((f) => (
                  <div key={f} className="flex items-center gap-1.5 text-xs">
                    <Check size={12} className="text-good shrink-0" />
                    {featureLabels[f]}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* --- مشخصات پروژه --- */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="نام پروژه" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                placeholder="مثلاً برج آفتاب"
                className={inputClass}
              />
            </Field>

            <Field label="subdomain اختصاصی" required hint="فقط حروف کوچک انگلیسی، عدد و خط تیره">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                required
                pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]"
                placeholder="borj-aftab"
                dir="ltr"
                className={`${inputClass} font-mono`}
              />
            </Field>

            <Field label="تعداد واحد" required>
              <input
                type="number"
                min={1}
                max={5000}
                value={unitCount}
                onChange={(e) => setUnitCount(e.target.value)}
                required
                className={inputClass}
              />
            </Field>

            <Field label="تعداد طبقه">
              <input
                type="number"
                min={1}
                max={200}
                value={floorCount}
                onChange={(e) => setFloorCount(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="نام مدیر ساختمان">
              <input value={managerName} onChange={(e) => setManagerName(e.target.value)} className={inputClass} />
            </Field>

            <Field label="موبایل مدیر" hint="۱۱ رقم، با ۰ شروع شود">
              <input
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
                pattern="0\d{10}"
                placeholder="09121234567"
                dir="ltr"
                className={inputClass}
              />
            </Field>

            <Field label="ایمیل ورود مدیر مجتمع" hint="با این ایمیل و subdomain وارد پنل مدیریت می‌شود">
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="manager@example.com"
                dir="ltr"
                className={inputClass}
              />
            </Field>

            <Field label="رمز اولیه‌ی مدیر" hint="حداقل ۸ کاراکتر — بعد از اولین ورود تغییر دهد">
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required={!!adminEmail.trim()}
                minLength={8}
                dir="ltr"
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="آدرس">
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          {/* --- اشتراک --- */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="مبلغ اشتراک ماهانه (تومان)"
              hint={units > 0 ? `پیشنهاد بر اساس سطح و تعداد واحد: ${toman(suggestedFee)}` : undefined}
            >
              <input
                type="number"
                min={0}
                value={monthlyFee}
                onChange={(e) => {
                  setFeeTouched(true)
                  setMonthlyFee(e.target.value)
                }}
                dir="ltr"
                className={`${inputClass} text-right`}
              />
            </Field>

            <Field label="وضعیت اولیه">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'trial' | 'active')}
                className={inputClass}
              >
                <option value="trial">دوره آزمایشی</option>
                <option value="active">فعال</option>
              </select>
            </Field>
          </section>

          {error && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-line text-sm hover:bg-canvas"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              ثبت ساختمان
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tile/40'

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-text">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}
