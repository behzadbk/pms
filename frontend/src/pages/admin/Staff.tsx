import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { staffApi, ApiError } from '../../lib/api'
import type { StaffInput, StaffMember, StaffProfile } from '../../lib/api/staff'
import {
  ALL_PERMISSIONS,
  departments,
  departmentDefaults,
  departmentLabel,
  permissionInfo,
  shiftLabels,
  type StaffDepartment,
  type StaffPermission,
} from '../../lib/staff'
import { faDateTime } from '../../lib/store'
import { LAST_TENANT_KEY } from '../Login'

type FormState = {
  id?: string
  fullName: string
  nationalId: string
  phone: string
  email: string
  department: StaffDepartment
  extra: StaffPermission[]
  username: string
  password: string
  isActive: boolean
  profile: StaffProfile
}

const emptyForm = (): FormState => ({
  fullName: '',
  nationalId: '',
  phone: '',
  email: '',
  department: 'lobby',
  extra: [],
  username: '',
  password: generatePassword(),
  isActive: true,
  profile: { shift: 'morning' },
})

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  arr.forEach((n) => (out += chars[n % chars.length]))
  return out
}

/** اعداد فارسی/عربی → انگلیسی (کد ملی و موبایل را کاربر ممکن است با کیبورد فارسی بزند) */
const toEnDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

