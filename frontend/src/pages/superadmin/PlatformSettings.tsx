import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Play, Save, ShieldCheck, UserPlus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { GhostButton, PrimaryButton, SelectField, TextField } from '../../components/ui/Modal'
import { Loading, ErrorBlock, Toggle } from '../../components/hm'
import { useAuth } from '../../context/AuthContext'
import { platformApi } from '../../lib/api'
import { errText, fa } from '../../lib/api/residents'
import type { PlatformAdminInfo, PlatformRole, PlatformSettings } from '../../lib/api/platform'
import { tiers } from '../../lib/tiers'

const ROLE_LABEL: Record<PlatformRole, string> = { owner: 'مالک (همه‌چیز)', support: 'پشتیبان', sales: 'فروش' }
const ROLE_HELP: Record<PlatformRole, string> = {
  owner: 'مالی، تنظیمات، اعضای تیم، خروجی داده، لغو ساختمان',
  support: 'تعلیق/فعال‌سازی، ورود به‌جای مدیر، یادداشت، لاگ',
  sales: 'تعریف و ویرایش ساختمان (بدون مالی)، یادداشت',
}

export function SuperAdminSettings() {
  const { user } = useAuth()
  const isOwner = user?.platformRole === 'owner'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تنظیمات و تیم</h1>
        <p className="text-muted text-sm mt-1">قیمت‌ها، مهلت پرداخت و تعلیق خودکار، اعضای تیم پلتفرم و امنیت حساب شما</p>
      </div>
      <SettingsCard editable={isOwner} />
      {isOwner && <TeamCard selfId={user?.id ?? ''} />}
      <SecurityCard initial={!!user?.totpEnabled} />
    </div>
  )
}

/* ───────────── تنظیمات پلتفرم ───────────── */

