import type { ReactElement } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RoleProvider, useRole } from './context/RoleContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Onboarding, ONBOARDING_SEEN_KEY } from './pages/Onboarding'

import { AdminDashboard } from './pages/admin/Dashboard'
import { AdminCharges } from './pages/admin/Charges'
import { AdminFinance } from './pages/admin/Finance'
import { AdminTickets } from './pages/admin/Tickets'
import { AdminAnnouncements } from './pages/admin/Announcements'
import { AdminReservations } from './pages/admin/Reservations'
import { AdminAmenityRules } from './pages/admin/AmenityRules'
import { AdminUnits } from './pages/admin/Units'
import { AdminAuditLog } from './pages/admin/AuditLog'

import { ResidentDashboard } from './pages/resident/Dashboard'
import { ResidentCharges } from './pages/resident/Charges'
import { ResidentFinance } from './pages/resident/Finance'
import { ResidentGuestPass } from './pages/resident/GuestPass'
import { ResidentReservations } from './pages/resident/Reservations'
import { ResidentTickets } from './pages/resident/Tickets'
import { ResidentFoodOrder } from './pages/resident/FoodOrder'

import { GuardDashboard } from './pages/guard/Dashboard'
import { GuardGuestCheck } from './pages/guard/GuestCheck'
import { GuardParcels } from './pages/guard/Parcels'
import { GuardTraffic } from './pages/guard/Traffic'

import { StaffWorkOrders } from './pages/staff/WorkOrders'
import { StaffSchedule } from './pages/staff/Schedule'
import { StaffKitchenDisplay } from './pages/staff/KitchenDisplay'

import { SuperAdminDashboard } from './pages/superadmin/Dashboard'
import { SuperAdminTenants } from './pages/superadmin/Tenants'
import { SuperAdminPlans } from './pages/superadmin/Plans'
import { SuperAdminBilling } from './pages/superadmin/Billing'
import { SuperAdminBuildings } from './pages/superadmin/Buildings'
import { SuperAdminLogin } from './pages/superadmin/Login'

function SessionLoading() {
  return <div className="min-h-screen flex items-center justify-center text-sm text-muted">در حال بررسی نشست…</div>
}

/**
 * فقط کاربر لاگین‌شده (accessToken معتبر) اجازه‌ی دیدن پنل‌های داخلی را دارد.
 * اگر مسیر درخواستی زیرمجموعه‌ی /super-admin باشد، کاربرِ لاگین‌نشده به صفحه‌ی
 * ورود سوپرادمین هدایت می‌شود، نه صفحه‌ی ورود ساکنین.
 *
 * کاربری که هنوز صفحات معرفی (Onboarding) را ندیده، پیش از صفحه‌ی ورود ساکنین
 * یک‌بار به /onboarding هدایت می‌شود (پرچم آن در localStorage ذخیره می‌شود).
 * مسیر سوپرادمین از این قانون مستثناست.
 */
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <SessionLoading />
  if (!user) {
    if (pathname.startsWith('/super-admin')) {
      return <Navigate to="/super-admin/login" replace />
    }
    const seenOnboarding = localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'
    if (!seenOnboarding) {
      return <Navigate to="/onboarding" replace />
    }
    return <Navigate to="/login" replace />
  }
  return children
}