export function AdminStaff() {
  const [list, setList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [dept, setDept] = useState<string>('')
  const [form, setForm] = useState<FormState | null>(null)
  const [deleting, setDeleting] = useState<StaffMember | null>(null)
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setList(await staffApi.list())
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

  const filtered = useMemo(
    () =>
      list.filter(
        (s) =>
          (!dept || s.department === dept) &&
          (!q || `${s.fullName} ${s.username ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [list, q, dept],
  )

  function openEdit(s: StaffMember) {
    const defaults = departmentDefaults(s.department)
    setForm({
      id: s.id,
      fullName: s.fullName,
      nationalId: s.nationalId ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      department: (s.department ?? 'lobby') as StaffDepartment,
      extra: s.permissions.filter((p) => !defaults.includes(p)),
      username: s.username ?? '',
      password: '',
      isActive: s.isActive,
      profile: { ...s.profile },
    })
  }

  async function toggleActive(s: StaffMember) {
    try {
      const updated = await staffApi.update(s.id, { isActive: !s.isActive })
      setList((l) => l.map((x) => (x.id === s.id ? updated : x)))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تغییر وضعیت ناموفق بود')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await staffApi.remove(deleting.id)
      setList((l) => l.filter((x) => x.id !== deleting.id))
      setDeleting(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'حذف ناموفق بود')
      setDeleting(null)
    }
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    list.forEach((s) => s.department && (m[s.department] = (m[s.department] ?? 0) + 1))
    return m
  }, [list])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">کارکنان</h1>
          <p className="text-muted text-sm mt-1">تعریف کارکنان، بخش و شیفت، دسترسی به پنل‌ها و ساخت نام کاربری/رمز ورود</p>
        </div>
        <PrimaryButton onClick={() => setForm(emptyForm())}>
          <Plus size={16} /> کارمند جدید
        </PrimaryButton>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setDept('')}
          className={`px-3.5 py-2 rounded-xl text-sm border ${dept === '' ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}
        >
          همه ({list.length.toLocaleString('fa-IR')})
        </button>
        {departments.map((d) => (
          <button
            key={d.id}
            onClick={() => setDept(d.id)}
            className={`px-3.5 py-2 rounded-xl text-sm border ${dept === d.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}
          >
            {d.label} {counts[d.id] ? `(${counts[d.id].toLocaleString('fa-IR')})` : ''}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی نام، نام کاربری یا موبایل"
          className="w-full rounded-xl border border-line bg-card pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-tile/40"
        />
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
      ) : filtered.length === 0 && !error ? (
        <Card>
          <div className="p-10 text-center space-y-2">
            <Users size={28} className="mx-auto text-muted" />
            <p className="text-sm text-muted">{list.length === 0 ? 'هنوز کارمندی تعریف نشده است.' : 'موردی پیدا نشد.'}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className={s.isActive ? '' : 'opacity-60'}>
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-tile-soft text-tile flex items-center justify-center shrink-0">
                    <UserRound size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{s.fullName}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {departmentLabel(s.department)}
                      {s.profile.shift && ` · شیفت ${shiftLabels[s.profile.shift]}`}
                    </p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${s.isActive ? 'bg-good-soft text-good' : 'bg-canvas text-muted'}`}>
                    {s.isActive ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {s.effectivePermissions.map((p) => {
                    const extra = !departmentDefaults(s.department).includes(p)
                    return (
                      <span
                        key={p}
                        className={`text-[11px] px-2 py-0.5 rounded-full ${extra ? 'bg-brass-soft text-brass' : 'bg-canvas text-muted'}`}
                        title={extra ? 'دسترسی دستی' : 'پیش‌فرض بخش'}
                      >
                        {permissionInfo[p].label}
                        {extra && ' +'}
                      </span>
                    )
                  })}
                </div>

                <div className="text-xs text-muted space-y-1">
                  <p className="flex items-center gap-1.5">
                    <KeyRound size={12} /> <span dir="ltr" className="font-mono">{s.username}</span>
                  </p>
                  {s.phone && <p dir="ltr" className="text-right">{s.phone}</p>}
                  <p>آخرین ورود: {s.lastLoginAt ? faDateTime(s.lastLoginAt) : 'هنوز وارد نشده'}</p>
                </div>

                <div className="flex items-center gap-1 pt-1 border-t border-line">
                  <button onClick={() => openEdit(s)} className="flex items-center gap-1 text-xs font-medium text-tile hover:bg-tile-soft px-2.5 py-1.5 rounded-lg" aria-label={`ویرایش ${s.fullName}`}>
                    <Pencil size={13} /> ویرایش
                  </button>
                  <button onClick={() => toggleActive(s)} className="text-xs font-medium text-muted hover:bg-canvas px-2.5 py-1.5 rounded-lg">
                    {s.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                  </button>
                  <button onClick={() => setDeleting(s)} className="mr-auto flex items-center gap-1 text-xs font-medium text-bad hover:bg-bad-soft px-2.5 py-1.5 rounded-lg" aria-label={`حذف ${s.fullName}`}>
                    <Trash2 size={13} /> حذف
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <StaffForm
          value={form}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSaved={(m, password) => {
            setList((l) => (l.some((x) => x.id === m.id) ? l.map((x) => (x.id === m.id ? m : x)) : [m, ...l]))
            if (password) setCreated({ name: m.fullName, username: m.username ?? '', password })
            setForm(null)
          }}
        />
      )}

      <Modal
        open={!!deleting}
        title="حذف کارمند"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <GhostButton onClick={() => setDeleting(null)}>انصراف</GhostButton>
            <PrimaryButton className="!bg-bad" onClick={confirmDelete}>حذف کامل</PrimaryButton>
          </>
        }
      >
        <p className="text-sm leading-7">
          حساب «{deleting?.fullName}» حذف شود؟ او دیگر نمی‌تواند وارد شود.
          <br />
          <span className="text-muted">اگر فقط موقتاً نباید کار کند، «غیرفعال‌سازی» بهتر است.</span>
        </p>
      </Modal>

      <Modal
        open={!!created}
        title="اطلاعات ورود کارمند"
        onClose={() => setCreated(null)}
        footer={<PrimaryButton onClick={() => setCreated(null)}>متوجه شدم</PrimaryButton>}
      >
        {created && <Credentials {...created} />}
      </Modal>
    </div>
  )
}

function Credentials({ name, username, password }: { name: string; username: string; password: string }) {
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

function StaffForm({
  value: f,
  onChange,
  onClose,
  onSaved,
}: {
  value: FormState
  onChange: (f: FormState) => void
  onClose: () => void
  onSaved: (m: StaffMember, newPassword?: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isNew = !f.id
  const set = (p: Partial<FormState>) => onChange({ ...f, ...p })
  const setP = (p: Partial<StaffProfile>) => onChange({ ...f, profile: { ...f.profile, ...p } })
  const defaults = departmentDefaults(f.department)

  const nid = toEnDigits(f.nationalId).trim()
  const phone = toEnDigits(f.phone).trim()
  const problems = [
    !f.fullName.trim() && 'نام و نام خانوادگی',
    !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(f.username) && 'نام کاربری (۳ تا ۳۲ حرف کوچک انگلیسی/عدد)',
    (isNew || f.password) && f.password.length < 6 && 'رمز عبور (حداقل ۶ کاراکتر)',
    nid && !/^\d{10}$/.test(nid) && 'کد ملی ۱۰ رقمی',
    phone && !/^0\d{10}$/.test(phone) && 'موبایل ۱۱ رقمی',
  ].filter(Boolean) as string[]

  async function save() {
    if (problems.length) return
    setSaving(true)
    setError('')
    const payload: StaffInput = {
      fullName: f.fullName.trim(),
      username: f.username.trim(),
      department: f.department,
      permissions: f.extra.filter((p) => !defaults.includes(p)),
      phone: phone || null,
      nationalId: nid || null,
      email: f.email.trim() || null,
      profile: Object.fromEntries(Object.entries(f.profile).filter(([, v]) => v !== '' && v != null)) as StaffProfile,
      isActive: f.isActive,
      ...(f.password ? { password: f.password } : {}),
    }
    try {
      const m = isNew ? await staffApi.create(payload) : await staffApi.update(f.id!, payload)
      onSaved(m, f.password || undefined)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ذخیره ناموفق بود — اتصال به سرور را بررسی کنید.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="xl"
      title={isNew ? 'تعریف کارمند جدید' : `ویرایش «${f.fullName}»`}
      onClose={onClose}
      footer={
        <>
          {problems.length > 0 && <span className="text-xs text-muted ml-auto self-center">ناقص: {problems.join('، ')}</span>}
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={saving || problems.length > 0} onClick={save}>
            {saving ? 'در حال ذخیره…' : isNew ? 'ساخت کارمند و حساب ورود' : 'ذخیره تغییرات'}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-6">
        {error && <p className="text-sm bg-bad-soft text-bad rounded-xl px-4 py-3">{error}</p>}

        <section>
          <p className="text-sm font-medium mb-3">اطلاعات شخصی</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField label="نام و نام خانوادگی *" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus />
            <TextField label="کد ملی" inputMode="numeric" dir="ltr" value={f.nationalId} onChange={(e) => set({ nationalId: e.target.value })} placeholder="0012345678" />
            <TextField label="موبایل" inputMode="tel" dir="ltr" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="09121234567" />
            <TextField label="تاریخ تولد" value={f.profile.birthDate ?? ''} onChange={(e) => setP({ birthDate: e.target.value })} placeholder="۱۳۷۰/۰۵/۲۱" />
            <TextField label="تماس اضطراری (نام)" value={f.profile.emergencyName ?? ''} onChange={(e) => setP({ emergencyName: e.target.value })} />
            <TextField label="تماس اضطراری (شماره)" inputMode="tel" dir="ltr" value={f.profile.emergencyPhone ?? ''} onChange={(e) => setP({ emergencyPhone: toEnDigits(e.target.value) })} />
            <TextField className="sm:col-span-3" label="آدرس" value={f.profile.address ?? ''} onChange={(e) => setP({ address: e.target.value })} />
          </div>
        </section>

        <section>
          <p className="text-sm font-medium mb-3">محل کار و دسترسی</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="بخش / نقش *"
              value={f.department}
              onChange={(e) => {
                const d = e.target.value as StaffDepartment
                set({ department: d, extra: f.extra.filter((p) => !departmentDefaults(d).includes(p)) })
              }}
              options={departments.map((d) => ({ value: d.id, label: d.label }))}
            />
            <SelectField
              label="شیفت"
              value={f.profile.shift ?? ''}
              onChange={(e) => setP({ shift: (e.target.value || undefined) as StaffProfile['shift'] })}
              options={[{ value: '', label: '—' }, ...Object.entries(shiftLabels).map(([value, label]) => ({ value, label }))]}
            />
            <TextField label="تاریخ شروع همکاری" value={f.profile.hireDate ?? ''} onChange={(e) => setP({ hireDate: e.target.value })} placeholder="۱۴۰۵/۰۷/۰۱" />
          </div>

          <div className="mt-4">
            <p className="text-xs text-muted mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} /> پنل‌هایی که این کارمند می‌بیند — پیش‌فرض بخش قفل است؛ برای جابه‌جایی شیفت دسترسی اضافه بدهید
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_PERMISSIONS.map((p) => {
                const isDefault = defaults.includes(p)
                const checked = isDefault || f.extra.includes(p)
                const Icon = permissionInfo[p].icon
                return (
                  <label
                    key={p}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm ${
                      checked ? 'border-tile bg-tile-soft/50' : 'border-line'
                    } ${isDefault ? 'opacity-80' : 'cursor-pointer hover:border-ink-soft'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isDefault}
                      onChange={(e) => set({ extra: e.target.checked ? [...f.extra, p] : f.extra.filter((x) => x !== p) })}
                      className="mt-0.5 accent-[var(--color-tile)]"
                    />
                    <Icon size={16} className="text-tile mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">{permissionInfo[p].label}</span>
                      {isDefault && <span className="text-[11px] text-muted"> (پیش‌فرض بخش)</span>}
                      <span className="block text-xs text-muted mt-0.5">{permissionInfo[p].desc}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </section>

        <section>
          <p className="text-sm font-medium mb-3">حساب ورود</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            <TextField
              label="نام کاربری *"
              dir="ltr"
              value={f.username}
              onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/\s/g, '') })}
              placeholder="reza.lobby"
              hint="حروف کوچک انگلیسی، عدد، نقطه یا خط تیره"
            />
            <div>
              <TextField
                label={isNew ? 'رمز عبور *' : 'رمز جدید (خالی = بدون تغییر)'}
                dir="ltr"
                value={f.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <button type="button" onClick={() => set({ password: generatePassword() })} className="text-xs text-tile hover:underline mt-1 flex items-center gap-1">
                <RefreshCw size={12} /> تولید رمز تصادفی
              </button>
            </div>
            <TextField label="ایمیل (اختیاری)" type="email" dir="ltr" value={f.email} onChange={(e) => set({ email: e.target.value })} />
            <label className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-3">
              <input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="w-4 h-4 accent-[var(--color-tile)]" />
              حساب فعال است (کارمند می‌تواند وارد شود)
            </label>
          </div>
        </section>

        <TextArea label="یادداشت (فقط برای مدیر)" value={f.profile.notes ?? ''} onChange={(e) => setP({ notes: e.target.value })} rows={2} />
      </div>
    </Modal>
  )
}
