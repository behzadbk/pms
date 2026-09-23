import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { charges, toman } from '../../lib/mockData'

const formulaTypes = [
  { id: 'fixed', label: 'مبلغ ثابت' },
  { id: 'per_area', label: 'بر اساس متراژ' },
  { id: 'per_person', label: 'بر اساس تعداد نفرات' },
  { id: 'hybrid', label: 'فرمول ترکیبی' },
]

export function AdminCharges() {
  const [formulaType, setFormulaType] = useState('hybrid')
  const [generating, setGenerating] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">شارژ و مطالبات</h1>
          <p className="text-muted text-sm mt-1">تعریف فرمول محاسبه و صدور شارژ ماهانه واحدها</p>
        </div>
        <button
          onClick={() => setGenerating(true)}
          className="flex items-center gap-2 bg-tile text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Sparkles size={16} />
          صدور شارژ مهر ۱۴۰۴
        </button>
      </div>

      <Card>
        <CardHeader title="فرمول محاسبه شارژ" />
        <div className="px-5 pb-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {formulaTypes.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormulaType(f.id)}
                className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${
                  formulaType === f.id
                    ? 'bg-ink text-white border-ink'
                    : 'border-line text-ink-text hover:border-ink-soft'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {formulaType === 'hybrid' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Field label="مبلغ پایه (تومان)" defaultValue="1,200,000" />
              <Field label="مبلغ به ازای هر متر" defaultValue="4,500" />
              <Field label="مبلغ به ازای هر نفر" defaultValue="80,000" />
            </div>
          )}
          {formulaType === 'fixed' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Field label="مبلغ ثابت ماهانه (تومان)" defaultValue="2,800,000" />
            </div>
          )}
          {formulaType === 'per_area' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Field label="مبلغ به ازای هر متر مربع" defaultValue="6,200" />
            </div>
          )}
          {formulaType === 'per_person' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Field label="مبلغ به ازای هر نفر" defaultValue="650,000" />
            </div>
          )}

          {generating && (
            <div className="bg-tile-soft text-tile text-sm rounded-xl px-4 py-3">
              شارژ مهر ۱۴۰۴ بر اساس این فرمول برای ۲۴ واحد در صف صدور قرار گرفت.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="لیست شارژهای شهریور ۱۴۰۴" />
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
              {charges.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{c.unit}</td>
                  <td className="px-5 py-3 text-muted">{toman(c.base)}</td>
                  <td className="px-5 py-3 text-muted">{c.lateFee ? toman(c.lateFee) : '—'}</td>
                  <td className="px-5 py-3 font-medium">{toman(c.total)}</td>
                  <td className="px-5 py-3 text-muted">{c.dueDate}</td>
                  <td className="px-5 py-3"><StatusPill status={c.status} /></td>
                  <td className="px-5 py-3">
                    <button className="text-tile text-xs font-medium hover:underline">ویرایش</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        defaultValue={defaultValue}
        className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile"
      />
    </label>
  )
}
