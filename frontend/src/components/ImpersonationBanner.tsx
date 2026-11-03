import { useEffect, useState } from 'react'
import { UserCog } from 'lucide-react'
import { readImpersonation, stopImpersonation } from '../lib/impersonation'
import { fa } from '../lib/api/residents'

/** نوار هشدار بالای پنل وقتی سوپرادمین «به‌جای مدیر» وارد شده؛ با انقضای ۳۰ دقیقه‌ای خودکار خارج می‌شود */
export function ImpersonationBanner() {
  const [st] = useState(readImpersonation)
  const [left, setLeft] = useState(() => (st ? Math.max(0, Math.round((st.until - Date.now()) / 1000)) : 0))

  useEffect(() => {
    if (!st) return
    const t = setInterval(() => {
      const s = Math.round((st.until - Date.now()) / 1000)
      if (s <= 0) stopImpersonation()
      else setLeft(s)
    }, 1000)
    return () => clearInterval(t)
  }, [st])

  if (!st) return null
  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-warn text-white px-4 py-2 text-sm pt-safe">
      <span className="flex items-center gap-2 font-medium">
        <UserCog size={16} />
        شما به‌جای مدیر «{st.tenantName}» وارد شده‌اید ({st.by}) — همه‌ی کارها در لاگ ثبت می‌شود
      </span>
      <span className="tabular-nums" dir="ltr">{fa(mm)}:{fa(ss)}</span>
      <button onClick={stopImpersonation} className="rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 font-medium">
        خروج و بازگشت به پنل پلتفرم
      </button>
    </div>
  )
}
