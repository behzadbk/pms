import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarRange, Megaphone, Ticket, Vote, Wallet, UsersRound } from 'lucide-react'
import { residentsApi, ago, type InboxItem } from '../lib/api/residents'
import { AnimatePresence, motion } from 'framer-motion'
import { useRole } from '../context/RoleContext'
import { useStore, markNotificationsRead, faDateTime, type NotificationRec } from '../lib/store'
import { useViewerAudiences } from '../lib/access'
import { useAuth } from '../context/AuthContext'

const kindIcon: Record<NotificationRec['kind'], typeof Bell> = {
  announcement: Megaphone,
  poll: Vote,
  reservation: CalendarRange,
  ticket: Ticket,
  finance: Wallet,
}

/** اعلان‌های داخل برنامه برای نقش فعلی (اعلان، نظرسنجی، نتیجه‌ی رزرو، تیکت، مالی) */
export function NotificationBell({ variant }: { variant: 'dark' | 'light' }) {
  const { role } = useRole()
  const { notifications } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const aud = useViewerAudiences()
  const { user } = useAuth()
  const reader = user?.id ?? role
  const mine = notifications.filter((n) => n.audience.some((a) => aud.includes(a)))
  // صندوق اعلان سرور (notification.inbox): درخواست کودک، درخواست عضویت، رزرو منتظر تأیید، …
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const loadInbox = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (!user || user.role === 'super_admin') return
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
  const unread = mine.filter((n) => !n.readBy.includes(reader)).length + inbox.filter((n) => !n.read).length

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

  function go(n: NotificationRec) {
    setOpen(false)
    if (!n.link) return
    // لینک‌های عمومی به صفحه‌ی متناظر در پنل نقش فعلی می‌روند
    const generic: Record<string, Partial<Record<string, string>>> = {
      '/announcements': {},
      '/reservations': { admin: '/admin/reservations', staff: '/staff/amenity-desk' },
      '/tickets': { admin: '/admin/tickets', staff: '/staff/work-orders' },
    }
    const target = n.link in generic ? generic[n.link][role] ?? `/${role}${n.link}` : n.link
    if (target.startsWith(`/${role}`)) navigate(target)
  }

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
                    markNotificationsRead(reader, aud)
                    residentsApi.readInbox('all').then(() => loadInbox.current()).catch(() => undefined)
                  }}
                  className="text-xs text-tile hover:underline"
                >
                  علامت همه به‌عنوان خوانده‌شده
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {mine.length === 0 && inbox.length === 0 && <p className="text-sm text-muted text-center py-8">اعلانی ندارید</p>}
              {inbox.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => goInbox(n)}
                  className={`w-full text-right flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-canvas ${!n.read ? 'bg-tile-soft/40' : ''}`}
                >
                  <span className="w-8 h-8 shrink-0 rounded-full bg-canvas flex items-center justify-center text-tile">
                    {n.kind.startsWith('reservation') ? <CalendarRange size={15} /> : <UsersRound size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm truncate ${!n.read ? 'font-bold' : 'font-medium'}`}>{n.title}</span>
                    {n.body && <span className="block text-xs text-muted mt-0.5 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-muted/70 mt-1">{ago(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-tile mt-2 shrink-0" />}
                </button>
              ))}
              {mine.slice(0, 30).map((n) => {
                const Icon = kindIcon[n.kind]
                const isUnread = !n.readBy.includes(reader)
                return (
                  <button
                    key={n.id}
                    onClick={() => go(n)}
                    className={`w-full text-right flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-canvas ${isUnread ? 'bg-tile-soft/40' : ''}`}
                  >
                    <span className="w-8 h-8 shrink-0 rounded-full bg-canvas flex items-center justify-center text-tile">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{n.title}</span>
                      {n.body && <span className="block text-xs text-muted mt-0.5 line-clamp-2">{n.body}</span>}
                      <span className="block text-[11px] text-muted/70 mt-1">{faDateTime(n.createdAt)}</span>
                    </span>
                    {isUnread && <span className="w-2 h-2 rounded-full bg-tile mt-2 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
