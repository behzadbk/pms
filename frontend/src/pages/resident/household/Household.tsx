import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BellRing, ChevronLeft, ShieldUser, UserRoundPlus } from 'lucide-react'
import { residentsApi, errText, fa, type Household as HouseholdT, type HouseholdMember, type Tone } from '../../../lib/api/residents'
import { Avatar, Badge, Cta, ErrorBlock, Loading, PageHeader, Sheet, StickyCta, useLoad, useToast } from '../../../components/hm'

function tones(m: HouseholdMember): { badge: Tone; avatar: Tone } {
  if (m.status === 'invited') return { badge: 'warn', avatar: 'mute' }
  if (m.role === 'child') return { badge: 'pri', avatar: 'acc' }
  if (m.role === 'caregiver') return { badge: 'warn', avatar: 'mute' }
  return { badge: 'ok', avatar: 'pri' }
}

/** C1 — خانوار من (فقط سرپرست تغییر می‌دهد؛ بقیه فهرست را فقط می‌بینند) */
export function ResidentHousehold() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, setData, error, loading, reload } = useLoad<HouseholdT>(() => residentsApi.household(), [])
  const { data: reqs } = useLoad(() => residentsApi.childRequests('pending').catch(() => []), [])
  const [sel, setSel] = useState<HouseholdMember | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()

  useEffect(() => {
    const t = (location.state as { toast?: string } | null)?.toast
    if (t) {
      toast(t)
      window.history.replaceState({}, '')
    }
  }, [location.state, toast])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? ''} retry={() => reload()} />
  const isHead = data.me.is_head

  async function act(fn: () => Promise<HouseholdT | unknown>, msg: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (r && typeof r === 'object' && 'members' in (r as object)) setData(r as HouseholdT)
      else await reload(true)
      setSel(null)
      toast(msg)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  function open(m: HouseholdMember) {
    if (m.role === 'child') return navigate(m.preset === 'u7' ? `/resident/family/${m.id}/login` : `/resident/family/${m.id}/parent`)
    if (!isHead) return toast(`${m.name} · ${m.access_label}`)
    if (m.status === 'invited') return act(() => residentsApi.resendInvite(m.id), `دعوت دوباره برای ${m.name} ارسال شد`)
    if (m.is_me) return toast(`${m.name} · ${m.access_label}`)
    setSel(m)
  }

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageHeader title="خانوار من" sub={`واحد ${fa(data.unit.no)}${isHead ? ' · شما سرپرست هستید' : ''}`} back="/resident" />

      {(reqs?.length ?? 0) > 0 && (
        <button className="hm-row" style={{ borderColor: 'var(--hm-warn)' }} onClick={() => navigate('/resident/family/requests')}>
          <BellRing size={22} className="text-[var(--hm-warn)] shrink-0" />
          <span className="flex-1 text-right text-sm font-bold">{fa(reqs!.length)} درخواست کودک منتظر تأیید شماست</span>
          <ChevronLeft size={20} className="text-[var(--hm-t3)]" />
        </button>
      )}

      {data.pending.map((p) => (
        <div key={p.id} className="hm-card p-4 flex flex-col gap-2">
          <p className="text-sm font-bold">{p.name} می‌خواهد به خانوار شما اضافه شود</p>
          <p className="text-xs text-[var(--hm-t2)]" dir="ltr" style={{ textAlign: 'right' }}>
            {p.phone}
          </p>
          <div className="flex gap-2">
            <button className="hm-cta-ghost flex-1 !min-h-[44px]" disabled={busy} onClick={() => act(() => residentsApi.decideJoin(p.id, false), 'درخواست رد شد')}>
              رد
            </button>
            <button className="lg4-capsule flex-[2] min-h-[44px] text-sm font-bold" disabled={busy} onClick={() => act(() => residentsApi.decideJoin(p.id, true), `${p.name} به خانوار اضافه شد`)}>
              تأیید
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2">
        {data.members.map((m) => {
          const t = tones(m)
          return (
            <button key={m.id} className="hm-row" onClick={() => open(m)}>
              <Avatar initial={m.initial} tone={t.avatar} />
              <span className="flex-1 min-w-0 flex flex-col gap-1 text-right">
                <span className="text-sm font-bold truncate">{m.name}</span>
                <span className="text-xs text-[var(--hm-t2)]">{m.is_me ? `${m.role_label} · شما` : m.role === 'child' || m.role === 'caregiver' ? m.role_label : m.sub}</span>
                {(m.role === 'child' || m.role === 'caregiver') && <span className="text-xs text-[var(--hm-t3)]">{m.sub}</span>}
              </span>
              <Badge tone={t.badge}>{m.access_label}</Badge>
            </button>
          )
        })}
      </div>

      <div className="hm-note" style={{ background: 'var(--lg4-inner)', color: 'var(--hm-t2)' }}>
        <ShieldUser size={18} className="shrink-0" />
        <p>فقط سرپرست خانوار اعضا را اضافه یا حذف می‌کند. برای واگذاری سرپرستی، روی نام یک بزرگسال بزنید.</p>
      </div>

      {isHead && (
        <StickyCta>
          <Cta onClick={() => navigate('/resident/family/add')}>
            <UserRoundPlus size={22} />
            افزودن عضو خانواده
          </Cta>
        </StickyCta>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} label="اقدام روی عضو">
        {sel && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-2 mb-2">
              <Avatar initial={sel.initial} />
              <div>
                <p className="text-base font-bold">{sel.name}</p>
                <p className="text-xs text-[var(--hm-t2)]">{sel.role_label}</p>
              </div>
            </div>
            {['adult', 'senior'].includes(sel.role) && sel.status === 'active' && (
              <button
                className="hm-row"
                disabled={busy}
                onClick={() => window.confirm(`سرپرستی خانوار به ${sel.name} واگذار شود؟ بعد از آن فقط او می‌تواند اعضا را تغییر دهد.`) && act(() => residentsApi.transferHead(sel.id), `سرپرستی به ${sel.name} واگذار شد`)}
              >
                <span className="text-sm font-bold">واگذاری سرپرستی</span>
              </button>
            )}
            <button
              className="hm-row"
              disabled={busy}
              onClick={() => window.confirm(`${sel.name} از خانوار حذف شود؟ دسترسی او فوراً قطع می‌شود.`) && act(() => residentsApi.removeMember(sel.id), `${sel.name} از خانوار حذف شد`)}
            >
              <span className="text-sm font-bold text-[var(--hm-bad)]">حذف از خانوار</span>
            </button>
          </div>
        )}
      </Sheet>
      {toastNode}
    </div>
  )
}
