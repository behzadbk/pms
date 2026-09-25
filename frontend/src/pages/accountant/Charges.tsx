import { useState } from 'react'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { Modal, TextField, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { toman, unitsDirectory } from '../../lib/mockData'
import { useStore, updateCharge, issueCharges, type ChargeRec } from '../../lib/store'
import { chargeStats, periods } from '../../lib/finance'

type FormulaType = 'fixed' | 'per_area' | 'per_person' | 'hybrid'

const formulaTypes: { id: FormulaType; label: string }[] = [
  { id: 'fixed', label: 'مبلغ ثابت' },
  { id: 'per_area', label: 'بر اساس متراژ' },
  { id: 'per_person', label: 'بر اساس تعداد نفرات' },
  { id: 'hybrid', label: 'فرمول ترکیبی' },
]

const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

export function AccountantCharges() {
  const { charges } = useStore()
  const allPeriods = periods(charges)
  const [period, setPeriod] = useState(allPeriods[0] ?? '')
  const [formula, setFormula] = useState<FormulaType>('hybrid')
  const [params, setParams] = useState({ fixed: 2_800_000, base: 1_200_000, perArea: 4_500, perPerson: 80_000, area: 6_200, person: 650_000 })
  const [issuePeriod, setIssuePeriod] = useState({ month: 'مهر', year: '۱۴۰۵', due: '۱۴۰۵/۰۷/۱۰' })
  const [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState<ChargeRec | null>(null)
  const [flash, setFlash] = useState('')

  const current = charges.filter((c) => c.period === (period || allPeriods[0]))
  const stats = chargeStats(current)
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0

  const rows = unitsDirectory.map((u) => {
    const base =
      formula === 'fixed'
        ? params.fixed
        : formula === 'per_area'
          ? u.area * params.area
          : formula === 'per_person'
            ? u.occupants * params.person
            : params.base + u.area * params.perArea + u.occupants * params.perPerson
    return { unit: u.unit, area: u.area, occupants: u.occupants, base: Math.round(base / 1000) * 1000 }
  })
  const issueLabel = `${issuePeriod.month} ${issuePeriod.year}`

  function doIssue() {
    issueCharges(issueLabel, issuePeriod.due, rows.map((r) => ({ unit: r.unit, base: r.base })))
    setPreview(false)
    setPeriod(issueLabel)
    setFlash(`شارژ ${issueLabel} برای ${rows.length.toLocaleString('fa-IR')} واحد صادر و برای ساکنین اعلان شد.`)
  }

  const P = (k: keyof typeof params, label: string) => (
    <TextField key={k} label={label} inputMode="numeric" value={params[k].toLocaleString('en-US')} onChange={(e) => setParams((p) => ({ ...p, [k]: num(e.target.value) }))} />
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">شارژ و مطالبات</h1>
        <p className="text-muted text-sm mt-1">تعریف فرمول، صدور شارژ ماهانه، ثبت وصولی و پیگیری معوقات</p>
      </div>

      {flash && (
        <p className="text-sm bg-good-soft text-good rounded-xl px-4 py-3 flex items-center gap-2">
          <CheckCircle2 size={16} /> {flash}
        </p>
      )}

      <Card>
        <CardHeader title="فرمول محاسبه و صدور شارژ" />
        <div className="px-5 pb-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {formulaTypes.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormula(f.id)}
                className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${
                  formula === f.id ? 'bg-ink text-white border-ink' : 'border-line text-ink-text hover:border-ink-soft'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {formula === 'hybrid' && (
              <>
                {P('base', 'مبلغ پایه (تومان)')}
                {P('perArea', 'مبلغ به ازای هر متر')}
                {P('perPerson', 'مبلغ به ازای هر نفر')}
              </>
            )}
            {formula === 'fixed' && P('fixed', 'مبلغ ثابت ماهانه (تومان)')}
            {formula === 'per_area' && P('area', 'مبلغ به ازای هر متر مربع')}
            {formula === 'per_person' && P('person', 'مبلغ به ازای هر نفر')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end border-t border-line pt-4">
            <SelectField label="ماه" value={issuePeriod.month} onChange={(e) => setIssuePeriod((p) => ({ ...p, month: e.target.value }))} options={months.map((m) => ({ value: m, label: m }))} />
            <TextField label="سال" value={issuePeriod.year} onChange={(e) => setIssuePeriod((p) => ({ ...p, year: e.target.value }))} />
            <TextField label="سررسید" value={issuePeriod.due} onChange={(e) => setIssuePeriod((p) => ({ ...p, due: e.target.value }))} />
            <PrimaryButton className="!bg-tile" onClick={() => setPreview(true)}>
              <Sparkles size={16} /> پیش‌نمایش و صدور
            </PrimaryButton>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="لیست شارژها"
          action={
            <select value={period || allPeriods[0]} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 text-sm bg-card">
              {allPeriods.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          }
        />
        <div className="px-5 pb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>کل: <b className="text-ink-text">{toman(stats.total)}</b></span>
          <span>وصول‌شده: <b className="text-good">{toman(stats.paid)} ({stats.rate.toLocaleString('fa-IR')}٪)</b></span>
          <span>معوق: <b className="text-bad">{toman(stats.overdueTotal)}</b></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">واحد</th>
                <th className="font-medium px-5 py-2.5">مبلغ پایه</th>
                <th className="font-medium px-5 py-2.5">جریمه دیرکرد</th>
                <th className="font-medium px-5 py-2.5">جمع کل</th>
                <th className="font-medium px-5 py-2.5">سررسید</th>
                <th className="font-medium px-5 py-2.5">وضعیت</th>
                <th className="font-medium px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {current.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{c.unit}</td>
                  <td className="px-5 py-3 text-muted">{toman(c.base)}</td>
                  <td className="px-5 py-3 text-muted">{c.lateFee ? toman(c.lateFee) : '—'}</td>
                  <td className="px-5 py-3 font-medium">{toman(c.total)}</td>
                  <td className="px-5 py-3 text-muted">{c.dueDate}</td>
                  <td className="px-5 py-3"><StatusPill status={c.status} /></td>
                  <td className="px-5 py-3 whitespace-nowrap space-x-3 space-x-reverse">
                    {c.status !== 'paid' && (
                      <button
                        onClick={() => updateCharge(c.id, { status: 'paid', paidAt: new Date().toISOString(), payMethod: 'ثبت دستی حسابداری' })}
                        className="text-good text-xs font-medium hover:underline"
                      >
                        ثبت وصول
                      </button>
                    )}
                    <button onClick={() => setEditing(c)} className="text-tile text-xs font-medium hover:underline">ویرایش</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={preview}
        size="lg"
        title={`پیش‌نمایش شارژ ${issueLabel}`}
        onClose={() => setPreview(false)}
        footer={
          <>
            <span className="text-sm ml-auto self-center">جمع: <b>{toman(rows.reduce((a, r) => a + r.base, 0))}</b></span>
            <GhostButton onClick={() => setPreview(false)}>انصراف</GhostButton>
            <PrimaryButton onClick={doIssue}>صدور و اعلان به ساکنین</PrimaryButton>
          </>
        }
      >
        {allPeriods.includes(issueLabel) && (
          <p className="text-xs text-warn bg-warn-soft rounded-lg px-3 py-2 mb-3">شارژ {issueLabel} قبلاً صادر شده؛ صدور مجدد جایگزین آن می‌شود.</p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-muted border-b border-line">
              <th className="font-medium py-2">واحد</th>
              <th className="font-medium py-2">متراژ</th>
              <th className="font-medium py-2">نفرات</th>
              <th className="font-medium py-2">مبلغ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unit} className="border-b border-line last:border-0">
                <td className="py-2">{r.unit}</td>
                <td className="py-2 text-muted">{r.area.toLocaleString('fa-IR')}</td>
                <td className="py-2 text-muted">{r.occupants.toLocaleString('fa-IR')}</td>
                <td className="py-2 font-medium">{toman(r.base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      {editing && <EditChargeDialog charge={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditChargeDialog({ charge, onClose }: { charge: ChargeRec; onClose: () => void }) {
  const [base, setBase] = useState(charge.base)
  const [lateFee, setLateFee] = useState(charge.lateFee)
  const [dueDate, setDueDate] = useState(charge.dueDate)
  const [status, setStatus] = useState(charge.status)
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0

  function save() {
    updateCharge(charge.id, {
      base,
      lateFee,
      total: base + lateFee,
      dueDate,
      status,
      paidAt: status === 'paid' ? charge.paidAt ?? new Date().toISOString() : undefined,
      payMethod: status === 'paid' ? charge.payMethod ?? 'ثبت دستی حسابداری' : undefined,
    })
    onClose()
  }

  return (
    <Modal
      open
      title={`ویرایش شارژ ${charge.unit} — ${charge.period}`}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton onClick={save}>ذخیره</PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="مبلغ پایه (تومان)" inputMode="numeric" value={base.toLocaleString('en-US')} onChange={(e) => setBase(num(e.target.value))} />
        <TextField label="جریمه دیرکرد (تومان)" inputMode="numeric" value={lateFee.toLocaleString('en-US')} onChange={(e) => setLateFee(num(e.target.value))} />
        <TextField label="سررسید" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <SelectField
          label="وضعیت"
          value={status}
          onChange={(e) => setStatus(e.target.value as ChargeRec['status'])}
          options={[{ value: 'pending', label: 'در انتظار' }, { value: 'paid', label: 'پرداخت‌شده' }, { value: 'overdue', label: 'معوق' }]}
        />
        <p className="sm:col-span-2 text-sm bg-canvas rounded-xl p-3">جمع کل: <b>{toman(base + lateFee)}</b></p>
      </div>
    </Modal>
  )
}
