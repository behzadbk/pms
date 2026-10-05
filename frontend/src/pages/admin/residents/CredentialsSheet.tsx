import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Cta, Note, Sheet } from '../../../components/hm'

/** اطلاعات ورود ساکن (نام کاربری = موبایل، رمز اولیه = شماره واحد) برای تحویل حضوری/پیامکی */
export function CredentialsSheet({
  open,
  onClose,
  name,
  unitNo,
  username,
  password,
  subdomain,
}: {
  open: boolean
  onClose: () => void
  name: string
  unitNo: string
  username: string
  password: string | null
  subdomain?: string
}) {
  const [copied, setCopied] = useState(false)
  const text = `ورود به همین\n${subdomain ? `ساختمان: ${subdomain}\n` : ''}نام کاربری: ${username}\n${password ? `رمز اولیه: ${password}` : ''}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* کلیپ‌بورد در دسترس نیست */
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label="اطلاعات ورود ساکن">
      <p className="mx-2 text-xl font-bold">اطلاعات ورود {name}</p>
      <p className="mx-2 mt-1 mb-4 text-sm text-[var(--hm-t2)]">واحد {unitNo} · این اطلاعات را به ساکن بدهید.</p>
      <div className="hm-card px-4 py-1 hm-divided mb-3">
        {subdomain && (
          <div className="py-3 flex items-center justify-between">
            <span className="text-xs text-[var(--hm-t2)]">کد ساختمان</span>
            <span className="text-sm font-bold" dir="ltr">{subdomain}</span>
          </div>
        )}
        <div className="py-3 flex items-center justify-between">
          <span className="text-xs text-[var(--hm-t2)]">نام کاربری (موبایل)</span>
          <span className="text-sm font-bold" dir="ltr">{username}</span>
        </div>
        <div className="py-3 flex items-center justify-between">
          <span className="text-xs text-[var(--hm-t2)]">رمز اولیه (شماره واحد)</span>
          <span className="text-sm font-bold" dir="ltr">{password ?? 'قبلاً تعیین شده'}</span>
        </div>
      </div>
      <Note tone="pri">ساکن بعد از اولین ورود، رمز را از «تنظیمات ← تغییر رمز عبور» عوض می‌کند.</Note>
      <div className="mt-3 flex flex-col gap-2">
        {password && (
          <button className="hm-cta-ghost" onClick={() => void copy()}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'کپی شد' : 'کپی اطلاعات ورود'}
          </button>
        )}
        <Cta onClick={onClose}>تأیید</Cta>
      </div>
    </Sheet>
  )
}
