import type { ReactElement } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RoleProvider, useRole } from './context/RoleContext'
import { ThemeProvider } from './context/ThemeContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Onboarding, ONBOARDING_SEEN_KEY } from './pages/Onboarding'
import { Settings } from './pages/shared/Settings'
import { MoreScreen } from './components/Layout'
import { PermissionsProvider, usePermissions } from './context/PermissionsContext'
import type { AppModule } from './lib/api/residents'
import { AdminResidents } from './pages/admin/residents/Residents'
import { SuperAdminBuildingScope } from './lib/residentsScope'
import { AdminResidentForm } from './pages/admin/residents/ResidentForm'
import { AdminUnitFile } from './pages/admin/residents/UnitFile'
import { AdminJoinRequests } from './pages/admin/residents/JoinRequests'
import { AdminMoveOut } from './pages/admin/residents/MoveOut'
import { SuperAdminResidents, SuperAdminBuildingResidents, SuperAdminUserFile } from './pages/superadmin/Residents'
import { ResidentHousehold } from './pages/resident/household/Household'
import { ResidentHouseholdAdd } from './pages/resident/household/AddMember'
import { ResidentParentControl } from './pages/resident/household/ParentControl'
import { ResidentChildLogin, ResidentChildRequests } from './pages/resident/household/ChildAccess'
import { ResidentBook } from './pages/resident/Book'
import { ChildHome, ChildWaiting, ChildQuiet, ChildBook } from './pages/child/ChildApp'
import { LobbyJoin, AcceptInvite } from './pages/public/Join'

import { AdminDashboard } from './pages/admin/Dashboard'
import { AdminFinance } from './pages/admin/Finance'
import { AdminTickets } from './pages/admin/Tickets'
import { AdminAnnouncements } from './pages/admin/Announcements'
import { AmenityManager } from './pages/admin/AmenityManager'
import { DebtorLock } from './components/DebtorLock'
import { AdminRules } from './pages/admin/Rules'
import { AdminAuditLog } from './pages/admin/AuditLog'
import { AnnouncementsFeed } from './pages/shared/AnnouncementsFeed'
import { AccountantDashboard } from './pages/accountant/Dashboard'
import { AccountantCharges } from './pages/accountant/Charges'
import { AccountantInvoices } from './pages/accountant/Invoices'

import { ResidentDashboard } from './pages/resident/Dashboard'
import { ResidentCharges } from './pages/resident/Charges'
import { ResidentFinance } from './pages/resident/Finance'
import { ResidentGuestPass } from './pages/resident/GuestPass'
import { ResidentTickets } from './pages/resident/Tickets'
import { ResidentFoodOrder } from './pages/resident/FoodOrder'
import { ResidentOffers } from './pages/resident/Offers'
import { AdminEntitlements } from './pages/admin/Entitlements'

import { GuardDashboard } from './pages/guard/Dashboard'
import { GuardGuestCheck } from './pages/guard/GuestCheck'
import { GuardParcels } from './pages/guard/Parcels'
import { GuardTraffic } from './pages/guard/Traffic'

import { StaffWorkOrders } from './pages/staff/WorkOrders'
import { StaffSchedule } from './pages/staff/Schedule'
import { StaffKitchenDisplay } from './pages/staff/KitchenDisplay'
import { StaffMenuManager } from './pages/staff/MenuManager'
import { StaffLobbyDesk, StaffSecurityDesk, StaffAmenityDesk, StaffHome, StaffNoAccess } from './pages/staff/Desks'
import { AdminStaff } from './pages/admin/Staff'
import { useHasPermission } from './lib/access'
import type { StaffPermission } from './lib/staff'

import { SuperAdminDashboard } from './pages/superadmin/Dashboard'
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

/** پنل‌های کارکنان: علاوه بر نقش staff، دسترسی همان بخش لازم است (مدیر ساختمان/پیش‌نمایش دمو: همه) */
function RequirePermission({ permission, children }: { permission: StaffPermission | null; children: ReactElement }) {
  const allowed = useHasPermission(permission)
  return <RequireRole role="staff">{allowed ? children : <StaffNoAccess />}</RequireRole>
}

/**
 * بخشی که در /me/permissions «پنهان» است فقط از منو حذف نمی‌شود: لینک مستقیمش هم به خانه برمی‌گردد.
 */
