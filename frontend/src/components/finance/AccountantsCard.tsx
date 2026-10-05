import { useState } from 'react'
import { Plus, Copy } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Modal, PrimaryButton, GhostButton, TextField } from '../ui/Modal'
import { Loading, ErrorBlock, useLoad, useToast } from '../hm'
import { errText } from '../../lib/api/residents'
import { financeApi, instantFa } from '../../lib/api/finance'
import { Callout, useBusy, TH, TD } from './parts'

/** حساب‌های حسابدار ساختمان — ساخت، فهرست و غیرفعال‌سازی (فقط مدیر) */
export function AccountantsCard() {
  const { data, loading, error, reload } = useLoad(() => financeApi.accountants(), [])
  const { toast, toastNode } = useToast()
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  async function toggle(id: string, isActive: boolean) {
    if (isActive && !window.confirm('این حسابدار غیرفعال شود؟ دیگر نمی‌تواند وارد شود.')) return
    try {
      await financeApi.updateAccountant(id, { isActive: !isActive })
      toast(isActive ? 'حساب غیرفعال شد' : 'حساب فعال شد')
      void reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  return (
    <Card>
      <CardHeader title="حسابداران ساختمان" action={<PrimaryButton className="!py-2" onClick={() => setOpen(true)}><Plus size={15} /> حسابدار جدید</PrimaryButton>} />
      <div className="px-4 sm:px-5 pb-5 space-y-3">
        <p className="text-xs text-muted leading-6">حسابدار صدور شارژ، ثبت وصولی و فاکتورها را انجام می‌دهد. رمز اولیه موقت است و در اولین ورود باید تغییر کند.</p>
        {loading && <Loading />}
        {error && <ErrorBlock message={error} retry={reload} />}
        {data && data.length === 0 && <Callout tone="warn">هنوز حسابداری تعریف نشده است.</Callout>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-muted border-b border-line bg-canvas"><th className={TH}>نام</th><th className={TH}>ایمیل ورود</th><th className={TH}>آخرین ورود</th><th className={TH}>وضعیت</th></tr></thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className={`${TD} font-medium`}>{a.fullName}{a.phone && <span className="block text-[11px] text-muted font-normal">{a.phone}</span>}</td>
                    <td className={`${TD} text-muted`} dir="ltr">{a.email}</td>
                    <td className={`${TD} text-muted whitespace-nowrap`}>{a.lastLoginAt ? instantFa(a.lastLoginAt) : 'هنوز وارد نشده'}</td>
                    <td className={TD}>
                      <button onClick={() => toggle(a.id, a.isActive)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.isActive ? 'bg-good-soft text-good' : 'bg-canvas text-muted'}`}>{a.isActive ? 'فعال' : 'غیرفعال'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <CreateDialog onClose={() => setOpen(false)} onCreated={(r) => { setOpen(false); setCreated(r); void reload(true) }} />}
      {created && (
        <Modal open title="حساب حسابدار ساخته شد" onClose={() => setCreated(null)} footer={<PrimaryButton onClick={() => setCreated(null)}>متوجه شدم</PrimaryButton>}>
          <div className="space-y-3 text-sm">
            <p>این اطلاعات ورود را به حسابدار بدهید. رمز موقت فقط همین یک‌بار نمایش داده می‌شود.</p>
            <div className="rounded-xl bg-canvas p-3 space-y-1" dir="ltr">
              <p>{created.email}</p>
              <p className="font-mono font-bold flex items-center gap-2">{created.password}
                <button className="text-tile" aria-label="کپی رمز" onClick={() => void navigator.clipboard?.writeText(created.password)}><Copy size={14} /></button>
              </p>
            </div>
          </div>
        </Modal>
      )}
      {toastNode}
    </Card>
  )
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (r: { email: string; password: string }) => void }) {
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '' })
  const [err, setErr] = useState('')
  const { busy, run } = useBusy()
  const valid = f.fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)
  const submit = () =>
    run(async () => {
      setErr('')
      try {
        const r = await financeApi.createAccountant({ fullName: f.fullName.trim(), email: f.email.trim(), phone: f.phone || undefined, password: f.password || undefined })
        onCreated({ email: r.email ?? f.email, password: r.tempPassword ?? f.password })
      } catch (e) {
        setErr(errText(e))
      }
    })
  return (
    <Modal open title="حسابدار جدید" onClose={onClose} footer={<><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={!valid || busy} onClick={submit}>ساخت حساب</PrimaryButton></>}>
      <div className="space-y-4">
        <TextField label="نام و نام خانوادگی" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus />
        <TextField label="ایمیل (نام کاربری ورود)" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="موبایل (اختیاری)" inputMode="numeric" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="09123456789" />
        <TextField label="رمز اولیه (اختیاری)" dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} hint="خالی = رمز تصادفی ساخته و یک‌بار نمایش داده می‌شود. حداقل ۸ کاراکتر." />
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}
