import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Building, ChevronLeft, GitMerge, Search } from 'lucide-react'
import { residentsApi, errText, fa, type BuildingOccupancy, type PersonFile, type PersonHit } from '../../lib/api/residents'
import { formatJalali } from '../../lib/jalali'
import { Avatar, Badge, ErrorBlock, Loading, PageHeader, PageTitle, useLoad, useToast } from '../../components/hm'
import { AdminResidents } from '../admin/residents/Residents'

function tagOf(b: BuildingOccupancy): { t: string; tone: 'warn' | 'ok' | 'bad' | 'mute' } {
  if (!b.manager_assigned) return { t: 'مدیر تعیین نشده', tone: 'mute' }
  if (b.pending === 0) return { t: 'بدون درخواست', tone: 'ok' }
  return { t: `${fa(b.pending)} در انتظار`, tone: b.pending >= 10 ? 'bad' : 'warn' }
}

/** B1 — همه‌ی ساختمان‌ها با درصد پر بودن + جست‌وجوی شخص در همه‌ی ساختمان‌ها */
export function SuperAdminResidents() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 350)
    return () => window.clearTimeout(t)
  }, [q])
  const { data, error, loading, reload } = useLoad(() => residentsApi.adminResidents(term || undefined), [term])

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker={data ? `سوپرادمین · ${fa(data.buildings.length)} ساختمان` : ' '} title="ساکنین" />
      <label className="hm-row !py-2.5">
        <Search size={20} className="text-[var(--hm-t3)] shrink-0" />
        <input className="hm-input !font-normal" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در همه‌ی ساختمان‌ها" aria-label="جست‌وجوی شخص" />
      </label>
      {loading && !data && <Loading />}
      {error && <ErrorBlock message={error} retry={() => reload()} />}
      {term && data && (
        <div className="flex flex-col gap-2">
          {data.people.length === 0 && <p className="text-sm text-[var(--hm-t2)] text-center py-4">کسی با این مشخصات پیدا نشد</p>}
          {data.people.map((p: PersonHit) => (
            <button key={p.id} className="hm-row" onClick={() => navigate(`/super-admin/users/${p.id}`)}>
              <Avatar initial={p.name.trim()[0] ?? '؟'} />
              <span className="flex-1 min-w-0 text-right">
                <span className="block text-sm font-bold">{p.name}</span>
                <span className="block mt-0.5 text-xs text-[var(--hm-t2)]">
                  <span dir="ltr">{p.phone ?? '—'}</span>
                  {p.memberships.length ? ' · ' + p.memberships.map(fa).join('، ') : ''}
                </span>
              </span>
              {p.status === 'blocked' && <Badge tone="bad">مسدود</Badge>}
              <ChevronLeft size={20} className="text-[var(--hm-t3)]" />
            </button>
          ))}
        </div>
      )}
      {!term && (
        <div className="flex flex-col gap-2">
          {data?.buildings.map((b) => {
            const tag = tagOf(b)
            return (
              <button key={b.id} className="hm-card p-4 flex flex-col gap-2 text-right" onClick={() => navigate(`/super-admin/residents/${b.id}`)}>
                <span className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-bold">{b.name}</span>
                  <Badge tone={tag.tone}>{tag.t}</Badge>
                </span>
                <span className="hm-bar">
                  <span style={{ width: `${b.occupancy_pct}%` }} />
                </span>
                <span className="text-xs text-[var(--hm-t2)]">
                  {b.setting_up
                    ? `در حال راه‌اندازی · ${fa(b.units_filled)} از ${fa(b.units_total)} واحد`
                    : `مدیر: ${b.manager_name ?? '—'} · ${fa(b.units_filled)} از ${fa(b.units_total)} واحد پر`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** فهرست ساکنین یک ساختمان از دید سوپرادمین (فقط‌خواندنی) */
export function SuperAdminBuildingResidents() {
  const { id = '' } = useParams()
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="ساکنین ساختمان" sub="نمای سوپرادمین · برای ثبت و ویرایش از پنل مدیر همان ساختمان" back="/super-admin/residents" />
      <AdminResidents buildingId={id} readOnly />
    </div>
  )
}

/** B2 — پرونده‌ی شخص در چند ساختمان + تاریخچه + خروج از همه دستگاه‌ها / مسدودسازی / ادغام */
export function SuperAdminUserFile() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useLoad<PersonFile>(() => residentsApi.adminUser(id), [id])
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true)
    try {
      await fn()
      toast(msg)
      await reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? 'یافت نشد'} retry={() => reload()} />
  const u = data.user
  const dup = data.duplicates[0]
  const blocked = u.status === 'blocked'
  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <div className="flex items-center gap-3">
        <button className="hm-back" onClick={() => navigate(-1)} aria-label="بازگشت">
          <ChevronLeft size={22} className="rotate-180" />
        </button>
        <Avatar initial={u.name.trim()[0] ?? '؟'} />
        <div className="flex-1">
          <p className="text-base font-bold">{u.name}</p>
          <p className="mt-0.5 text-xs text-[var(--hm-t2)]" dir="ltr" style={{ textAlign: 'right' }}>
            {u.phone ?? '—'}
          </p>
        </div>
        {blocked && <Badge tone="bad">مسدود</Badge>}
      </div>

      {dup && (
        <div className="hm-note hm-tone-warn" style={{ borderRadius: 16 }}>
          <GitMerge size={20} className="shrink-0" />
          <div className="flex-1">
            <p className="font-bold leading-6">
              {dup.reason === 'national_id' ? 'حساب مشابه با همین کد ملی' : 'حساب مشابه با همین نام'} با شماره‌ی دیگر{' '}
              <span dir="ltr">{dup.phone ?? ''}</span>
            </p>
            <button
              className="mt-1 text-xs font-bold text-[var(--hm-pri)]"
              disabled={busy}
              onClick={() => window.confirm(`حساب «${dup.name}» در این حساب ادغام شود؟`) && act(() => residentsApi.adminMerge(u.id, dup.id), 'دو حساب ادغام شد')}
            >
              بررسی و ادغام
            </button>
          </div>
        </div>
      )}

      <p className="text-sm font-bold">عضویت‌ها</p>
      {data.memberships.length === 0 && <p className="text-xs text-[var(--hm-t2)]">عضویتی ثبت نشده است</p>}
      {data.memberships.map((m) => (
        <div key={m.id} className="hm-row" style={m.status === 'ended' ? { opacity: 0.6 } : undefined}>
          <Building size={22} className="text-[var(--hm-pri)] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">{fa(m.title)}</p>
            <p className="mt-0.5 text-xs text-[var(--hm-t2)]">
              {m.description} · از {formatJalali(m.start_date).split(' ').slice(1).join(' ')}
              {m.status === 'ended' ? ' · پایان‌یافته' : m.status !== 'active' ? ' · ' + m.status : ''}
            </p>
          </div>
        </div>
      ))}

      <p className="text-sm font-bold">تاریخچه تغییرات</p>
      <div className="hm-card px-4 py-1 hm-divided">
        {data.audit.length === 0 && <p className="py-3 text-xs text-[var(--hm-t2)]">رویدادی ثبت نشده است</p>}
        {data.audit.map((a, i) => (
          <div key={i} className="py-2.5">
            <p className="text-xs leading-6">{fa(a.t)}</p>
            <p className="mt-0.5 text-xs text-[var(--hm-t3)]">
              {a.building} · {new Date(a.at).toLocaleString('fa-IR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
      </div>

      <div className="hm-sticky flex gap-2">
        <button className="hm-cta-ghost flex-1" disabled={busy} onClick={() => act(() => residentsApi.adminAction(u.id, 'logout-all'), `${u.name} از همه دستگاه‌ها خارج شد`)}>
          خروج از همه دستگاه‌ها
        </button>
        {blocked ? (
          <button className="lg4-capsule hm-cta flex-1" disabled={busy} onClick={() => act(() => residentsApi.adminAction(u.id, 'unblock'), 'مسدودی حساب برداشته شد')}>
            رفع مسدودی
          </button>
        ) : (
          <button
            className="hm-cta-danger flex-1"
            disabled={busy}
            onClick={() => act(() => residentsApi.adminAction(u.id, 'block'), 'حساب مسدود شد · دسترسی در همه ساختمان‌ها قطع شد')}
          >
            مسدودسازی
          </button>
        )}
      </div>
      {toastNode}
    </div>
  )
}
