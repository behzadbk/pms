import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, CheckCircle2, Loader2, Info, ChevronDown } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { Loading, ErrorBlock, useLoad, useToast } from '../../components/hm'
import { errText } from '../../lib/api/residents'
import { dayFa, financeApi, instantFa, methodFa, periodFa, tomanText, variableItemLabel, type MyCharge, type MyFnbBill } from '../../lib/api/finance'

export function ResidentCharges() {
  const charges = useLoad(() => financeApi.myCharges(), [])
  const receipts = useLoad(() => financeApi.myReceipts(), [])
  const gateway = useLoad(() => financeApi.gateway(), [])
  const fnbBills = useLoad(() => financeApi.myFnbBills(), [])
  const [params, setParams] = useSearchParams()
  const { toast, toastNode } = useToast()
  const [payingId, setPayingId] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  // بازگشت از درگاه: ?pay=success|failed
  useEffect(() => {
    const p = params.get('pay')
    if (!p) return
    toast(p === 'success' ? 'پرداخت با موفقیت انجام شد' : 'پرداخت انجام نشد یا لغو شد')
    void charges.reload(true)
    void receipts.reload(true)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pay(c: MyCharge) {
    setPayingId(c.id)
    try {
      const r = await financeApi.initiatePayment(c.id)
      window.location.href = r.redirectUrl
    } catch (e) {
      toast(errText(e))
      setPayingId(null)
    }
  }

  if (charges.loading) return <Loading />
  if (charges.error || !charges.data) return <ErrorBlock message={charges.error ?? 'خطا در دریافت شارژها'} retry={charges.reload} />
  const list = charges.data
  const pending = list.filter((c) => c.status !== 'paid')
  const pendingTotal = pending.reduce((sum, c) => sum + c.total_amount, 0)
  const units = [...new Set(list.map((c) => c.unit_number))]
  const online = !!gateway.data?.online

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">شارژ و پرداخت</h1>
        <p className="text-muted text-sm mt-1">{units.length ? `تاریخچه شارژهای واحد ${units.map((u) => u).join('، ')}` : 'تاریخچه شارژها'} و پرداخت</p>
      </div>

      {list.length === 0 && (
        <Card><p className="p-6 text-sm text-muted">هنوز شارژی برای واحد شما صادر نشده است.</p></Card>
      )}

      {pending.length > 0 && (
        <Card>
          <CardHeader title="شارژهای در انتظار پرداخت" />
          <div className="px-4 sm:px-5 pb-5 space-y-3">
            {pending.map((c) => (
              <div key={c.id} className="p-4 rounded-xl border border-line space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{periodFa(c.period)} · واحد {c.unit_number}</p>
                    <p className="text-xs text-muted mt-0.5">سررسید: {dayFa(c.due_date)}</p>
                    {c.late_fee_amount > 0 && <p className="text-xs text-bad mt-0.5">شامل جریمه‌ی دیرکرد {tomanText(c.late_fee_amount)}</p>}
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-semibold">{tomanText(c.total_amount)}</p>
                    <StatusPill status={c.status} />
                  </div>
                </div>
                {online && (
                  <button onClick={() => pay(c)} disabled={payingId !== null} className="w-full flex items-center justify-center gap-2 bg-tile text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-70">
                    {payingId === c.id ? <><Loader2 size={16} className="animate-spin" /> در حال اتصال به درگاه…</> : <><CreditCard size={16} /> پرداخت آنلاین</>}
                  </button>
                )}
              </div>
            ))}
            <div className="pt-3 flex items-center justify-between border-t border-line">
              <span className="text-sm text-muted">جمع قابل پرداخت</span>
              <span className="font-bold">{tomanText(pendingTotal)}</span>
            </div>
            {!online && gateway.data && (
              <p className="text-xs leading-6 bg-tile-soft text-tile rounded-xl px-3.5 py-3 flex gap-2">
                <Info size={15} className="shrink-0 mt-1" />
                <span>پرداخت آنلاین برای این ساختمان فعال نیست. مبلغ را به‌صورت کارت‌به‌کارت یا نقدی به حسابدار ساختمان بپردازید؛ پس از «ثبت پرداخت» توسط حسابداری، وضعیت شارژ اینجا «پرداخت‌شده» می‌شود و اعلان دریافت می‌کنید.</span>
              </p>
            )}
          </div>
        </Card>
      )}
      {list.length > 0 && pending.length === 0 && (
        <Card className="border-good/30 bg-good-soft">
          <div className="p-5 flex items-center gap-3 text-good"><CheckCircle2 size={28} /><p className="font-semibold text-sm">همه‌ی شارژهای شما پرداخت شده است.</p></div>
        </Card>
      )}

      {list.length > 0 && (
        <Card>
          <CardHeader title="تاریخچه شارژها" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium px-4 sm:px-5 py-2.5">دوره</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5">مبلغ</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5">سررسید</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5">وضعیت</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-line cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                      <td className="px-4 sm:px-5 py-3 font-medium whitespace-nowrap">{periodFa(c.period)}{units.length > 1 && <span className="text-xs text-muted"> · واحد {c.unit_number}</span>}</td>
                      <td className="px-4 sm:px-5 py-3 text-muted whitespace-nowrap">{tomanText(c.total_amount)}</td>
                      <td className="px-4 sm:px-5 py-3 text-muted whitespace-nowrap">{dayFa(c.due_date)}</td>
                      <td className="px-4 sm:px-5 py-3"><StatusPill status={c.status} /></td>
                      <td className="px-2 py-3 text-muted"><ChevronDown size={15} className={open === c.id ? 'rotate-180' : ''} /></td>
                    </tr>
                    {open === c.id && (
                      <tr className="border-b border-line bg-canvas/60">
                        <td colSpan={5} className="px-5 py-3 text-xs space-y-1.5">
                          <Row k="مبلغ پایه" v={tomanText(c.base_amount)} />
                          {c.breakdown?.overage && (
                            <>
                              <p className="text-muted pt-1">شارژ متغیر (مصرف خدمات و کافه/رستوران)</p>
                              {c.breakdown.overage.items.map((it, i) => (
                                <Row key={i} k={`${variableItemLabel(it)} — ${periodFa(it.period)}`} v={tomanText(it.amount)} />
                              ))}
                            </>
                          )}
                          {c.late_fee_amount > 0 && <Row k="جریمه‌ی دیرکرد" v={tomanText(c.late_fee_amount)} />}
                          {c.status === 'paid' && <Row k="پرداخت" v={`${methodFa(c.pay_method)} · ${instantFa(c.paid_at)}`} />}
                          {c.formula_name && <Row k="فرمول" v={c.formula_name} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {fnbBills.data && fnbBills.data.length > 0 && <FnbBills bills={fnbBills.data} />}

      {receipts.data && receipts.data.length > 0 && (
        <Card>
          <CardHeader title="رسیدهای پرداخت" />
          <div className="px-4 sm:px-5 pb-5 space-y-2">
            {receipts.data.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line text-sm">
                <div><p className="font-medium">شارژ {periodFa(r.period)} · واحد {r.unit_number}</p><p className="text-xs text-muted mt-0.5">{methodFa(r.method)} · {instantFa(r.paid_at)}{r.reference ? ` · پیگیری ${r.reference}` : ''}</p></div>
                <span className="font-semibold text-good whitespace-nowrap">{tomanText(r.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {toastNode}
    </div>
  )
}

/** صورتحساب کافه و رستوران: هر سفارش تحویل‌شده با ریز اقلام؛ مبلغ در شارژ متغیر ماه بعد می‌نشیند */
function FnbBills({ bills }: { bills: MyFnbBill[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const pendingTotal = bills.filter((b) => !b.billed).reduce((a, b) => a + b.total, 0)
  return (
    <Card>
      <CardHeader title="صورتحساب کافه و رستوران" />
      <div className="px-4 sm:px-5 pb-5 space-y-3">
        <p className="text-xs leading-6 text-muted">مبلغ هر سفارش تحویل‌شده به «شارژ متغیر» واحد اضافه می‌شود و در شارژ ماه بعد می‌نشیند؛ ریز آن را اینجا می‌بینید.</p>
        {pendingTotal > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-tile-soft text-tile px-3.5 py-2.5 text-sm">
            <span>هنوز روی شارژی نرفته</span>
            <b>{tomanText(pendingTotal)}</b>
          </div>
        )}
        {bills.map((b) => (
          <div key={b.id} className="rounded-xl border border-line text-sm">
            <button type="button" onClick={() => setOpen(open === b.id ? null : b.id)} className="w-full flex items-center justify-between gap-3 p-3 text-right" aria-expanded={open === b.id}>
              <div>
                <p className="font-medium">{b.venue_name} · سفارش {b.order_number}</p>
                <p className="text-xs text-muted mt-0.5">
                  {instantFa(b.delivered_at)} · {b.billed ? `ثبت‌شده در شارژ ${periodFa(b.charge_period)}` : `در شارژ ${periodFa(b.charge_period)} می‌نشیند`}
                </p>
              </div>
              <span className="font-semibold whitespace-nowrap flex items-center gap-1.5">{tomanText(b.total)}<ChevronDown size={14} className={open === b.id ? 'rotate-180' : ''} /></span>
            </button>
            {open === b.id && (
              <div className="px-3 pb-3 pt-2 border-t border-line text-xs space-y-1.5 bg-canvas/60 rounded-b-xl">
                {b.items.map((it, i) => (
                  <Row key={i} k={`${it.name} × ${it.quantity.toLocaleString('fa-IR')}`} v={tomanText(it.line_total)} />
                ))}
                {b.surcharge > 0 && <Row k="هزینه‌ی تحویل" v={tomanText(b.surcharge)} />}
                <Row k="جمع" v={tomanText(b.total)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="font-medium text-left">{v}</span></div>
}