function RequireModule({ module, children }: { module: AppModule; children: ReactElement }) {
  const { visible, perms } = usePermissions()
  const { role } = useRole()
  if (perms && !visible(module)) return <Navigate to={`/${role}`} replace />
  // قوانین برج: واحد بدهکار — بخش دیده می‌شود ولی بسته است
  if (perms && perms.modules[module] === 'locked') return <DebtorLock debtor={perms.debtor} child={role === 'child'} />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/login" element={<Login />} />
      <Route path="/super-admin/login" element={<SuperAdminLogin />} />
      {/* عمومی: QR لابی، لینک دعوت پیامکی، اسکن QR خانواده با دوربین */}
      <Route path="/join/:token" element={<LobbyJoin />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/family-login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        {/* شخصی‌سازی ظاهر — برای هر نقش لاگین‌شده در دسترس است (طراحی Liquid Glass v4) */}
        <Route path="/settings" element={<Settings />} />
        <Route path="/more" element={<MoreScreen />} />

        <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        {/* شارژ و فاکتور به پنل حسابداری منتقل شد؛ مدیر فقط گزارش می‌بیند */}
        <Route path="/admin/charges" element={<Navigate to="/admin/finance?tab=charges" replace />} />
        <Route path="/admin/finance" element={<RequireRole role="admin"><AdminFinance /></RequireRole>} />
        <Route path="/admin/tickets" element={<RequireRole role="admin"><AdminTickets /></RequireRole>} />
        <Route path="/admin/announcements" element={<RequireRole role="admin"><AdminAnnouncements /></RequireRole>} />
        <Route path="/admin/reservations" element={<RequireRole role="admin"><AmenityManager /></RequireRole>} />
        <Route path="/admin/entitlements" element={<RequireRole role="admin"><AdminEntitlements /></RequireRole>} />
        <Route path="/admin/rules" element={<RequireRole role="admin"><AdminRules /></RequireRole>} />
        <Route path="/admin/amenity-rules" element={<Navigate to="/admin/reservations?tab=setup" replace />} />
        {/* ساکنین (RESIDENTS.md §3) — صفحه‌ی قدیمی «واحدها» با پرونده‌ی واحد جایگزین شد */}
        <Route path="/admin/units" element={<Navigate to="/admin/residents" replace />} />
        <Route path="/admin/residents" element={<RequireRole role="admin"><AdminResidents /></RequireRole>} />
        <Route path="/admin/residents/new" element={<RequireRole role="admin"><AdminResidentForm /></RequireRole>} />
        <Route path="/admin/residents/requests" element={<RequireRole role="admin"><AdminJoinRequests /></RequireRole>} />
        <Route path="/admin/units/:id" element={<RequireRole role="admin"><AdminUnitFile /></RequireRole>} />
        <Route path="/admin/units/:id/edit" element={<RequireRole role="admin"><AdminResidentForm /></RequireRole>} />
        <Route path="/admin/units/:id/move-out" element={<RequireRole role="admin"><AdminMoveOut /></RequireRole>} />
        <Route path="/admin/staff" element={<RequireRole role="admin"><AdminStaff /></RequireRole>} />
        <Route path="/admin/logs" element={<RequireRole role="admin"><AdminAuditLog /></RequireRole>} />

        <Route path="/resident" element={<RequireRole role="resident"><ResidentDashboard /></RequireRole>} />
        <Route path="/resident/charges" element={<RequireRole role="resident"><RequireModule module="finance"><ResidentCharges /></RequireModule></RequireRole>} />
        <Route path="/resident/finance" element={<RequireRole role="resident"><RequireModule module="finance"><ResidentFinance /></RequireModule></RequireRole>} />
        <Route path="/resident/guest" element={<RequireRole role="resident"><RequireModule module="guest"><ResidentGuestPass /></RequireModule></RequireRole>} />
        <Route path="/resident/reservations" element={<RequireRole role="resident"><RequireModule module="amenity"><ResidentBook /></RequireModule></RequireRole>} />
        <Route path="/resident/offers" element={<RequireRole role="resident"><RequireModule module="amenity"><ResidentOffers /></RequireModule></RequireRole>} />
        <Route path="/resident/tickets" element={<RequireRole role="resident"><RequireModule module="ticket"><ResidentTickets /></RequireModule></RequireRole>} />
        <Route path="/resident/food-order" element={<RequireRole role="resident"><RequireModule module="food"><ResidentFoodOrder /></RequireModule></RequireRole>} />
        <Route path="/resident/announcements" element={<RequireRole role="resident"><RequireModule module="notice"><AnnouncementsFeed /></RequireModule></RequireRole>} />
        {/* خانوار من، حالت والدین، ورود کودک، درخواست‌های کودک */}
        <Route path="/resident/family" element={<RequireRole role="resident"><RequireModule module="household"><ResidentHousehold /></RequireModule></RequireRole>} />
        <Route path="/resident/family/add" element={<RequireRole role="resident"><RequireModule module="household"><ResidentHouseholdAdd /></RequireModule></RequireRole>} />
        <Route path="/resident/family/requests" element={<RequireRole role="resident"><RequireModule module="household"><ResidentChildRequests /></RequireModule></RequireRole>} />
        <Route path="/resident/family/requests/:id" element={<RequireRole role="resident"><RequireModule module="household"><ResidentChildRequests /></RequireModule></RequireRole>} />
        <Route path="/resident/family/:id/parent" element={<RequireRole role="resident"><RequireModule module="household"><ResidentParentControl /></RequireModule></RequireRole>} />
        <Route path="/resident/family/:id/login" element={<RequireRole role="resident"><RequireModule module="household"><ResidentChildLogin /></RequireModule></RequireRole>} />

        {/* اپ کودک — دو تب؛ بخش پنهان نه تب دارد، نه کاشی، نه لینک */}
        <Route path="/child" element={<RequireRole role="child"><ChildHome /></RequireRole>} />
        <Route path="/child/announcements" element={<RequireRole role="child"><RequireModule module="notice"><AnnouncementsFeed /></RequireModule></RequireRole>} />
        <Route path="/child/book" element={<RequireRole role="child"><RequireModule module="amenity"><ChildBook /></RequireModule></RequireRole>} />
        <Route path="/child/waiting/:id" element={<RequireRole role="child"><ChildWaiting /></RequireRole>} />
        <Route path="/child/quiet" element={<RequireRole role="child"><ChildQuiet /></RequireRole>} />

        <Route path="/guard" element={<RequireRole role="guard"><GuardDashboard /></RequireRole>} />
        <Route path="/guard/guest-check" element={<RequireRole role="guard"><GuardGuestCheck /></RequireRole>} />
        <Route path="/guard/parcels" element={<RequireRole role="guard"><GuardParcels /></RequireRole>} />
        <Route path="/guard/traffic" element={<RequireRole role="guard"><GuardTraffic /></RequireRole>} />
        <Route path="/guard/announcements" element={<RequireRole role="guard"><AnnouncementsFeed /></RequireRole>} />

        <Route path="/staff" element={<RequireRole role="staff"><StaffHome /></RequireRole>} />
        <Route path="/staff/lobby" element={<RequirePermission permission="lobby"><StaffLobbyDesk /></RequirePermission>} />
        <Route path="/staff/amenity-desk" element={<RequirePermission permission="amenity_desk"><StaffAmenityDesk /></RequirePermission>} />
        {/* پیش‌تر صفحه‌ی جدا بود؛ اکنون تب «خدمات واحدها» در پنل مسئول مشاعات است */}
        <Route path="/staff/entitlements" element={<Navigate to="/staff/amenity-desk" replace />} />
        <Route path="/staff/kitchen" element={<RequirePermission permission="kitchen"><StaffKitchenDisplay venueId="v1" title="سفارش‌های رستوران" /></RequirePermission>} />
        <Route path="/staff/cafe" element={<RequirePermission permission="cafe"><StaffKitchenDisplay venueId="v2" title="سفارش‌های کافی‌شاپ" /></RequirePermission>} />
        <Route path="/staff/menu/restaurant" element={<RequirePermission permission="kitchen"><StaffMenuManager key="restaurant" venue="restaurant" /></RequirePermission>} />
        <Route path="/staff/menu/cafe" element={<RequirePermission permission="cafe"><StaffMenuManager key="cafe" venue="cafe" /></RequirePermission>} />
        <Route path="/staff/security" element={<RequirePermission permission="security"><StaffSecurityDesk /></RequirePermission>} />
        <Route path="/staff/work-orders" element={<RequirePermission permission="maintenance"><StaffWorkOrders /></RequirePermission>} />
        <Route path="/staff/schedule" element={<RequirePermission permission="maintenance"><StaffSchedule /></RequirePermission>} />
        <Route path="/staff/announcements" element={<RequireRole role="staff"><AnnouncementsFeed /></RequireRole>} />

        <Route path="/accountant" element={<RequireRole role="accountant"><AccountantDashboard /></RequireRole>} />
        <Route path="/accountant/charges" element={<RequireRole role="accountant"><AccountantCharges /></RequireRole>} />
        <Route path="/accountant/invoices" element={<RequireRole role="accountant"><AccountantInvoices /></RequireRole>} />
        <Route path="/accountant/announcements" element={<RequireRole role="accountant"><AnnouncementsFeed /></RequireRole>} />

        <Route path="/super-admin" element={<RequireSuperAdmin><SuperAdminDashboard /></RequireSuperAdmin>} />
        <Route path="/super-admin/buildings" element={<RequireSuperAdmin><SuperAdminBuildings /></RequireSuperAdmin>} />
        <Route path="/super-admin/residents" element={<RequireSuperAdmin><SuperAdminResidents /></RequireSuperAdmin>} />
        <Route path="/super-admin/residents/:id" element={<RequireSuperAdmin><SuperAdminBuildingScope /></RequireSuperAdmin>}>
          <Route index element={<SuperAdminBuildingResidents />} />
          <Route path="new" element={<AdminResidentForm />} />
          <Route path="requests" element={<AdminJoinRequests />} />
          <Route path="units/:unitId" element={<AdminUnitFile />} />
          <Route path="units/:unitId/edit" element={<AdminResidentForm />} />
          <Route path="units/:unitId/move-out" element={<AdminMoveOut />} />
        </Route>
        <Route path="/super-admin/users/:id" element={<RequireSuperAdmin><SuperAdminUserFile /></RequireSuperAdmin>} />
        <Route path="/super-admin/tenants" element={<Navigate to="/super-admin/buildings" replace />} />
        <Route path="/super-admin/plans" element={<RequireSuperAdmin><SuperAdminPlans /></RequireSuperAdmin>} />
        <Route path="/super-admin/billing" element={<RequireSuperAdmin><SuperAdminBilling /></RequireSuperAdmin>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RoleProvider>
          <PermissionsProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </PermissionsProvider>
        </RoleProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
