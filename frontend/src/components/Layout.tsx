import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Building2, Bell, ChevronDown, LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ROLE_SWITCHER_ENABLED, useRole, useRoleInfo } from '../context/RoleContext'
import { useAuth } from '../context/AuthContext'
import { navByRole } from '../lib/nav'
import { roles } from '../lib/mockData'
import type { Role } from '../lib/types'
import { NotificationPrompt } from './NotificationPrompt'

const MOBILE_TAB_COUNT = 4

/** true وقتی viewport به‌اندازه breakpoint دسکتاپ (lg = 1024px) یا بزرگ‌تر است */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

export function Layout() {
  const { role, setRole } = useRole()
  const info = useRoleInfo()
  const { user, logout } = useAuth()
  const nav = navByRole[role]
  const navigate = useNavigate()
  const location = useLocation()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isDesktop = useIsDesktop()

  // فقط وقتی مسیر فعلی متعلق به نقش دیگری است به خانه‌ی نقش برو — قبلاً با هر رفرش صفحه
  // (مثلاً روی /admin/charges) کاربر به داشبورد پرتاب می‌شد و لینک مستقیم کار نمی‌کرد.
  useEffect(() => {
    const section = `/${nav[0].to.split('/')[1]}`
    if (location.pathname !== section && !location.pathname.startsWith(`${section}/`)) {
      navigate(nav[0].to)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  // بستن خودکار drawer موبایل با هر تغییر مسیر
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // قفل اسکرول پس‌زمینه وقتی drawer باز است
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  function handleLogout() {
    const wasSuperAdmin = user?.role === 'super_admin'
    logout()
    // سوپرادمین به صفحه‌ی ورود پنل پلتفرم برمی‌گردد، نه صفحه‌ی ورود ساکنین
    navigate(wasSuperAdmin ? '/super-admin/login' : '/login', { replace: true })
  }

  const tabItems = nav.slice(0, MOBILE_TAB_COUNT)
  const hasMore = nav.length > MOBILE_TAB_COUNT

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------- هدر موبایل (فقط زیر lg) ---------- */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink text-white px-4 pt-safe h-14 shrink-0">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -mr-2 rounded-lg active:bg-white/10 transition-colors"
          aria-label="باز کردن منو"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-tile rounded-lg p-1.5 shrink-0">
            <Building2 size={16} />
          </div>
          <p className="font-semibold text-sm truncate">برج آفتاب</p>
        </div>
        <button className="relative p-2 -ml-2 rounded-lg active:bg-white/10 transition-colors" aria-label="اعلان‌ها">
          <Bell size={20} />
          <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-bad" />
        </button>
      </header>

      {/* ---------- Backdrop موبایل ---------- */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ---------- سایدبار: ثابت روی دسکتاپ، Drawer روی موبایل ---------- */}
      <motion.aside
        key="sidebar"
        className="w-72 lg:w-64 shrink-0 bg-ink text-white flex flex-col fixed lg:static inset-y-0 right-0 z-50 lg:z-auto"
        initial={false}
        animate={{ x: isDesktop || drawerOpen ? 0 : '100%' }}
        transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        style={{ willChange: 'transform' }}
      >
        <div className="flex items-center justify-between gap-2.5 px-5 h-16 border-b border-white/10 pt-safe lg:pt-0 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-tile rounded-lg p-1.5 shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold leading-none truncate">برج آفتاب</p>
              <p className="text-xs text-white/50 mt-1 truncate">همین — سامانه مدیریت ساختمان</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden p-1.5 -ml-1.5 rounded-lg active:bg-white/10 shrink-0"
            aria-label="بستن منو"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item, i) => (
            <motion.div
              key={item.to}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
            >
              <NavLink
                to={item.to}
                end={item.to === `/${role}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors active:scale-[0.98] ${
                    isActive ? 'bg-tile text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} strokeWidth={2} />
                {item.label}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 pb-safe shrink-0 space-y-1">
          <button
            onClick={() => ROLE_SWITCHER_ENABLED && setSwitcherOpen((s) => !s)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 active:bg-white/10 relative transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brass flex items-center justify-center text-xs font-bold shrink-0">
              {(user?.fullName ?? info.personaName)[0]}
            </div>
            <div className="text-right flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName ?? info.personaName}</p>
              <p className="text-xs text-white/50 truncate">{info.label}</p>
            </div>
            <motion.span animate={{ rotate: switcherOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} className="text-white/50" />
            </motion.span>

            <AnimatePresence>
              {switcherOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-2 left-3 right-3 bg-ink-soft rounded-xl border border-white/10 overflow-hidden shadow-xl z-20"
                >
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setRole(r.id as Role)
                        setSwitcherOpen(false)
                      }}
                      className={`w-full text-right px-3 py-2.5 text-sm hover:bg-white/10 active:bg-white/15 transition-colors ${
                        r.id === role ? 'text-tile-soft bg-white/5' : 'text-white/80'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white active:bg-white/10 transition-colors"
          >
            <LogOut size={18} strokeWidth={2} />
            خروج
          </button>

          <p className="text-[11px] text-white/30 text-center mt-2">
            {user ? 'سوییچر نقش فقط برای پیش‌نمایش پنل‌های دیگر' : 'نمای دمو — تعویض نقش برای پیش‌نمایش پنل‌ها'}
          </p>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* ---------- هدر دسکتاپ ---------- */}
        <header className="hidden lg:flex h-16 border-b border-line bg-card items-center justify-between px-6 shrink-0">
          <div>
            <p className="text-sm text-muted">خوش آمدید،</p>
            <p className="font-semibold">{user?.fullName ?? info.personaName} — {info.personaSub}</p>
          </div>
          <button className="relative rounded-full p-2 hover:bg-canvas transition-colors">
            <Bell size={20} className="text-ink-soft" />
            <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-bad" />
          </button>
        </header>

        <NotificationPrompt />

        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ---------- نوار پایین موبایل ---------- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line pb-safe">
        <div className="flex items-stretch">
          {tabItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${role}`}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors active:scale-95 ${
                  isActive ? 'text-tile' : 'text-muted'
                }`
              }
            >
              <item.icon size={20} strokeWidth={2} />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </NavLink>
          ))}
          {hasMore && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted active:scale-95 transition-colors"
            >
              <Menu size={20} strokeWidth={2} />
              <span>بیشتر</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