function SettingsCard({ editable }: { editable: boolean }) {
  const [s, setS] = useState<PlatformSettings | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try { setS(await platformApi.getSettings()) } catch (e) { setErr(errText(e, 'دریافت تنظیمات ناموفق بود')) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save() {
    if (!s) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      setS(await platformApi.updateSettings(s))
      setMsg('تنظیمات ذخیره شد')
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  async function runNow() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await platformApi.runScheduler()
      setMsg(r.ran ? `اجرا شد: ${fa(r.newlyOverdue)} ساختمان تازه معوق، ${fa(r.suspendedForDebt)} تعلیق بابت بدهی، ${fa(r.suspendedTrialEnded)} تعلیق پایان آزمایشی` : 'زمان‌بند هم‌اکنون روی نمونه‌ی دیگری در حال اجراست')
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  if (!s) return <Card><CardHeader title="تنظیمات پلتفرم" />{err ? <ErrorBlock message={err} retry={load} /> : <Loading />}</Card>
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v) || 0)))

  return (
    <Card>
      <CardHeader title="تنظیمات پلتفرم" />
      <div className="px-5 pb-5 space-y-5">
        {!editable && <p className="text-xs text-muted bg-canvas rounded-lg px-3 py-2">فقط مالک (owner) می‌تواند تنظیمات را تغییر دهد.</p>}

        <div>
          <p className="text-sm font-medium mb-2">قیمت ماهانه‌ی هر واحد (تومان)</p>
          <p className="text-xs text-muted mb-3 leading-6">مبنای مبلغ پیشنهادی هنگام تعریف ساختمان جدید؛ روی ساختمان‌های موجود اثر ندارد.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {tiers.map((t) => (
              <TextField key={t.id} label={t.label} type="number" min={0} inputMode="numeric" dir="ltr" disabled={!editable}
                value={s.pricePerUnit[t.id]} onChange={(e) => setS({ ...s, pricePerUnit: { ...s.pricePerUnit, [t.id]: num(e.target.value) } })} />
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="مهلت پرداخت بعد از سررسید (روز)" type="number" min={0} dir="ltr" disabled={!editable}
            value={s.graceDays} onChange={(e) => setS({ ...s, graceDays: num(e.target.value) })} />
          <TextField label="طول دوره‌ی آزمایشی ساختمان جدید (روز)" type="number" min={0} dir="ltr" disabled={!editable}
            value={s.trialDays} onChange={(e) => setS({ ...s, trialDays: num(e.target.value) })} />
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <span className="text-sm">
              <span className="font-medium block">تعلیق خودکار بابت بدهی</span>
              <span className="text-xs text-muted">ساختمانی که بیش از «مهلت پرداخت» روز فاکتور بازِ سررسیدگذشته دارد خودکار تعلیق می‌شود (ورود کاربرانش بسته می‌شود؛ داده‌ها می‌ماند)</span>
            </span>
            <Toggle on={s.autoSuspend} onChange={(v) => editable && setS({ ...s, autoSuspend: v })} label="تعلیق خودکار بابت بدهی" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <span className="text-sm">
              <span className="font-medium block">تعلیق خودکار پایان دوره‌ی آزمایشی</span>
              <span className="text-xs text-muted">ساختمان آزمایشی که تاریخ پایانش گذشته تعلیق می‌شود</span>
            </span>
            <Toggle on={s.autoSuspendTrial} onChange={(v) => editable && setS({ ...s, autoSuspendTrial: v })} label="تعلیق خودکار پایان آزمایشی" />
          </label>
        </div>

        {err && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2">{err}</p>}
        {msg && <p className="text-sm text-good bg-good-soft rounded-lg px-3 py-2">{msg}</p>}

        {editable && (
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={save} disabled={busy}><Save size={15} /> ذخیره‌ی تنظیمات</PrimaryButton>
            <GhostButton onClick={runNow} disabled={busy}><Play size={15} /> اجرای دستی زمان‌بند</GhostButton>
          </div>
        )}
        <p className="text-xs text-muted leading-6">زمان‌بند هر ساعت خودکار اجرا می‌شود: فاکتورهای سررسیدگذشته را «معوق» علامت می‌زند و فقط اگر دو گزینه‌ی بالا روشن باشند تعلیق می‌کند.</p>
      </div>
    </Card>
  )
}

/* ───────────── تیم ───────────── */

function TeamCard({ selfId }: { selfId: string }) {
  const [admins, setAdmins] = useState<PlatformAdminInfo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [secret, setSecret] = useState<{ username: string; password: string; note: string } | null>(null)
  const [form, setForm] = useState<{ username: string; fullName: string; role: PlatformRole }>({ username: '', fullName: '', role: 'support' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try { setAdmins((await platformApi.listAdmins()).admins) } catch (e) { setErr(errText(e, 'دریافت تیم ناموفق بود')) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null)
    try { await fn(); await load() } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader title="اعضای تیم پلتفرم" />
      <div className="px-5 pb-5 space-y-4">
        {err && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2">{err}</p>}
        {secret && (
          <div className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm space-y-1">
            <p className="font-medium">رمز موقت «{secret.username}» — فقط همین یک‌بار نمایش داده می‌شود</p>
            <p className="font-mono text-base select-all" dir="ltr">{secret.password}</p>
            <p className="text-xs text-muted">{secret.note}</p>
            <button className="text-xs underline" onClick={() => setSecret(null)}>بستن</button>
          </div>
        )}

        {!admins ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-right text-muted border-y border-line">
                  <th className="font-medium py-2.5 pe-3">عضو</th>
                  <th className="font-medium py-2.5 pe-3">نقش</th>
                  <th className="font-medium py-2.5 pe-3">۲FA</th>
                  <th className="font-medium py-2.5 pe-3">آخرین ورود</th>
                  <th className="font-medium py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className={`border-b border-line last:border-0 align-top ${a.isActive ? '' : 'opacity-50'}`}>
                    <td className="py-3 pe-3"><p className="font-medium">{a.fullName}</p><p className="text-xs text-muted font-mono" dir="ltr">{a.username}</p></td>
                    <td className="py-3 pe-3">
                      <select value={a.role} disabled={busy || a.id === selfId} onChange={(e) => run(() => platformApi.updateAdmin(a.id, { role: e.target.value as PlatformRole }))}
                        className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm">
                        {(Object.keys(ROLE_LABEL) as PlatformRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pe-3">{a.totpEnabled ? <span className="text-good text-xs font-medium">روشن</span> : <span className="text-muted text-xs">خاموش</span>}</td>
                    <td className="py-3 pe-3 text-xs text-muted">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('fa-IR') : '—'}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {a.id !== selfId && (
                          <button disabled={busy} className="text-tile hover:underline" onClick={() => run(() => platformApi.updateAdmin(a.id, { isActive: !a.isActive }))}>{a.isActive ? 'غیرفعال' : 'فعال'}</button>
                        )}
                        <button disabled={busy} className="text-tile hover:underline" onClick={() => run(async () => setSecret(await platformApi.resetAdminPassword(a.id)))}>بازنشانی رمز</button>
                        {a.totpEnabled && <button disabled={busy} className="text-tile hover:underline" onClick={() => run(() => platformApi.resetAdmin2fa(a.id))}>بازنشانی ۲FA</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-xl bg-canvas p-4 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2"><UserPlus size={15} /> افزودن عضو</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <TextField label="نام کاربری" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <TextField label="نام و نام خانوادگی" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <SelectField label="نقش" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PlatformRole })}
              options={(Object.keys(ROLE_LABEL) as PlatformRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          </div>
          <p className="text-xs text-muted">{ROLE_HELP[form.role]} — رمز موقت ساخته می‌شود و عضو در اولین ورود باید آن را عوض کند.</p>
          <PrimaryButton disabled={busy || form.username.trim().length < 3 || form.fullName.trim().length < 2}
            onClick={() => run(async () => {
              const r = await platformApi.createAdmin({ username: form.username.trim(), fullName: form.fullName.trim(), role: form.role })
              setSecret(r.credentials)
              setForm({ username: '', fullName: '', role: 'support' })
            })}>
            افزودن
          </PrimaryButton>
        </div>
      </div>
    </Card>
  )
}

/* ───────────── امنیت من (۲FA) ───────────── */

function SecurityCard({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader title="امنیت حساب من — ورود دومرحله‌ای" />
      <div className="px-5 pb-5 space-y-4">
        <p className="text-sm flex items-center gap-2">
          <ShieldCheck size={16} className={enabled ? 'text-good' : 'text-muted'} />
          {enabled ? 'ورود دومرحله‌ای روشن است' : 'ورود دومرحله‌ای خاموش است — پیشنهاد می‌شود برای همه‌ی اعضای تیم روشن باشد'}
        </p>
        {err && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2">{err}</p>}

        {!enabled && !setup && (
          <PrimaryButton disabled={busy} onClick={() => run(async () => setSetup(await platformApi.setup2fa()))}><KeyRound size={15} /> شروع راه‌اندازی</PrimaryButton>
        )}

        {!enabled && setup && (
          <div className="space-y-3 rounded-xl bg-canvas p-4">
            <p className="text-sm leading-7">در برنامه‌ی احراز هویت (Google Authenticator، Authy، 2FAS …) یک حساب جدید با «کلید دستی» بسازید و این کلید را وارد کنید، سپس کد ۶ رقمی را اینجا بزنید:</p>
            <p className="font-mono text-sm break-all select-all bg-card rounded-lg px-3 py-2 border border-line" dir="ltr">{setup.secret}</p>
            <details className="text-xs text-muted"><summary className="cursor-pointer">لینک otpauth (برای برنامه‌هایی که پشتیبانی می‌کنند)</summary><p className="font-mono break-all mt-1 select-all" dir="ltr">{setup.otpauthUrl}</p></details>
            <div className="flex flex-wrap items-end gap-2">
              <TextField label="کد ۶ رقمی" inputMode="numeric" dir="ltr" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
              <PrimaryButton disabled={busy || code.replace(/\s/g, '').length !== 6}
                onClick={() => run(async () => { await platformApi.enable2fa(code); setEnabled(true); setSetup(null); setCode('') })}>تأیید و روشن‌کردن</PrimaryButton>
            </div>
          </div>
        )}

        {enabled && (
          <div className="space-y-3 rounded-xl bg-canvas p-4">
            <p className="text-sm">برای خاموش‌کردن، رمز و کد فعلی لازم است:</p>
            <div className="flex flex-wrap items-end gap-2">
              <TextField label="رمز عبور" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="w-48" />
              <TextField label="کد ۶ رقمی" inputMode="numeric" dir="ltr" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
              <GhostButton disabled={busy || !password || code.replace(/\s/g, '').length !== 6}
                onClick={() => run(async () => { await platformApi.disable2fa(password, code); setEnabled(false); setPassword(''); setCode('') })}>خاموش‌کردن</GhostButton>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
