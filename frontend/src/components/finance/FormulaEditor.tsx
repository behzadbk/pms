import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Modal, TextField, SelectField, PrimaryButton, GhostButton } from '../ui/Modal'
import { Loading, ErrorBlock, useLoad, useToast } from '../hm'
import { errText } from '../../lib/api/residents'
import { currentPeriod, financeApi, periodFa, tomanText, type CalcType, type Formula, type FormulaInput } from '../../lib/api/finance'
import { MoneyField, PeriodPicker, Callout, useBusy, TH, TD } from './parts'

const TYPES: { id: CalcType; label: string; hint: string }[] = [
  { id: 'fixed', label: 'مبلغ ثابت', hint: 'همه‌ی واحدها یک مبلغ یکسان می‌پردازند' },
  { id: 'per_area', label: 'بر اساس متراژ', hint: 'مبلغ هر متر مربع × متراژ واحد' },
  { id: 'per_person', label: 'بر اساس نفرات', hint: 'مبلغ هر نفر × تعداد ساکنین فعال واحد' },
  { id: 'hybrid', label: 'ترکیبی', hint: 'مبلغ پایه + متراژ + نفرات' },
]

const empty = (): FormulaInput => ({ name: '', calc_type: 'hybrid', base_amount: 0, amount_per_sqm: 0, per_resident_amount: 0, fixed_items: [], round_to: 1000, effective_from: null, is_active: true })

/** محاسبه‌ی نمونه — همان فرمول بک‌اند (برای نمایش زنده‌ی نتیجه هنگام ویرایش) */
export function sample(f: Pick<FormulaInput, 'base_amount' | 'amount_per_sqm' | 'per_resident_amount' | 'fixed_items' | 'round_to'>, area: number, residents: number) {
  const raw = f.base_amount + f.amount_per_sqm * area + f.per_resident_amount * residents + f.fixed_items.reduce((a, i) => a + i.amount, 0)
  const step = Math.max(1, f.round_to || 1)
  return Math.round(raw / step) * step
}

