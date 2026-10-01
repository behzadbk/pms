import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Building2, ChevronDown, ChevronLeft, Lock, LogOut, Menu, Palette, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ROLE_SWITCHER_ENABLED, useRole, useRoleInfo } from '../context/RoleContext'
import { useAuth } from '../context/AuthContext'
import { navByRole, moduleForPath, splitTabs, type NavItem } from '../lib/nav'
import { usePermissions } from '../context/PermissionsContext'
import { residentsApi, errText } from '../lib/api/residents'
import { Sheet, Cta } from './hm'
import { departmentLabel } from '../lib/staff'
import { useStaffNav } from '../lib/access'
import { roles } from '../lib/mockData'
import type { Role } from '../lib/types'
import { NotificationPrompt } from './NotificationPrompt'
import { NotificationBell } from './NotificationBell'

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
  const staffNav = useStaffNav()
  // کارمند فقط پنل‌هایی را می‌بیند که دسترسی‌شان را دارد
  const { perms, visible } = usePermissions()
  // ساکن و کودک: بخش‌هایی که /me/permissions پنهان کرده از منو، تب و لینک حذف می‌شوند
  const nav = (role === 'staff' ? staffNav : navByRole[role]).filter((i) => visible((i as NavItem).module))
  const navigate = useNavigate()
  const location = useLocation()
  const [pinOpen, setPinOpen] = useState(false)
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

  // deep link به بخش پنهان → خانه (نه فقط غیرفعال)
  useEffect(() => {
    const m = moduleForPath(location.pathname, navByRole[role] ?? [])
    if (m && !visible(m)) navigate(nav[0].to, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, perms])

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
    // قفل خروج حالت والدین: خروج از حساب کودک رمز والد می‌خواهد
    if (user?.role === 'child' && perms?.exit_lock) {
      setPinOpen(true)
      return
    }
    doLogout()
  }

  function doLogout() {
    const wasSuperAdmin = user?.role === 'super_admin'
    logout()
    // سوپرادمین به صفحه‌ی ورود پنل پلتفرم برمی‌گردد، نه صفحه‌ی ورود ساکنین
    navigate(wasSuperAdmin ? '/super-admin/login' : '/login', { replace: true })
  }

  const { tabs: tabItems, more: moreItems } = splitTabs(nav)
  const hasMore = moreItems.length > 0
  const onOverflow =
    location.pathname === '/more' || location.pathname === '/settings' ||
    moreItems.some((i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/'))
  const isChild = role === 'child'

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------- هدر موبایل (فقط زیر lg) ---------- */}
      {/* pt-safe روی خود header و ارتفاع ثابت روی ردیف داخلی — قبلاً هر دو روی یک المان بودند و
          padding ناچ از داخل h-14 کم می‌شد، پس محتوای هدر زیر نوار وضعیت/ناچ می‌رفت. */}
      <header className="lg:hidden sticky top-0 z-30 bg-ink text-white pt-safe shrink-0">
       <div className="h-14 px-4 flex items-center justify-between gap-3">
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
          {isChild && (
            <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-white/15">
              <ShieldCheck size={13} /> حالت والدین
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg active:bg-white/10 transition-colors"
            aria-label="شخصی‌سازی"
          >
            <Sparkles size={19} />
          </button>
          <NotificationBell variant="dark" />
        </div>
       </div>
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
        {/* همان اصلاح هدر موبایل: pt-safe روی المان بیرونی، h-16 روی ردیف داخلی */}
        <div className="border-b border-white/10 pt-safe lg:pt-0 shrink-0">
        <div className="flex items-center justify-between gap-2.5 px-5 h-16">
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
              <p className="text-xs text-white/50 truncate">{user?.role === 'staff' ? departmentLabel(user.department) : info.label}</p>
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
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white active:bg-white/10 transition-colors"
          >
            <Sparkles size={18} strokeWidth={2} />
            شخصی‌سازی
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
            <p className="font-semibold">{user?.fullName ?? info.personaName} — {user?.role === 'staff' ? departmentLabel(user.department) : info.personaSub}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="w-9 h-9 rounded-full lg4-card flex items-center justify-center text-[var(--lg4-pri)]"
              aria-label="شخصی‌سازی"
            >
              <Sparkles size={17} />
            </button>
            <NotificationBell variant="light" />
          </div>
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

      {/* ---------- نوار تب شناور موبایل: حداکثر ۴ تب + «بیشتر»، لنز متحرک ---------- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-4 pb-safe pointer-events-none" aria-label="ناوبری اصلی">
        <div className="lg4-tabbar pointer-events-auto mb-2">
          {tabItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${role}`}
              className={({ isActive }) =>
                `relative flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-full text-[11px] transition-colors active:scale-95 ${
                  isActive && !onOverflow ? 'font-bold' : 'text-muted'
                }`
              }
              style={({ isActive }) => ({ color: isActive && !onOverflow ? 'var(--lg4-pri)' : undefined })}
            >
              {({ isActive }) => (
                <>
                  {isActive && !onOverflow && <TabLens />}
                  <item.icon size={20} strokeWidth={isActive && !onOverflow ? 2.4 : 2} className="relative" />
                  <span className="relative truncate max-w-[64px]">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          {hasMore && (
            <NavLink
              to="/more"
              className={`relative flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-full text-[11px] active:scale-95 transition-colors ${onOverflow ? 'font-bold' : 'text-muted'}`}
              style={{ color: onOverflow ? 'var(--lg4-pri)' : undefined }}
            >
              {onOverflow && <TabLens />}
              <Menu size={20} strokeWidth={onOverflow ? 2.4 : 2} className="relative" />
              <span className="relative">بیشتر</span>
            </NavLink>
          )}
        </div>
      </nav>

      <ExitLockSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onUnlocked={() => {
          setPinOpen(false)
          doLogout()
        }}
      />
    </div>
  )
}

/** لنز شیشه‌ای که با فنر بین تب‌ها جابه‌جا می‌شود */
function TabLens() {
  return (
    <motion.span
      layoutId="tab-lens"
      className="absolute inset-0 rounded-full"
      style={{ background: 'var(--lg4-lens)', boxShadow: 'var(--lg4-lens-shadow)' }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    />
  )
}

/** قفل خروج: رمز والد برای خروج از حساب کودک */
function ExitLockSheet({ open, onClose, onUnlocked }: { open: boolean; onClose: () => void; onUnlocked: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await residentsApi.exitUnlock(pin)
      setPin('')
      onUnlocked()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label="قفل خروج از حساب">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <span className="hm-avatar hm-tone-pri" style={{ width: 64, height: 64 }}>
          <Lock size={30} />
        </span>
        <p className="text-base font-bold">خروج از حساب با رمز والد</p>
        <p className="text-xs text-[var(--hm-t2)]">برای خروج یا حذف اپ، بابا یا مامان باید رمز را وارد کنند.</p>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          dir="ltr"
          aria-label="رمز والد"
          className="hm-card w-40 text-center text-2xl font-bold tracking-[8px] py-3 outline-none"
        />
        {err && <p className="text-xs font-bold text-[var(--hm-bad)]">{err}</p>}
        <Cta onClick={submit} busy={busy} disabled={pin.length < 4}>
          خروج
        </Cta>
      </div>
    </Sheet>
  )
}

/**
 * صفحه‌ی «بیشتر»: بخش‌های پنجم به بعدِ هر نقش (فهرست شیشه‌ای گروهی: آیکن + عنوان + زیرعنوان)
 * به‌علاوه‌ی «حساب و ظاهر». تا وقتی یکی از این بخش‌ها باز است، تب «بیشتر» روشن می‌ماند.
 */
export function MoreScreen() {
  const { role } = useRole()
  const staffNav = useStaffNav()
  const { visible } = usePermissions()
  const navigate = useNavigate()
  const nav = (role === 'staff' ? staffNav : navByRole[role]).filter((i) => visible((i as NavItem).module))
  const items: NavItem[] = [
    ...splitTabs(nav).more,
    { to: '/settings', label: 'حساب و ظاهر', icon: Palette, sub: 'حالت تیره، رنگ‌بندی، حالت آسان' },
  ]
  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <p className="text-xl font-bold">بیشتر</p>
      <div className="hm-card px-2 py-1 hm-divided">
        {items.map((m) => (
          <button key={m.to} onClick={() => navigate(m.to)} className="w-full flex items-center gap-3 px-2 py-3 text-right">
            <span className="hm-icon-tile">
              <m.icon size={22} />
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-sm font-bold">{m.label}</span>
              {m.sub && <span className="text-xs text-[var(--hm-t2)]">{m.sub}</span>}
            </span>
            <ChevronLeft size={20} className="text-[var(--hm-t3)]" />
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--hm-t2)] text-center">نوار پایین همیشه حداکثر ۵ دکمه دارد؛ بخش‌های جدید اینجا اضافه می‌شوند.</p>
    </div>
  )
}
