import { useEffect, useMemo, useState } from 'react'
import { Sparkles, CheckCircle2, RefreshCw, Receipt } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { StatusPill } from '../ui/StatusPill'
import { Modal, PrimaryButton, GhostButton, SelectField, TextField } from '../ui/Modal'
import { Loading, ErrorBlock, useLoad, useToast } from '../hm'
import { errText } from '../../lib/api/residents'
import { chargeStats, currentPeriod, dayFa, financeApi, instantFa, methodFa, periodFa, tomanText, type Charge, type ChargePlan, type PayMethod } from '../../lib/api/finance'
import { Callout, MoneyField, PeriodPicker, useBusy, TH, TD } from './parts'

/**
 * صدور شارژ (پیش‌نمایش ← تأیید) + فهرست شارژها + ثبت پرداخت دستی.
 * مشترک بین پنل حسابداری و تب «شارژ» گزارش مالی مدیر؛ هر دو نقش همین API را صدا می‌زنند.
 */
export function ChargeManager({ onChanged }: { onChanged?: () => void }) {
  const periods = useLoad(() => financeApi.periods(), [])
  const formulas = useLoad(() => financeApi.formulas(), [])
  const gateway = useLoad(() => financeApi.gateway(), [])
  const [period, setPeriod] = useState('')
  const [issueP, setIssueP] = useState(currentPeriod())
  const [formulaId, setFormulaId] = useState('')
  const [plan, setPlan] = useState<ChargePlan | null>(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Charge | null>(null)
  const [paying, setPaying] = useState<Charge | null>(null)
  const { busy, run } = useBusy()
  const { toast, toastNode } = useToast()

  useEffect(() => {
    if (!period && periods.data?.length) setPeriod(periods.data.includes(currentPeriod()) ? currentPeriod() : periods.data[0])
  }, [periods.data, period])

  const charges = useLoad(() => (period ? financeApi.charges({ period }) : Promise.resolve([] as Charge[])), [period])
  const stats = useMemo(() => chargeStats(charges.data ?? []), [charges.data])
  const activeFormulas = (formulas.data ?? []).filter((f) => f.is_active)

  const refresh = () => { void periods.reload(true); void charges.reload(true); onChanged?.() }

  const doPreview = () =>
    run(async () => {
      setErr('')
      try {
        setPlan(await financeApi.preview({ period: issueP, formulaId: formulaId || undefined }))
      } catch (e) {
        setErr(errText(e))
      }
    })

  const doIssue = () =>
    run(async () => {
      try {
        const r = await financeApi.issue({ period: issueP, formulaId: formulaId || undefined })
        setPlan(null)
        setPeriod(r.period)
        toast(r.generatedCount ? `شارژ ${r.period_label} برای ${r.generatedCount.toLocaleString('fa-IR')} واحد صادر و به ساکنین اعلان شد` : `برای ${r.period_label} واحد جدیدی برای صدور نبود`)
        refresh()
      } catch (e) {
        setPlan(null)
        setErr(errText(e))
      }
    })

  const doOverdue = () =>
    run(async () => {
      try {
        const r = await financeApi.runOverdue()
        toast(r.marked || r.feesUpdated ? `${r.marked.toLocaleString('fa-IR')} شارژ معوق شد، جریمه‌ی ${r.feesUpdated.toLocaleString('fa-IR')} شارژ به‌روز شد` : 'همه‌چیز به‌روز بود؛ تغییری لازم نبود')
        refresh()
      } catch (e) {
        toast(errText(e))
      }
    })

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="صدور شارژ ماهانه" />
        <div className="px-4 sm:px-5 pb-5 space-y-4">
          {formulas.data && activeFormulas.length === 0 && <Callout tone="warn">برای صدور شارژ ابتدا یک فرمول فعال تعریف کنید.</Callout>}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] gap-4 items-end">
            <PeriodPicker value={issueP} onChange={setIssueP} />
            <SelectField label="فرمول" value={formulaId} onChange={(e) => setFormulaId(e.target.value)} options={[{ value: '', label: 'خودکار — فرمول فعالِ این دوره' }, ...activeFormulas.map((f) => ({ value: f.id, label: f.name }))]} />
            <PrimaryButton disabled={busy || activeFormulas.length === 0} onClick={doPreview}><Sparkles size={16} /> پیش‌نمایش و صدور</PrimaryButton>
          </div>
          <p className="text-[11px] text-muted leading-6">ابتدا پیش‌نمایش مبالغ هر واحد نمایش داده می‌شود و هیچ چیزی ذخیره نمی‌شود. صدور برای هر (واحد، دوره) فقط یک‌بار انجام می‌شود؛ شارژ صادرشده تغییر نمی‌کند.</p>
          {err && <Callout tone="warn">{err}</Callout>}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="لیست شارژها"
          action={
            <div className="flex items-center gap-2">
              <button onClick={doOverdue} disabled={busy} className="text-xs text-tile font-medium inline-flex items-center gap-1 hover:underline whitespace-nowrap" title="همان کاری که هر شب خودکار انجام می‌شود">
                <RefreshCw size={13} /> بررسی معوقات
              </button>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-line px-3 py-1.5 text-sm bg-card" aria-label="دوره">
                {(periods.data ?? []).map((p) => <option key={p} value={p}>{periodFa(p)}</option>)}
              </select>
            </div>
          }
        />
        {periods.loading || charges.loading ? <Loading /> : periods.error || charges.error ? <div className="px-5 pb-5"><ErrorBlock message={(periods.error ?? charges.error)!} retry={refresh} /></div> : !periods.data?.length ? (
          <p className="px-5 pb-6 text-sm text-muted">هنوز شارژی صادر نشده است.</p>
        ) : (
          <>
            <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>کل: <b className="text-ink-text">{tomanText(stats.total)}</b></span>
              <span>وصول‌شده: <b className="text-good">{tomanText(stats.paid)} ({stats.rate.toLocaleString('fa-IR')}٪)</b></span>
              <span>معوق: <b className="text-bad">{tomanText(stats.overdueTotal)}</b></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-muted border-y border-line">
                    <th className={TH}>واحد</th><th className={TH}>مبلغ پایه</th><th className={TH}>جریمه دیرکرد</th><th className={TH}>جمع کل</th><th className={TH}>سررسید</th><th className={TH}>وضعیت</th><th className={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {(charges.data ?? []).map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className={`${TD} font-medium`}>{c.unit_number}{c.payer_name && <span className="block text-[11px] text-muted font-normal">{c.payer_name}</span>}</td>
                      <td className={`${TD} text-muted`}>{tomanText(c.base_amount)}</td>
                      <td className={`${TD} text-muted`}>{c.late_fee_amount ? tomanText(c.late_fee_amount) : '—'}</td>
                      <td className={`${TD} font-medium`}>{tomanText(c.total_amount)}{c.breakdown?.overage && <span className="block text-[11px] text-warn font-normal">شامل شارژ متغیر (خدمات و کافه/رستوران) {tomanText(c.breakdown.overage.total)}</span>}</td>
                      <td className={`${TD} text-muted whitespace-nowrap`}>{dayFa(c.due_date)}</td>
                      <td className={TD}><StatusPill status={c.status} />{c.status === 'paid' && <span className="block text-[11px] text-muted mt-1">{methodFa(c.pay_method)} · {instantFa(c.paid_at)}</span>}</td>
                      <td className={`${TD} whitespace-nowrap space-x-3 space-x-reverse`}>
                        {c.status !== 'paid' && <button onClick={() => setPaying(c)} className="text-good text-xs font-medium hover:underline">ثبت پرداخت</button>}
                        {c.status !== 'paid' && <button onClick={() => setEditing(c)} className="text-tile text-xs font-medium hover:underline">ویرایش</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {plan && (
        <Modal
          open
          size="lg"
          title={`پیش‌نمایش شارژ ${plan.period_label}`}
          onClose={() => setPlan(null)}
          footer={
            <>
              <span className="text-sm ml-auto self-center">جمع واحدهای جدید: <b>{tomanText(plan.total_new_amount)}</b></span>
              <GhostButton onClick={() => setPlan(null)}>انصراف</GhostButton>
              <PrimaryButton disabled={busy || plan.to_create === 0} onClick={doIssue}><CheckCircle2 size={16} /> صدور و اعلان به ساکنین</PrimaryButton>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">فرمول</p><p className="font-medium mt-0.5">{plan.formula.name}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">سررسید</p><p className="font-medium mt-0.5">{dayFa(plan.due_date)}</p></div>
              <div className="rounded-xl bg-canvas p-3 col-span-2 sm:col-span-1"><p className="text-muted">واحدهای جدید / قبلاً صادرشده</p><p className="font-medium mt-0.5">{plan.to_create.toLocaleString('fa-IR')} / {plan.already_issued.toLocaleString('fa-IR')}</p></div>
            </div>
            {plan.rows.some((r) => !r.existing && (r.overage ?? 0) > 0) && <Callout tone="warn">شارژ متغیر ماه قبل (مازاد خدمات مثل کارواش و مهمان استخر + سفارش‌های کافه/رستوران) برای {plan.rows.filter((r) => !r.existing && (r.overage ?? 0) > 0).length.toLocaleString('fa-IR')} واحد به مبلغ شارژ اضافه شده است.</Callout>}
            {plan.already_issued > 0 && <Callout tone="warn">برای {plan.already_issued.toLocaleString('fa-IR')} واحد، شارژ این دوره قبلاً صادر شده و دست‌نخورده می‌ماند.</Callout>}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-muted border-b border-line bg-canvas"><th className={TH}>واحد</th><th className={TH}>متراژ</th><th className={TH}>نفرات</th><th className={TH}>مبلغ</th><th className={TH}></th></tr></thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.unit_id} className={`border-b border-line last:border-0 ${r.existing ? 'opacity-55' : ''}`}>
                      <td className={`${TD} font-medium`}>{r.unit_number}</td>
                      <td className={`${TD} text-muted`}>{r.area.toLocaleString('fa-IR')}</td>
                      <td className={`${TD} text-muted`}>{r.residents.toLocaleString('fa-IR')}</td>
                      <td className={`${TD} font-medium`}>{tomanText(r.existing ? r.existing.total_amount : r.amount)}{!r.existing && (r.overage ?? 0) > 0 && <span className="block text-[11px] text-warn font-normal">شامل شارژ متغیر {tomanText(r.overage!)}</span>}</td>
                      <td className={`${TD} text-[11px] text-muted whitespace-nowrap`}>{r.existing ? 'قبلاً صادر شده' : 'جدید'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
      {paying && <PayDialog charge={paying} online={!!gateway.data?.online} onClose={() => setPaying(null)} onDone={() => { setPaying(null); toast('پرداخت ثبت شد و به ساکن اعلان رفت'); refresh() }} />}
      {editing && <EditDialog charge={editing} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); toast(m); refresh() }} />}
      {toastNode}
    </div>
  )
}

const METHODS: { value: PayMethod; label: string }[] = [
  { value: 'card_to_card', label: 'کارت به کارت' },
  { value: 'cash', label: 'نقدی' },
  { value: 'bank_transfer', label: 'واریز / حواله بانکی' },
  { value: 'cheque', label: 'چک' },
]

function PayDialog({ charge, online, onClose, onDone }: { charge: Charge; online: boolean; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<PayMethod>('card_to_card')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  const submit = () => run(async () => {
    setErr('')
    try {
      await financeApi.manualPayment(charge.id, { method, reference: reference || undefined, note: note || undefined })
      onDone()
    } catch (e) {
      setErr(errText(e))
    }
  })
  return (
    <Modal open title={`ثبت پرداخت — واحد ${charge.unit_number} · ${periodFa(charge.period)}`} onClose={onClose} footer={<><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={busy} onClick={submit}><Receipt size={16} /> ثبت پرداخت</PrimaryButton></>}>
      <div className="space-y-4">
        <Callout tone={online ? 'info' : 'warn'}>
          {online ? 'این فرم برای پرداخت‌هایی است که خارج از درگاه آنلاین انجام شده‌اند (رسید دستی).' : 'درگاه پرداخت آنلاین فعال نیست؛ پرداخت ساکنین (کارت‌به‌کارت/نقدی) را اینجا ثبت کنید. این ثبت، رسید دستی است نه پرداخت آنلاین.'}
        </Callout>
        <div className="rounded-xl bg-canvas p-3 text-sm flex justify-between"><span>مبلغ قابل ثبت (با جریمه‌ی فعلی)</span><b>{tomanText(charge.total_amount)}</b></div>
        <SelectField label="روش پرداخت" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} options={METHODS} />
        <TextField label="شماره پیگیری / رسید (اختیاری)" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="یادداشت (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}

function EditDialog({ charge, onClose, onDone }: { charge: Charge; onClose: () => void; onDone: (msg: string) => void }) {
  const [base, setBase] = useState(charge.base_amount)
  const [due, setDue] = useState(charge.due_date ?? '')
  const [waive, setWaive] = useState(charge.late_fee_waived)
  const [note, setNote] = useState(charge.note ?? '')
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  const save = () => run(async () => {
    setErr('')
    try {
      await financeApi.updateCharge(charge.id, { base_amount: base, due_date: due || undefined, waive_late_fee: waive, note })
      onDone('شارژ به‌روز شد')
    } catch (e) {
      setErr(errText(e))
    }
  })
  const del = () => run(async () => {
    if (!window.confirm('این شارژ باطل شود؟ (فقط شارژ پرداخت‌نشده قابل ابطال است)')) return
    try {
      await financeApi.voidCharge(charge.id)
      onDone('شارژ باطل شد')
    } catch (e) {
      setErr(errText(e))
    }
  })
  return (
    <Modal open title={`ویرایش شارژ ${charge.unit_number} — ${periodFa(charge.period)}`} onClose={onClose} footer={<><GhostButton className="!text-bad ml-auto" disabled={busy} onClick={del}>ابطال شارژ</GhostButton><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={busy} onClick={save}>ذخیره</PrimaryButton></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoneyField label="مبلغ پایه (تومان)" value={base} onChange={setBase} />
        <TextField label="سررسید" type="date" dir="ltr" value={due} onChange={(e) => setDue(e.target.value)} hint={due ? dayFa(due) : undefined} />
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> معاف از جریمه‌ی دیرکرد {charge.late_fee_amount > 0 && `(جریمه‌ی فعلی ${tomanText(charge.late_fee_amount)} صفر می‌شود)`}</label>
        <TextField className="sm:col-span-2" label="یادداشت (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="sm:col-span-2 text-sm bg-canvas rounded-xl p-3">جمع کل پس از ذخیره: <b>{tomanText(base + (waive ? 0 : charge.late_fee_amount))}</b></p>
        {err && <div className="sm:col-span-2"><Callout tone="warn">{err}</Callout></div>}
      </div>
    </Modal>
  )
}