/** تعریف فرمول شارژ (مدیر و حسابدار) */
export function FormulaEditor() {
  const { data, loading, error, reload } = useLoad(() => financeApi.formulas(), [])
  const { toast, toastNode } = useToast()
  const [editing, setEditing] = useState<{ id?: string; form: FormulaInput } | null>(null)

  async function toggle(f: Formula) {
    try {
      await financeApi.updateFormula(f.id, { ...f, is_active: !f.is_active })
      toast(f.is_active ? 'فرمول غیرفعال شد' : 'فرمول فعال شد')
      void reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  return (
    <Card>
      <CardHeader
        title="فرمول محاسبه‌ی شارژ"
        action={
          <PrimaryButton className="!py-2" onClick={() => setEditing({ form: empty() })}>
            <Plus size={15} /> فرمول جدید
          </PrimaryButton>
        }
      />
      <div className="px-4 sm:px-5 pb-5 space-y-3">
        <p className="text-xs text-muted leading-6">
          مبلغ شارژ هر واحد از روی فرمولِ فعال محاسبه می‌شود. اگر چند فرمول فعال باشد، فرمولی که «اعمال از دوره»اش به دوره‌ی صدور نزدیک‌تر (و کوچک‌تر یا مساوی) است استفاده می‌شود.
        </p>
        {loading && <Loading />}
        {error && <ErrorBlock message={error} retry={reload} />}
        {data && data.length === 0 && <Callout tone="warn">هنوز فرمولی تعریف نشده است؛ بدون فرمول نمی‌توان شارژ صادر کرد.</Callout>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-b border-line bg-canvas">
                  <th className={TH}>نام</th>
                  <th className={TH}>اجزا</th>
                  <th className={TH}>اعمال از</th>
                  <th className={TH}>وضعیت</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((f) => (
                  <tr key={f.id} className="border-b border-line last:border-0">
                    <td className={`${TD} font-medium`}>{f.name}<span className="block text-[11px] text-muted font-normal">{TYPES.find((t) => t.id === f.calc_type)?.label}</span></td>
                    <td className={`${TD} text-xs text-muted leading-6 min-w-[200px]`}>
                      {f.base_amount > 0 && <div>پایه: {tomanText(f.base_amount)}</div>}
                      {f.amount_per_sqm > 0 && <div>هر متر: {tomanText(f.amount_per_sqm)}</div>}
                      {f.per_resident_amount > 0 && <div>هر نفر: {tomanText(f.per_resident_amount)}</div>}
                      {f.fixed_items.map((i, k) => <div key={k}>{i.title}: {tomanText(i.amount)}</div>)}
                    </td>
                    <td className={`${TD} text-muted whitespace-nowrap`}>{f.effective_from ? periodFa(f.effective_from) : 'از ابتدا'}</td>
                    <td className={TD}>
                      <button onClick={() => toggle(f)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${f.is_active ? 'bg-good-soft text-good' : 'bg-canvas text-muted'}`}>
                        {f.is_active ? 'فعال' : 'غیرفعال'}
                      </button>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <button onClick={() => setEditing({ id: f.id, form: { name: f.name, calc_type: f.calc_type, base_amount: f.base_amount, amount_per_sqm: f.amount_per_sqm, per_resident_amount: f.per_resident_amount, fixed_items: f.fixed_items, round_to: f.round_to, effective_from: f.effective_from, is_active: f.is_active } })} className="text-tile text-xs font-medium inline-flex items-center gap-1 hover:underline">
                        <Pencil size={13} /> ویرایش
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <FormulaDialog id={editing.id} initial={editing.form} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('فرمول ذخیره شد'); void reload(true) }} onDeleted={() => { setEditing(null); toast('فرمول حذف شد'); void reload(true) }} />}
      {toastNode}
    </Card>
  )
}

function FormulaDialog({ id, initial, onClose, onSaved, onDeleted }: { id?: string; initial: FormulaInput; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [f, setF] = useState<FormulaInput>(initial)
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  const set = (p: Partial<FormulaInput>) => setF((x) => ({ ...x, ...p }))
  const t = f.calc_type
  const showBase = t === 'fixed' || t === 'hybrid'
  const showSqm = t === 'per_area' || t === 'hybrid'
  const showPerson = t === 'per_person' || t === 'hybrid'

  const clean = useMemo<FormulaInput>(
    () => ({ ...f, name: f.name.trim(), base_amount: showBase ? f.base_amount : 0, amount_per_sqm: showSqm ? f.amount_per_sqm : 0, per_resident_amount: showPerson ? f.per_resident_amount : 0, fixed_items: f.fixed_items.filter((i) => i.title.trim() && i.amount > 0).map((i) => ({ title: i.title.trim(), amount: i.amount })) }),
    [f, showBase, showSqm, showPerson],
  )
  const valid = clean.name.length >= 2 && sample(clean, 100, 3) > 0

  const save = () =>
    run(async () => {
      setErr('')
      try {
        if (id) await financeApi.updateFormula(id, clean)
        else await financeApi.createFormula(clean)
        onSaved()
      } catch (e) {
        setErr(errText(e))
      }
    })
  const del = () =>
    run(async () => {
      setErr('')
      try {
        await financeApi.deleteFormula(id!)
        onDeleted()
      } catch (e) {
        setErr(errText(e))
      }
    })

  return (
    <Modal
      open
      size="lg"
      title={id ? 'ویرایش فرمول' : 'فرمول جدید'}
      onClose={onClose}
      footer={
        <>
          {id && <GhostButton className="!text-bad ml-auto" disabled={busy} onClick={del}><Trash2 size={15} /> حذف</GhostButton>}
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={!valid || busy} onClick={save}>ذخیره</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="نام فرمول" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً شارژ پایه ۱۴۰۵" autoFocus />
        <div>
          <span className="text-xs text-muted">نوع محاسبه</span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {TYPES.map((x) => (
              <button key={x.id} type="button" onClick={() => set({ calc_type: x.id })} className={`px-3.5 py-2 rounded-xl text-sm border ${t === x.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>
                {x.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-1.5">{TYPES.find((x) => x.id === t)?.hint}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {showBase && <MoneyField label={t === 'fixed' ? 'مبلغ ثابت ماهانه (تومان)' : 'مبلغ پایه (تومان)'} value={f.base_amount} onChange={(n) => set({ base_amount: n })} />}
          {showSqm && <MoneyField label="مبلغ هر متر مربع (تومان)" value={f.amount_per_sqm} onChange={(n) => set({ amount_per_sqm: n })} />}
          {showPerson && <MoneyField label="مبلغ هر نفر (تومان)" value={f.per_resident_amount} onChange={(n) => set({ per_resident_amount: n })} />}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">اقلام ثابت اضافه (مثلاً آسانسور، نظافت)</span>
            <button type="button" onClick={() => set({ fixed_items: [...f.fixed_items, { title: '', amount: 0 }] })} className="text-xs font-medium text-tile flex items-center gap-1 hover:underline"><Plus size={13} /> افزودن</button>
          </div>
          <div className="space-y-2 mt-2">
            {f.fixed_items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_auto] gap-2 items-center">
                <input value={it.title} onChange={(e) => set({ fixed_items: f.fixed_items.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} placeholder="عنوان" className="rounded-lg border border-line px-3 py-2 text-sm bg-card min-w-0" />
                <input dir="ltr" inputMode="numeric" value={it.amount ? it.amount.toLocaleString('en-US') : ''} placeholder="مبلغ" onChange={(e) => set({ fixed_items: f.fixed_items.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value.replace(/[^\d]/g, '')) || 0 } : x)) })} className="rounded-lg border border-line px-3 py-2 text-sm bg-card min-w-0" />
                <button type="button" onClick={() => set({ fixed_items: f.fixed_items.filter((_, k) => k !== i) })} className="p-2 text-muted hover:text-bad" aria-label="حذف ردیف"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="گرد کردن مبلغ" value={String(f.round_to)} onChange={(e) => set({ round_to: Number(e.target.value) })} options={[{ value: '1', label: 'بدون گرد کردن' }, { value: '1000', label: 'به نزدیک‌ترین هزار تومان' }, { value: '10000', label: 'به نزدیک‌ترین ده هزار تومان' }]} />
          <div>
            <span className="text-xs text-muted">اعمال از دوره</span>
            <label className="flex items-center gap-2 text-sm mt-2.5">
              <input type="checkbox" checked={!f.effective_from} onChange={(e) => set({ effective_from: e.target.checked ? null : currentPeriod() })} /> از ابتدا (همه‌ی دوره‌ها)
            </label>
            {f.effective_from && <div className="mt-2"><PeriodPicker label="از دوره" value={f.effective_from} onChange={(p) => set({ effective_from: p })} /></div>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> فرمول فعال باشد</label>

        <div className="rounded-xl bg-canvas p-3 text-sm space-y-1">
          <p className="text-xs text-muted">نمونه‌ی محاسبه</p>
          <p>واحد ۱۰۰ متری با ۳ نفر: <b>{tomanText(sample(clean, 100, 3))}</b></p>
          <p>واحد ۸۰ متری با ۱ نفر: <b>{tomanText(sample(clean, 80, 1))}</b></p>
        </div>
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}
