import { FinanceProfiles } from '../../components/finance/FinanceProfiles'

/** پروفایل مالی واحدها و کارمندان — نمایش فقط‌خواندنی از نرم‌افزار حسابداری مجموعه */
export function AccountantProfiles() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">پروفایل مالی</h1>
      <FinanceProfiles />
    </div>
  )
}
