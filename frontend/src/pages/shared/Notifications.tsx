import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CalendarRange, ChevronRight, Megaphone, Send, Ticket, UsersRound, UtensilsCrossed, Vote, Wallet, Wrench, BellOff } from 'lucide-react'
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../../lib/pushNotifications'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../context/RoleContext'
import { residentsApi, ago, type InboxItem } from '../../lib/api/residents'
import { EmptyState, Loading } from '../../components/hm'

function iconFor(kind: string) {
  if (kind.startsWith('reservation')) return CalendarRange
  if (kind.startsWith('fnb')) return UtensilsCrossed
  if (kind === 'announcement' || kind === 'platform') return Megaphone
  if (kind === 'poll') return Vote
  if (kind === 'ticket') return Ticket
  if (kind === 'workorder') return Wrench
  if (kind === 'finance' || kind === 'charge') return Wallet
  return UsersRound
}

function PushSwitch() {
  const { user } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  useEffect(() => {
    void getPushState().then(setState)
  }, [])
  if (!user || user.role === 'super_admin') return null

  async function toggle() {
    setBusy(true)
    setMsg(null)
    try {
      if (state === 'on') {
        await disablePush()
        setMsg({ ok: true, t: 'اعلان گوشی خاموش شد' })
      } else {
        await enablePush()
        setMsg({ ok: true, t: 'اعلان گوشی فعال شد' })
      }
      setState(await getPushState())
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : 'خطا' })
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }
  async function test() {
    setBusy(true)
    setMsg(null)
    try {
      const n = await sendTestPush()
      setMsg(n > 0 ? { ok: true, t: 'اعلان آزمایشی ارسال شد؛ باید تا چند ثانیه‌ی دیگر برسد.' } : { ok: false, t: 'اشتراکی برای این حساب پیدا نشد. یک‌بار خاموش و دوباره روشن کنید.' })
    } catch {
      setMsg({ ok: false, t: 'ارسال ناموفق بود.' })
    } finally {
      setBusy(false)
    }
  }

  const hint =
    state === 'needs-install'
      ? 'در آیفون ابتدا همین را به صفحه‌ی اصلی اضافه کنید (Share ← Add to Home Screen) و از همان آیکن باز کنید.'
      : state === 'unsupported'
        ? 'این مرورگر از اعلان پشتیبانی نمی‌کند.'
        : state === 'blocked'
          ? 'اعلان برای این سایت مسدود است. از تنظیمات مرورگر/گوشی اجازه‌ی اعلان را بدهید.'
          : ''
  const disabled = busy || state === null || state === 'unsupported' || state === 'needs-install' || state === 'blocked'

  return (
    <section>
      <div className="lg4-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <BellRing size={22} className="text-[var(--lg4-pri)] flex-none" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">اعلان‌های گوشی</p>
            {hint && <p className="text-xs text-muted mt-0.5 leading-6">{hint}</p>}
          </div>
          <button
            role="switch"
            aria-checked={state === 'on'}
            aria-label="اعلان‌های گوشی"
            disabled={disabled}
            onClick={toggle}
            className="relative w-12 h-7 rounded-full flex-none transition-colors disabled:opacity-50"
            style={{ background: state === 'on' ? 'var(--lg4-pri)' : 'var(--lg-border-hairline)' }}
          >
            <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ right: state === 'on' ? '4px' : '28px' }} />
          </button>
        </div>
        {state === 'on' && (
          <button onClick={test} disabled={busy} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--lg4-pri)] min-h-[44px] disabled:opacity-60">
            <Send size={16} /> ارسال اعلان آزمایشی
          </button>
        )}
        {msg && <p className={`text-xs leading-6 ${msg.ok ? 'text-[var(--lg-text-secondary)]' : 'text-bad'}`}>{msg.t}</p>}
      </div>
    </section>
  )
}


/** صفحه‌ی اعلان‌ها: همه‌ی اعلان‌های حساب در یک‌جا + کلید اعلان گوشی */
export function Notifications() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { user } = useAuth()
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const load = () => residentsApi.inbox().then((r) => setItems(r.items ?? [])).catch(() => setItems([]))
  useEffect(() => {
    void load()
  }, [])
  const unread = (items ?? []).filter((n) => !n.read).length

  function open(n: InboxItem) {
    residentsApi.readInbox(n.id).then(load).catch(() => undefined)
    let to = n.link
    if (to === '/staff/amenity-desk' && role === 'admin') to = '/admin/reservations'
    if (to === '/resident/reservations' && role === 'child') to = '/child'
    if (n.kind === 'child_request_result' || n.kind === 'child_request_expired') to = role === 'child' ? `/child/waiting/${n.ref_id}` : to
    if (to) navigate(to)
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 hm-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="بازگشت" className="w-11 h-11 flex-none rounded-full lg4-card flex items-center justify-center">
          <ChevronRight size={22} />
        </button>
        <h1 className="text-xl font-bold flex-1">اعلان‌ها</h1>
        {unread > 0 && (
          <button className="text-sm font-bold text-[var(--lg4-pri)] min-h-[44px] px-2" onClick={() => residentsApi.readInbox('all').then(load).catch(() => undefined)}>
            خواندن همه
          </button>
        )}
      </div>
      {user && user.role !== 'super_admin' && <PushSwitch />}
      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon={BellOff} tone="pri" title="اعلانی ندارید" />
      ) : (
        <div className="hm-card px-2 py-1 hm-divided">
          {items.map((n) => {
            const Icon = iconFor(n.kind)
            return (
              <button key={n.id} onClick={() => open(n)} className="w-full min-h-[64px] flex items-start gap-3 px-2 py-3 text-right">
                <span className="hm-icon-tile shrink-0"><Icon size={20} /></span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</span>
                  {n.body && <span className="block text-xs text-[var(--hm-t2)] mt-1 line-clamp-2">{n.body}</span>}
                  <span className="block text-xs text-[var(--hm-t3)] mt-1">{ago(n.created_at)}</span>
                </span>
                {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-[var(--hm-pri)] mt-2 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
