import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleCheckBig } from 'lucide-react'
import { residentsApi, errText, fa } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { Cta, ErrorBlock, Field, FieldCard, Loading, Seg, useLoad } from '../../components/hm'
import { LAST_TENANT_KEY } from '../Login'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex justify-center px-4 py-10 pt-safe"
      style={{ background: 'radial-gradient(900px 500px at 70% -10%, color-mix(in srgb, var(--lg4-pri) 16%, transparent), transparent), var(--lg-bg-base)' }}
    >
      <div className="w-full max-w-sm flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Done({ title, sub, cta }: { title: string; sub: string; cta?: ReactNode }) {
  return (
    <div className="hm-card p-6 flex flex-col items-center text-center gap-3">
      <span className="hm-avatar hm-tone-ok" style={{ width: 72, height: 72 }}>
        <CircleCheckBig size={36} />
      </span>
      <p className="text-xl font-bold">{title}</p>
      <p className="text-sm leading-7 text-[var(--hm-t2)]">{sub}</p>
      {cta}
    </div>
  )
}

/** ثبت‌نام عمومی با QR لابی — همیشه «در انتظار تأیید مدیر» (قاعده ۴) */
export function LobbyJoin() {
  const { token = '' } = useParams()
  const { data, error, loading } = useLoad(() => residentsApi.lobbyInfo(token), [token])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [unit, setUnit] = useState('')
  const [res, setRes] = useState<'tenant' | 'owner'>('tenant')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const r = await residentsApi.lobbyJoin(token, { name, phone, unit_no: unit, residency: res })
      setSent(r.unit_no)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      {loading && <Loading />}
      {error && <ErrorBlock message={error} />}
      {data && !sent && (
        <>
          <div>
            <p className="text-xs text-[var(--hm-t2)]">{data.building}</p>
            <p className="mt-1 text-xl font-bold">ثبت‌نام ساکن جدید</p>
            <p className="mt-1 text-xs leading-6 text-[var(--hm-t2)]">ثبت‌نام با QR لابی پس از تأیید مدیر فعال می‌شود؛ اگر واحد سرپرست دارد، تأیید او هم لازم است.</p>
          </div>
          <Seg<'tenant' | 'owner'> options={[['tenant', 'مستأجر'], ['owner', 'مالک ساکن']]} value={res} onChange={setRes} />
          <FieldCard>
            <Field label="نام و نام خانوادگی" value={name} onChange={setName} placeholder="مثلاً رضا کریمی" />
            <Field label="شماره موبایل" value={phone} onChange={setPhone} placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" inputMode="tel" dir="ltr" />
            <Field label="شماره واحد" value={unit} onChange={setUnit} placeholder="مثلاً ۱۲۰۴" inputMode="numeric" />
          </FieldCard>
          {err && <p className="text-xs font-bold text-[var(--hm-bad)] px-2">{err}</p>}
          <Cta onClick={submit} busy={busy} disabled={!name.trim() || phone.trim().length < 10 || !unit.trim()}>
            ارسال درخواست
          </Cta>
        </>
      )}
      {sent && <Done title="درخواست شما ثبت شد" sub={`پس از تأیید مدیر برای واحد ${fa(sent)}، پیامک فعال‌سازی برایتان ارسال می‌شود.`} />}
    </Shell>
  )
}

/** پذیرش لینک دعوت پیامکی: نام + رمز → حساب ورود با شماره موبایل */
export function AcceptInvite() {
  const { token = '' } = useParams()
  const { data, error, loading } = useLoad(() => residentsApi.inviteInfo(token), [token])
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ username: string } | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const r = await residentsApi.acceptInvite(token, { name: name || undefined, password: pw })
      try {
        localStorage.setItem(LAST_TENANT_KEY, r.subdomain)
      } catch {
        /* ignore */
      }
      setDone({ username: r.username })
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      {loading && <Loading />}
      {error && <ErrorBlock message={error} />}
      {data && !done && !data.valid && <ErrorBlock message="این لینک دعوت دیگر معتبر نیست؛ از مدیر یا سرپرست خانوار بخواهید دوباره ارسال کند." />}
      {data && !done && data.valid && (
        <>
          <div>
            <p className="text-xs text-[var(--hm-t2)]">
              {data.building} · واحد {fa(data.unit_no)}
            </p>
            <p className="mt-1 text-xl font-bold">به همینو خوش آمدید</p>
            <p className="mt-1 text-xs leading-6 text-[var(--hm-t2)]">این لینک تا {formatJalali(data.expires_at)} معتبر است.</p>
          </div>
          <FieldCard>
            <Field label="نام و نام خانوادگی" value={name || data.name} onChange={setName} placeholder="مثلاً رضا کریمی" />
            <Field label="شماره موبایل (نام کاربری)" value={data.phone ?? ''} onChange={() => undefined} dir="ltr" />
            <Field label="رمز عبور" value={pw} onChange={setPw} type="password" dir="ltr" placeholder="حداقل ۶ کاراکتر" />
          </FieldCard>
          {err && <p className="text-xs font-bold text-[var(--hm-bad)] px-2">{err}</p>}
          <Cta onClick={submit} busy={busy} disabled={pw.length < 6 || !(name || data.name)}>
            فعال‌سازی حساب
          </Cta>
        </>
      )}
      {done && (
        <Done
          title="حساب شما فعال شد"
          sub={`از این به بعد با شماره ${fa(done.username)} و رمزی که انتخاب کردید وارد شوید.`}
          cta={
            <Link to="/login" className="lg4-capsule hm-cta">
              ورود
            </Link>
          }
        />
      )}
    </Shell>
  )
}
