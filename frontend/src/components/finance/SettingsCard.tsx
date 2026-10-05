import { useEffect, useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { PrimaryButton, SelectField, TextField } from '../ui/Modal'
import { Loading, ErrorBlock, useLoad, useToast } from '../hm'
import { errText } from '../../lib/api/residents'
import { financeApi, type FinanceSettings } from '../../lib/api/finance'
import { Callout, MoneyField, useBusy } from './parts'

/** تنظیمات مالی ساختمان: روز سررسید، جریمه‌ی دیرکرد (پیش‌فرض غیرفعال) و موجودی اولیه‌ی صندوق — فقط مدیر ویرایش می‌کند */
export function SettingsCard({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, reload } = useLoad(() => financeApi.settings(), [])
  const [s, setS] = useState<FinanceSettings | null>(null)
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  const { toast, toastNode } = useToast()
  useEffect(() => { if (data) setS(data) }, [data])

  if (loading) return <Card><Loading /></Card>
  if (error || !s) return <Card><div className="p-5"><ErrorBlock message={error ?? 'خطا'} retry={reload} /></div></Card>
  const set = (p: Partial<FinanceSettings>) => setS((x) => (x ? { ...x, ...p } : x))
  const dirty = JSON.stringify(s) !== JSON.stringify(data)
  const ro = !canEdit

  const save = () =>
    run(async () => {
      setErr('')
      try {
        const saved = await financeApi.saveSettings(s)
        setS(saved)
        toast('تنظیمات ذخیره شد')
        void reload(true)
      } catch (e) {
        setErr(errText(e))
      }
    })

  return (
    <Card>
      <CardHeader title="سررسید، جریمه‌ی دیرکرد و صندوق" />
      <div className="px-4 sm:px-5 pb-5 space-y-5">
        {ro && <Callout>این تنظیمات را فقط مدیر ساختمان می‌تواند تغییر دهد.</Callout>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="روز سررسید در هر ماه شمسی" hint="سررسید شارژ هر دوره، همین روز از همان ماه شمسی است (مثلاً ۱۰ ⇒ ۱۰ مهر)." type="number" min={1} max={31} disabled={ro} value={s.due_day} onChange={(e) => set({ due_day: Number(e.target.value) })} />
          <MoneyField label="موجودی اولیه‌ی صندوق (تومان)" hint="موجودی فعلی = اولیه + وصولی‌ها − فاکتورهای پرداخت‌شده" value={s.opening_balance} onChange={(n) => !ro && set({ opening_balance: n })} />
        </div>

        <div className="rounded-2xl border border-line p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">جریمه‌ی دیرکرد شارژ</p>
              <p className="text-xs text-muted leading-6 mt-1">
                نرخ جریمه تصمیم مالک/مدیر ساختمان است و به‌صورت پیش‌فرض <b>غیرفعال</b> است؛ تا وقتی فعالش نکنید هیچ جریمه‌ای محاسبه نمی‌شود.
                هر شب (ساعت ۰۰:۱۰ به وقت تهران) شارژهای پرداخت‌نشده‌ی گذشته از سررسید «معوق» می‌شوند و در صورت فعال بودن، جریمه روی مبلغ پایه‌ی همان شارژ محاسبه می‌شود (نه روی جریمه‌ی قبلی؛ اجرای تکراری هرگز دوباره جریمه نمی‌زند).
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <input type="checkbox" disabled={ro} checked={s.late_fee_enabled} onChange={(e) => set({ late_fee_enabled: e.target.checked })} /> فعال
            </label>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${s.late_fee_enabled ? '' : 'opacity-60'}`}>
            <SelectField label="روش محاسبه" disabled={ro || !s.late_fee_enabled} value={s.late_fee_mode} onChange={(e) => set({ late_fee_mode: e.target.value as FinanceSettings['late_fee_mode'] })} options={[{ value: 'per_month', label: 'درصد در ماه تأخیر' }, { value: 'per_day', label: 'درصد در روز تأخیر' }]} />
            <TextField label={s.late_fee_mode === 'per_day' ? 'نرخ (٪ در روز)' : 'نرخ (٪ در ماه)'} type="number" min={0} max={100} step="0.1" dir="ltr" disabled={ro || !s.late_fee_enabled} value={s.late_fee_rate} onChange={(e) => set({ late_fee_rate: Number(e.target.value) })} />
            <TextField label="مهلت بدون جریمه (روز)" type="number" min={0} max={365} disabled={ro || !s.late_fee_enabled} value={s.late_fee_grace_days} onChange={(e) => set({ late_fee_grace_days: Number(e.target.value) })} hint="بعد از سررسید، این چند روز جریمه نمی‌خورد" />
            <TextField label="سقف جریمه (٪ مبلغ پایه)" type="number" min={0} dir="ltr" disabled={ro || !s.late_fee_enabled} value={s.late_fee_cap_percent ?? ''} placeholder="بدون سقف" onChange={(e) => set({ late_fee_cap_percent: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          {s.late_fee_enabled && s.late_fee_rate > 0 && (
            <Callout tone="warn">
              مثال: شارژ ۳٬۰۰۰٬۰۰۰ تومانی که {(s.late_fee_mode === 'per_day' ? 10 : 31).toLocaleString('fa-IR')} روز بعد از مهلت پرداخت شود، جریمه‌اش {Math.round((3_000_000 * s.late_fee_rate * (s.late_fee_mode === 'per_day' ? 10 : 2)) / 100).toLocaleString('fa-IR')} تومان خواهد بود.
            </Callout>
          )}
        </div>

        {err && <Callout tone="warn">{err}</Callout>}
        {canEdit && (
          <div className="flex justify-end">
            <PrimaryButton disabled={!dirty || busy} onClick={save}>ذخیره‌ی تنظیمات</PrimaryButton>
          </div>
        )}
      </div>
      {toastNode}
    </Card>
  )
}
