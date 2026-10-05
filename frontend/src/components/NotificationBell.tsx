import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarRange, Megaphone, Ticket, Vote, Wallet, UsersRound, UtensilsCrossed, Wrench } from 'lucide-react'
import { residentsApi, ago, type InboxItem } from '../lib/api/residents'
import { AnimatePresence, motion } from 'framer-motion'
import { useRole } from '../context/RoleContext'
import { useAuth } from '../context/AuthContext'
import { syncPushSubscription } from '../lib/pushNotifications'

/** آیکن هر نوع اعلان صندوق سرور؛ ناشناخته‌ها آیکن «کاربران» می‌گیرند */
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

/** اعلان‌های داخل برنامه برای نقش فعلی (اعلان، نظرسنجی، نتیجه‌ی رزرو، تیکت، مالی) */
export function NotificationBell({ variant }: { variant: 'dark' | 'light' }) {
  const { role } = useRole()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { user } = useAuth()
  // صندوق اعلان سرور (notification.inbox): درخواست کودک، درخواست عضویت، رزرو منتظر تأیید، …
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const loadInbox = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (!user || user.role === 'super_admin') return
    void syncPushSubscription()
    let alive = true
    loadInbox.current = () =>
      residentsApi
        .inbox()
        .then((r) => alive && setInbox(r.items))
        .catch(() => undefined)
    loadInbox.current()
    const t = window.setInterval(() => loadInbox.current(), 30_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [user])
  // پوش رسید (service worker) → صندوق فوراً تازه شود؛ کلیک روی اعلان سیستم → ناوبری داخل SPA
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'push') loadInbox.current()
      else if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
        const u = new URL(e.data.url, window.location.origin)
        if (u.origin === window.location.origin) navigate(u.pathname + u.search)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [navigate])
  const unread = inbox.filter((n) => !n.read).length

  /** لینک‌های سرور برای نقش فعلی (مثلاً مدیر به‌جای میز مسئول مشاعات به رزروها می‌رود) */
  function goInbox(n: InboxItem) {
    setOpen(false)
    residentsApi.readInbox(n.id).then(() => loadInbox.current()).catch(() => undefined)
    let to = n.link
    if (to === '/staff/amenity-desk' && role === 'admin') to = '/admin/reservations'
    if (to === '/resident/reservations' && role === 'child') to = '/child'
    if (n.kind === 'child_request_result' || n.kind === 'child_request_expired') to = role === 'child' ? `/child/waiting/${n.ref_id}` : to
    if (to) navigate(to)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2 rounded-lg transition-colors ${variant === 'dark' ? '-ml-2 active:bg-white/10' : 'rounded-full hover:bg-canvas'}`}
        aria-label={`اعلان‌ها${unread ? ` — ${unread} خوانده‌نشده` : ''}`}
      >
        <Bell size={20} className={variant === 'light' ? 'text-muted' : ''} />
        {unread > 0 && (
          <span className="absolute top-1 left-1 min-w-4 h-4 px-1 rounded-full bg-bad text-white text-[10px] leading-4 text-center font-bold">
            {unread > 9 ? '۹+' : unread.toLocaleString('fa-IR')}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] bg-card text-ink-text rounded-2xl border border-line shadow-xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <p className="font-semibold text-sm">اعلان‌ها</p>
              {unread > 0 && (
                <button
                  onClick={() => {
                    residentsApi.readInbox('all').then(() => loadInbox.current()).catch(() => undefined)
                  }}
                  className="text-xs text-tile hover:underline"
                >
                  علامت همه به‌عنوان خوانده‌شده
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {inbox.length === 0 && <p className="text-sm text-muted text-center py-8">اعلانی ندارید</p>}
              {inbox.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => goInbox(n)}
                  className={`w-full text-right flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-canvas ${!n.read ? 'bg-tile-soft/40' : ''}`}
                >
                  <span className="w-8 h-8 shrink-0 rounded-full bg-canvas flex items-center justify-center text-tile">
                    {(() => { const Icon = iconFor(n.kind); return <Icon size={15} /> })()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm truncate ${!n.read ? 'font-bold' : 'font-medium'}`}>{n.title}</span>
                    {n.body && <span className="block text-xs text-muted mt-0.5 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-muted/70 mt-1">{ago(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-tile mt-2 shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
