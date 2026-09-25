import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarRange, Megaphone, Ticket, Vote, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRole } from '../context/RoleContext'
import { useStore, viewerAudiences, markNotificationsRead, faDateTime, type NotificationRec } from '../lib/store'

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

  const aud = viewerAudiences(role)
  const mine = notifications.filter((n) => n.audience.some((a) => aud.includes(a)))
  const unread = mine.filter((n) => !n.readBy.includes(role)).length

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function go(n: NotificationRec) {
    setOpen(false)
    if (!n.link) return
    // لینک عمومی «/announcements» به صفحه‌ی اعلانات نقش فعلی می‌رود
    const target = n.link === '/announcements' ? `/${role}/announcements` : n.link
    if (target.startsWith(`/${role}`)) navigate(target)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2 rounded-lg transition-colors ${variant === 'dark' ? '-ml-2 active:bg-white/10' : 'rounded-full hover:bg-canvas'}`}
        aria-label={`اعلان‌ها${unread ? ` — ${unread} خوانده‌نشده` : ''}`}
      >
        <Bell size={20} className={variant === 'light' ? 'text-ink-soft' : ''} />
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
                <button onClick={() => markNotificationsRead(role)} className="text-xs text-tile hover:underline">
                  علامت همه به‌عنوان خوانده‌شده
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {mine.length === 0 && <p className="text-sm text-muted text-center py-8">اعلانی ندارید</p>}
              {mine.slice(0, 30).map((n) => {
                const Icon = kindIcon[n.kind]
                const isUnread = !n.readBy.includes(role)
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
