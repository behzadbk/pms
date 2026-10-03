import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { fa, toman, type Permissions } from '../lib/api/residents'

/** صفحه‌ی «بسته برای واحد بدهکار» — جای بخش قفل‌شده می‌نشیند (قوانین برج) */
export function DebtorLock({ debtor, child }: { debtor?: Permissions['debtor']; child?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="hm-card p-6 flex flex-col items-center gap-3 text-center hm-fade-in" role="alert">
      <span className="hm-icon-tile hm-tone-bad">
        <Lock size={26} />
      </span>
      <p className="text-lg font-bold">این بخش برای واحد شما بسته است</p>
      <p className="text-sm leading-7 text-[var(--hm-t2)]">
        {debtor
          ? `شارژ واحد ${fa(debtor.overdue_days)} روز از سررسید گذشته است${debtor.amount ? ` (مبلغ معوق ${toman(debtor.amount)} تومان)` : ''}. طبق قوانین ساختمان، تا تسویه این بخش بسته است.`
          : 'طبق قوانین ساختمان، تا تسویه‌ی شارژ این بخش بسته است.'}
      </p>
      {child ? (
        <p className="text-sm font-bold text-[var(--hm-t2)]">از والدین بخواهید شارژ را بپردازند.</p>
      ) : (
        <button className="hm-cta lg4-capsule px-6" onClick={() => navigate('/resident/charges')}>
          پرداخت شارژ
        </button>
      )}
    </div>
  )
}
