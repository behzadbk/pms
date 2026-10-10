import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, RefreshCw, Trash2, Calculator } from 'lucide-react'
import { Card } from '../ui/Card'
import { Modal, TextField, PrimaryButton, GhostButton } from '../ui/Modal'
import { ApiError } from '../../lib/api'
import { accountants as api, type Accountant } from '../../lib/api/staff'
import { faDateTime } from '../../lib/jalali'
import { Credentials } from './credentials'
import { generatePassword, toEnDigits } from '../../lib/accountCredentials'

type Form = { id?: string; fullName: string; username: string; phone: string; email: string; password: string; isActive: boolean }
const empty = (): Form => ({ fullName: '', username: '', phone: '', email: '', password: generatePassword(), isActive: true })

/**
 * حسابداران ساختمان — تعریف توسط مدیر (کنار کارکنان). حسابدار با نام‌کاربری/رمز موقت وارد «پنل حسابداری» می‌شود
 * (صدور شارژ، ثبت وصولی، فاکتور هزینه‌ی برج، آفرها و خدمات). رمز در اولین ورود باید عوض شود.
 */
export function AccountantsPanel() {
  const [list, setList] = useState<Accountant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [deleting, setDeleting] = useState<Accountant | null>(null)
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setList(await api.list())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'اتصال به سرور برقرار نشد — identity-service را بررسی کنید.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // بارگذاری اولیه‌ی لیست از سرور
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function toggleActive(a: Accountant) {
    try {
      const u = await api.update(a.id, { isActive: !a.isActive })
      setList((l) => l.map((x) => (x.id === a.id ? u : x)))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تغییر وضعیت ناموفق بود')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.remove(deleting.id)
      setList((l) => l.filter((x) => x.id !== deleting.id))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'حذف ناموفق بود')
    }
    setDeleting(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted leading-7 max-w-2xl">
          حسابدار شارژ و مطالبات، ثبت وصولی، فاکتور هزینه‌های برج و آفرها/خدمات را در «پنل حسابداری» مدیریت می‌کند. شما فقط گزارش‌ها را می‌بینید و مانیتور می‌کنید.
        </p>
        <PrimaryButton onClick={() => setForm(empty())}>
          <Plus size={16} /> حسابدار جدید
        </PrimaryButton>
      </div>

      {error && (
        <div className="bg-bad-soft text-bad text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="flex items-center gap-1 text-xs font-medium hover:underline shrink-0">
            <RefreshCw size={13} /> تلاش دوباره
          </button>
        </div>
      )}

      {loading ? (
        <Card><p className="p-10 text-center text-sm text-muted">در حال بارگذاری…</p></Card>
      ) : list.length === 0 && !error ? (
        <Card>
          <div className="p-10 text-center space-y-2">
            <Calculator size={28} className="mx-auto text-muted" />
            <p className="text-sm text-muted">هنوز حسابداری تعریف نشده است؛ بدون حسابدار شارژی صادر نمی‌شود.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((a) => (
            <Card key={a.id} className={a.isActive ? '' : 'opacity-60'}>
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-tile-soft text-tile flex items-center justify-center shrink-0"><Calculator size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{a.fullName}</p>
                    <p className="text-xs text-muted mt-0.5">حسابدار ساختمان</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${a.isActive ? 'bg-good-soft text-good' : 'bg-canvas text-muted'}`}>{a.isActive ? 'فعال' : 'غیرفعال'}</span>
                </div>
                <div className="text-xs text-muted space-y-1">
                  <p className="flex items-center gap-1.5"><KeyRound size={12} /> <span dir="ltr" className="font-mono">{a.username ?? a.email}</span></p>
                  {a.phone && <p dir="ltr" className="text-right">{a.phone}</p>}
                  <p>آخرین ورود: {a.lastLoginAt ? faDateTime(a.lastLoginAt) : 'هنوز وارد نشده'}</p>
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-line">
                  <button onClick={() => setForm({ id: a.id, fullName: a.fullName, username: a.username ?? '', phone: a.phone ?? '', email: a.email ?? '', password: '', isActive: a.isActive })} className="flex items-center gap-1 text-xs font-medium text-tile hover:bg-tile-soft px-2.5 py-1.5 rounded-lg" aria-label={`ویرایش ${a.fullName}`}>
                    <Pencil size={13} /> ویرایش
                  </button>
                  <button onClick={() => toggleActive(a)} className="text-xs font-medium text-muted hover:bg-canvas px-2.5 py-1.5 rounded-lg">{a.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button>
                  <button onClick={() => setDeleting(a)} className="mr-auto flex items-center gap-1 text-xs font-medium text-bad hover:bg-bad-soft px-2.5 py-1.5 rounded-lg" aria-label={`حذف ${a.fullName}`}>
                    <Trash2 size={13} /> حذف
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <AccountantForm
          value={form}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSaved={(a, password) => {
            setList((l) => (l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [a, ...l]))
            if (password) setCreated({ name: a.fullName, username: a.username ?? '', password })
            setForm(null)
          }}
        />
      )}

      <Modal open={!!deleting} title="حذف حسابدار" onClose={() => setDeleting(null)} footer={<><GhostButton onClick={() => setDeleting(null)}>انصراف</GhostButton><PrimaryButton className="!bg-bad" onClick={confirmDelete}>حذف کامل</PrimaryButton></>}>
        <p className="text-sm leading-7">
          حساب «{deleting?.fullName}» حذف شود؟ او دیگر نمی‌تواند وارد شود. سوابق شارژ و فاکتورهایی که ثبت کرده می‌ماند.
          <br /><span className="text-muted">اگر فقط موقتاً نباید کار کند، «غیرفعال‌سازی» بهتر است.</span>
        </p>
      </Modal>

      <Modal open={!!created} title="اطلاعات ورود حسابدار" onClose={() => setCreated(null)} footer={<PrimaryButton onClick={() => setCreated(null)}>متوجه شدم</PrimaryButton>}>
        {created && <Credentials {...created} />}
      </Modal>
    </div>
  )
}

function AccountantForm({ value: f, onChange, onClose, onSaved }: { value: Form; onChange: (f: Form) => void; onClose: () => void; onSaved: (a: Accountant, newPassword?: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isNew = !f.id
  const set = (p: Partial<Form>) => onChange({ ...f, ...p })
  const phone = toEnDigits(f.phone).trim()
  const problems = [
    f.fullName.trim().length < 2 && 'نام و نام خانوادگی',
    !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(f.username) && 'نام کاربری (۳ تا ۳۲ حرف کوچک انگلیسی/عدد)',
    (isNew || f.password) && f.password.length < 8 && 'رمز عبور (حداقل ۸ کاراکتر)',
    phone && !/^0\d{10}$/.test(phone) && 'موبایل ۱۱ رقمی',
    f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && 'ایمیل معتبر',
  ].filter(Boolean) as string[]

  async function save() {
    if (problems.length) return
    setSaving(true)
    setError('')
    const base = { fullName: f.fullName.trim(), username: f.username.trim(), phone: phone || null, email: f.email.trim() || null, isActive: f.isActive }
    try {
      const a = isNew ? await api.create({ ...base, password: f.password }) : await api.update(f.id!, { ...base, ...(f.password ? { password: f.password } : {}) })
      onSaved(a, f.password || undefined)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ذخیره ناموفق بود — اتصال به سرور را بررسی کنید.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={isNew ? 'تعریف حسابدار جدید' : `ویرایش «${f.fullName}»`}
      onClose={onClose}
      footer={
        <>
          {problems.length > 0 && <span className="text-xs text-muted ml-auto self-center">ناقص: {problems.join('، ')}</span>}
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={saving || problems.length > 0} onClick={save}>{saving ? 'در حال ذخیره…' : isNew ? 'ساخت حسابدار و حساب ورود' : 'ذخیره تغییرات'}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        {error && <p className="text-sm bg-bad-soft text-bad rounded-xl px-4 py-3">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="نام و نام خانوادگی *" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus />
          <TextField label="موبایل" inputMode="tel" dir="ltr" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="09121234567" />
          <TextField label="نام کاربری *" dir="ltr" value={f.username} onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="acc.ali" hint="حروف کوچک انگلیسی، عدد، نقطه یا خط تیره" />
          <TextField label="ایمیل (اختیاری)" type="email" dir="ltr" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          <div>
            <TextField label={isNew ? 'رمز عبور موقت *' : 'رمز جدید (خالی = بدون تغییر)'} dir="ltr" value={f.password} onChange={(e) => set({ password: e.target.value })} />
            <button type="button" onClick={() => set({ password: generatePassword() })} className="text-xs text-tile hover:underline mt-1 flex items-center gap-1"><RefreshCw size={12} /> تولید رمز تصادفی</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="w-4 h-4 accent-[var(--color-tile)]" />
          حساب فعال است (حسابدار می‌تواند وارد شود)
        </label>
      </div>
    </Modal>
  )
}
