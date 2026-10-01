import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Car, History, KeyRound, LogOut, Pencil, UserPlus, CalendarClock } from 'lucide-react'
import { residentsApi, errText, fa, type Tone, type UnitFile as UnitFileT, type UnitMember } from '../../../lib/api/residents'
import { formatJalali } from '../../../lib/jalali'
import { Avatar, Badge, ErrorBlock, Loading, Note, PageHeader, Sheet, useLoad, useToast } from '../../../components/hm'

const RES_LABEL = { owner: 'مالک ساکن', tenant: 'مستأجر', owner_absent: 'مالک غیرساکن' } as const

function accessOf(m: UnitMember): { t: string; tone: Tone } {
  if (m.status === 'invited') return { t: 'دعوت ارسال شد', tone: 'warn' }
  if (m.role === 'head') return { t: 'دسترسی کامل', tone: 'ok' }
  if (m.role === 'child') return { t: 'حالت والدین', tone: 'pri' }
  if (m.role === 'senior') return { t: 'حالت ساده', tone: 'mute' }
  if (m.role === 'caregiver') return { t: 'دسترسی موقت', tone: 'warn' }
  return { t: 'بزرگسال', tone: 'ok' }
}

/** A4 — پرونده‌ی واحد: کارت قهرمان، مالک، اعضا و چهار اقدام */
export function AdminUnitFile() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: u, setData, error, loading, reload } = useLoad<UnitFileT>(() => residentsApi.unit(id), [id])
  const [member, setMember] = useState<UnitMember | null>(null)
  const [cars, setCars] = useState(false)
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()

  useEffect(() => {
    const t = (location.state as { toast?: string } | null)?.toast
    if (t) {
      toast(t)
      window.history.replaceState({}, '')
    }
  }, [location.state, toast])

  if (loading && !u) return <Loading />
  if (error || !u) return <ErrorBlock message={error ?? 'واحد یافت نشد'} retry={() => reload()} />

  const residents = u.members.filter((m) => m.role !== 'owner_absent' && ['invited', 'active'].includes(m.status))
  const head = u.head
  const specs = [`طبقه ${fa(u.floor ?? '—')}`, u.area ? `${fa(u.area)} متر` : null, `${fa(u.parking_count)} پارکینگ`, u.storage_no ? `انباری ${fa(u.storage_no)}` : null]
    .filter(Boolean)
    .join(' · ')

  async function act(fn: () => Promise<UnitFileT | unknown>, msg: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (r && typeof r === 'object' && 'members' in (r as object)) setData(r as UnitFileT)
      else await reload(true)
      setMember(null)
      toast(msg)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const actions = [
    { icon: UserPlus, t: 'افزودن عضو', c: 'var(--hm-pri)', on: () => navigate(`/admin/residents/new?unit=${u.id}`) },
    { icon: Car, t: 'خودروها', c: 'var(--hm-pri)', on: () => setCars(true) },
    { icon: History, t: 'تاریخچه', c: 'var(--hm-pri)', on: () => navigate('/admin/logs') },
    { icon: LogOut, t: 'تخلیه', c: 'var(--hm-bad)', on: () => navigate(`/admin/units/${u.id}/move-out`) },
  ]

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageHeader
        title={`واحد ${fa(u.no)}`}
        back="/admin/residents"
        action={
          head && (
            <button className="hm-back" aria-label="ویرایش" onClick={() => navigate(`/admin/units/${u.id}/edit?member=${head.membership_id}`)}>
              <Pencil size={20} />
            </button>
          )
        }
      />

      <div className="lg4-hero p-5">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,.85)' }}>{specs}</p>
        <p className="mt-2 text-xl font-bold">{head ? `${RES_LABEL[head.residency]} · ${fa(u.resident_count)} ساکن` : 'واحد خالی'}</p>
        {head && (
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,.85)' }}>
            {head.residency === 'tenant'
              ? `قرارداد ${formatJalali(head.start_date)}${head.end_date ? ' تا ' + formatJalali(head.end_date) : ''} · شارژ با ${head.pays_charge ? 'مستأجر' : 'مالک'}`
              : `ساکن از ${formatJalali(head.start_date)}`}
          </p>
        )}
      </div>

      {u.scheduled_move_out && (
        <Note tone="bad" icon={CalendarClock}>
          تخلیه برای {formatJalali(u.scheduled_move_out.date)} ثبت شده است؛ دسترسی اعضا در همان روز قطع می‌شود.
        </Note>
      )}

      {u.owner && u.owner.absent && (
        <div className="hm-row">
          <KeyRound size={22} className="text-[var(--hm-acc)] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">{u.owner.name} · مالک غیرساکن</p>
            <p className="mt-0.5 text-xs text-[var(--hm-t2)]">فقط صورتحساب و اطلاعیه‌ها را می‌بیند</p>
          </div>
        </div>
      )}

      {residents.length > 0 && (
        <div className="hm-card px-4 py-2">
          {residents.map((m) => {
            const a = accessOf(m)
            return (
              <button key={m.id} className="w-full flex items-center gap-3 py-2 text-right" onClick={() => setMember(m)}>
                <Avatar initial={m.name.trim()[0] ?? '؟'} tone={m.role === 'child' ? 'acc' : m.role === 'caregiver' ? 'mute' : 'pri'} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate">{m.name}</span>
                  <span className="block mt-0.5 text-xs text-[var(--hm-t2)]">
                    {m.role_label}
                    {m.age !== null && m.role === 'child' ? ` · ${fa(m.age)} سال` : ''}
                    {m.role === 'caregiver' && m.end_date ? ` · تا ${formatJalali(m.end_date, false)}` : ''}
                  </span>
                </span>
                <Badge tone={a.tone}>{a.t}</Badge>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <button key={a.t} onClick={a.on} className="hm-card flex flex-col items-center gap-1.5 py-3 px-1" style={{ borderRadius: 16 }}>
            <a.icon size={22} style={{ color: a.c }} />
            <span className="text-xs font-bold text-center" style={{ color: a.c }}>
              {a.t}
            </span>
          </button>
        ))}
      </div>

      <Sheet open={!!member} onClose={() => setMember(null)} label="اقدام روی عضو">
        {member && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-2 mb-2">
              <Avatar initial={member.name.trim()[0] ?? '؟'} />
              <div>
                <p className="text-base font-bold">{member.name}</p>
                <p className="text-xs text-[var(--hm-t2)]" dir="ltr" style={{ textAlign: 'right' }}>
                  {member.phone ?? 'بدون موبایل'}
                </p>
              </div>
            </div>
            <button className="hm-row" onClick={() => navigate(`/admin/units/${u.id}/edit?member=${member.id}`)}>
              <span className="text-sm font-bold">ویرایش اطلاعات</span>
            </button>
            {member.status === 'invited' && member.phone && (
              <button className="hm-row" disabled={busy} onClick={() => act(() => residentsApi.invite(u.id, member.phone!), `دعوت دوباره برای ${member.name} ارسال شد`)}>
                <span className="text-sm font-bold">ارسال دوباره‌ی دعوت</span>
              </button>
            )}
            {member.role !== 'head' && ['adult', 'senior'].includes(member.role) && member.status === 'active' && (
              <button
                className="hm-row"
                disabled={busy}
                onClick={() => act(() => residentsApi.updateMembership(member.id, { role: 'head' }), `سرپرستی به ${member.name} واگذار شد`)}
              >
                <span className="text-sm font-bold">واگذاری سرپرستی به این عضو</span>
              </button>
            )}
            <button
              className="hm-row"
              disabled={busy}
              onClick={() => act(() => residentsApi.updateMembership(member.id, { status: 'ended' }), `عضویت ${member.name} پایان یافت`)}
            >
              <span className="text-sm font-bold text-[var(--hm-bad)]">{member.role === 'head' ? 'پایان عضویت (ابتدا سرپرستی را واگذار کنید)' : 'پایان عضویت'}</span>
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={cars} onClose={() => setCars(false)} label="خودروها">
        <p className="mx-2 mb-3 text-base font-bold">خودروهای واحد {fa(u.no)}</p>
        {u.vehicles.length === 0 ? (
          <p className="text-sm text-[var(--hm-t2)] text-center py-6">خودرویی برای این واحد ثبت نشده است</p>
        ) : (
          u.vehicles.map((v) => (
            <div key={v.plate} className="hm-row mb-2">
              <Car size={20} />
              <span className="font-bold">{v.plate}</span>
            </div>
          ))
        )}
      </Sheet>
      {toastNode}
    </div>
  )
}