/** علاوه بر لاگین، نقش کاربر هم باید super_admin باشد (مکمل RolesGuard سمت بک‌اند) */
function RequireSuperAdmin({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <SessionLoading />
  if (!user) return <Navigate to="/super-admin/login" replace />
  if (user.role !== 'super_admin') return <Navigate to="/" replace />
  return children
}

/** بعد از ورود، هر نقش به خانه‌ی خودش می‌رود (قبلاً ساکن/نگهبان/کارمند هم به /admin می‌رفتند) */
function HomeRedirect() {
  const { user } = useAuth()
  const { role } = useRole()
  if (user?.role === 'super_admin') return <Navigate to="/super-admin/buildings" replace />
  return <Navigate to={`/${role}`} replace />
}

/**
 * هر بخش پنل فقط برای نقش خودش — بدون این، یک ساکن با تایپ /admin در آدرس‌بار صفحات
 * مدیریت را می‌دید. (بک‌اند با RolesGuard جلوی داده را می‌گیرد؛ این برای UI است.)
 * نقش «مؤثر» از RoleContext خوانده می‌شود تا سوییچر دموی نقش در حالت توسعه کار کند.
 */
function RequireRole({ role: section, children }: { role: string; children: ReactElement }) {
  const { user } = useAuth()
  const { role } = useRole()
  if (user?.role === 'super_admin') return <Navigate to="/super-admin/buildings" replace />
  if (role !== section) return <Navigate to={`/${role}`} replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/login" element={<Login />} />
      <Route path="/super-admin/login" element={<SuperAdminLogin />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="/admin/charges" element={<RequireRole role="admin"><AdminCharges /></RequireRole>} />
        <Route path="/admin/finance" element={<RequireRole role="admin"><AdminFinance /></RequireRole>} />
        <Route path="/admin/tickets" element={<RequireRole role="admin"><AdminTickets /></RequireRole>} />
        <Route path="/admin/announcements" element={<RequireRole role="admin"><AdminAnnouncements /></RequireRole>} />
        <Route path="/admin/reservations" element={<RequireRole role="admin"><AdminReservations /></RequireRole>} />
        <Route path="/admin/amenity-rules" element={<RequireRole role="admin"><AdminAmenityRules /></RequireRole>} />
        <Route path="/admin/units" element={<RequireRole role="admin"><AdminUnits /></RequireRole>} />
        <Route path="/admin/logs" element={<RequireRole role="admin"><AdminAuditLog /></RequireRole>} />

        <Route path="/resident" element={<RequireRole role="resident"><ResidentDashboard /></RequireRole>} />
        <Route path="/resident/charges" element={<RequireRole role="resident"><ResidentCharges /></RequireRole>} />
        <Route path="/resident/finance" element={<RequireRole role="resident"><ResidentFinance /></RequireRole>} />
        <Route path="/resident/guest" element={<RequireRole role="resident"><ResidentGuestPass /></RequireRole>} />
        <Route path="/resident/reservations" element={<RequireRole role="resident"><ResidentReservations /></RequireRole>} />
        <Route path="/resident/tickets" element={<RequireRole role="resident"><ResidentTickets /></RequireRole>} />
        <Route path="/resident/food-order" element={<RequireRole role="resident"><ResidentFoodOrder /></RequireRole>} />

        <Route path="/guard" element={<RequireRole role="guard"><GuardDashboard /></RequireRole>} />
        <Route path="/guard/guest-check" element={<RequireRole role="guard"><GuardGuestCheck /></RequireRole>} />
        <Route path="/guard/parcels" element={<RequireRole role="guard"><GuardParcels /></RequireRole>} />
        <Route path="/guard/traffic" element={<RequireRole role="guard"><GuardTraffic /></RequireRole>} />

        <Route path="/staff" element={<RequireRole role="staff"><StaffWorkOrders /></RequireRole>} />
        <Route path="/staff/schedule" element={<RequireRole role="staff"><StaffSchedule /></RequireRole>} />
        <Route path="/staff/kitchen" element={<RequireRole role="staff"><StaffKitchenDisplay /></RequireRole>} />

        <Route path="/super-admin" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
        <Route path="/super-admin/buildings" element={<RequireSuperAdmin><SuperAdminBuildings /></RequireSuperAdmin>} />
        <Route path="/super-admin/tenants" element={<RequireSuperAdmin><SuperAdminTenants /></RequireSuperAdmin>} />
        <Route path="/super-admin/plans" element={<RequireSuperAdmin><SuperAdminPlans /></RequireSuperAdmin>} />
        <Route path="/super-admin/billing" element={<RequireSuperAdmin><SuperAdminBilling /></RequireSuperAdmin>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </RoleProvider>
    </AuthProvider>
  )
}
