import { useState } from 'react'
import { CreditCard, CheckCircle2, Loader2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { myCharges, toman } from '../../lib/mockData'

type PayState = 'idle' | 'processing' | 'success'

export function ResidentCharges() {
  const [payState, setPayState] = useState<PayState>('idle')
  const pending = myCharges.filter((c) => c.status !== 'paid')
  const pendingTotal = pending.reduce((sum, c) => sum + c.total, 0)

  function handlePay() {
    setPayState('processing')
    setTimeout(() => setPayState('success'), 1400)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">شارژ و پرداخت</h1>
        <p className="text-muted text-sm mt-1">تاریخچه شارژهای واحد ۱۲ و پرداخت آنلاین</p>
      </div>

      {payState === 'success' ? (
        <Card className="border-good/30 bg-good-soft">
          <div className="p-6 flex flex-col items-center text-center gap-3">
            <CheckCircle2 size={40} className="text-good" />
            <div>
              <p className="font-semibold text-good">پرداخت با موفقیت انجام شد</p>
              <p className="text-sm text-good/80 mt-1">مبلغ {toman(pendingTotal)} از حساب شما کسر و رسید صادر شد.</p>
            </div>
            <button className="text-sm font-medium text-tile hover:underline mt-1">دانلود رسید PDF</button>
          </div>
        </Card>
      ) : pending.length > 0 ? (
        <Card>
          <CardHeader title="شارژهای در انتظار پرداخت" />
          <div className="px-5 pb-5 space-y-3">
            {pending.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-line">
                <div>
                  <p className="text-sm font-medium">{c.period}</p>
                  <p className="text-xs text-muted mt-0.5">سررسید: {c.dueDate}</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">{toman(c.total)}</p>
                  <StatusPill status={c.status} />
                </div>
              </div>
            ))}
            <div className="pt-3 flex items-center justify-between border-t border-line">
              <span className="text-sm text-muted">جمع قابل پرداخت</span>
              <span className="font-bold">{toman(pendingTotal)}</span>
            </div>
            <button
              onClick={handlePay}
              disabled={payState === 'processing'}
              className="w-full flex items-center justify-center gap-2 bg-tile text-white py-3 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-70"
            >
              {payState === 'processing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> در حال اتصال به درگاه پرداخت...
                </>
              ) : (
                <>
                  <CreditCard size={16} /> پرداخت آنلاین
                </>
              )}
            </button>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="تاریخچه شارژها" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">دوره</th>
                <th className="font-medium px-5 py-2.5">مبلغ</th>
                <th className="font-medium px-5 py-2.5">سررسید</th>
                <th className="font-medium px-5 py-2.5">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {myCharges.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{c.period}</td>
                  <td className="px-5 py-3 text-muted">{toman(c.total)}</td>
                  <td className="px-5 py-3 text-muted">{c.dueDate}</td>
                  <td className="px-5 py-3"><StatusPill status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
