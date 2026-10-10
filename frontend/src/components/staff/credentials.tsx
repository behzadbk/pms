import { useState } from 'react'
import { Copy } from 'lucide-react'
import { GhostButton } from '../ui/Modal'
import { LAST_TENANT_KEY } from '../../pages/Login'

/** نمایش یک‌باره‌ی اطلاعات ورود حساب تازه‌ساخته‌شده (کارمند یا حسابدار) */
export function Credentials({ name, username, password }: { name: string; username: string; password: string }) {
  const [copied, setCopied] = useState(false)
  let tenant = ''
  try {
    tenant = localStorage.getItem(LAST_TENANT_KEY) ?? ''
  } catch {
    /* ignore */
  }
  const text = `ورود به پنل «همین»\n${tenant ? `مجتمع: ${tenant}\n` : ''}نام کاربری: ${username}\nرمز عبور: ${password}`
  return (
    <div className="space-y-4">
      <p className="text-sm">حساب «{name}» ساخته شد. این اطلاعات را به او بدهید — رمز بعداً قابل مشاهده نیست (فقط قابل تغییر است).</p>
      <div className="bg-canvas rounded-xl p-4 space-y-2 text-sm" dir="ltr">
        {tenant && <p><span className="text-muted">building:</span> <b className="font-mono">{tenant}</b></p>}
        <p><span className="text-muted">username:</span> <b className="font-mono">{username}</b></p>
        <p><span className="text-muted">password:</span> <b className="font-mono">{password}</b></p>
      </div>
      <GhostButton
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined)
        }}
      >
        <Copy size={15} /> {copied ? 'کپی شد' : 'کپی اطلاعات ورود'}
      </GhostButton>
    </div>
  )
}
