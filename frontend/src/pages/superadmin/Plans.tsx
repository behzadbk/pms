import { Check, Minus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { allFeatures, featureLabels, tiers, tierHasFeature } from '../../lib/tiers'

/**
 * سطوح سرویس (ساده / اقتصادی / حرفه‌ای) — همان ماتریسی که هنگام تعریف یک
 * ساختمان جدید انتخاب می‌شود. منبع داده: lib/tiers.ts (هم‌نسخه با
 * backend/identity-service/src/platform/tiers.ts).
 */
export function SuperAdminPlans() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">سطوح سرویس</h1>
        <p className="text-muted text-sm mt-1">
          سه سطحی که هر ساختمان با یکی از آن‌ها تعریف می‌شود؛ سطح، ماژول‌های فعال آن مجتمع را تعیین می‌کند.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {tiers.map((t) => (
          <Card key={t.id} className={t.id === 'professional' ? 'border-tile ring-1 ring-tile' : ''}>
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-lg">{t.label}</p>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.accent}`}>
                  {t.features.length.toLocaleString('fa-IR')} ماژول
                </span>
              </div>

              <p className="text-2xl font-bold mt-3">{t.pricePerUnit.toLocaleString('fa-IR')}</p>
              <p className="text-xs text-muted mt-0.5">تومان به ازای هر واحد در ماه</p>

              <p className="text-sm text-muted mt-4 leading-6">{t.summary}</p>

              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-xs text-muted leading-5">{t.fitFor}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="مقایسه‌ی قابلیت‌ها" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-y border-line">
                <th className="font-medium px-5 py-2.5">قابلیت</th>
                {tiers.map((t) => (
                  <th key={t.id} className="font-medium px-5 py-2.5 text-center whitespace-nowrap">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((f) => (
                <tr key={f} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">{featureLabels[f]}</td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-5 py-2.5 text-center">
                      {tierHasFeature(t.id, f) ? (
                        <Check size={16} className="text-good inline-block" />
                      ) : (
                        <Minus size={16} className="text-line inline-block" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
