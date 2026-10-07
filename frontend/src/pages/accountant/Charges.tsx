import { ChargeManager } from '../../components/finance/ChargeManager'
import { FormulaEditor } from '../../components/finance/FormulaEditor'
import { SettingsCard } from '../../components/finance/SettingsCard'

/** شارژ و مطالبات — تعریف فرمول، صدور شارژ (پیش‌نمایش ← تأیید)، ثبت پرداخت دستی و پیگیری معوقات */
export function AccountantCharges() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">شارژ و مطالبات</h1>
      </div>
      <FormulaEditor />
      <ChargeManager />
      <SettingsCard canEdit={false} />
    </div>
  )
}
