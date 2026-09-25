import { useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { GuardGuestCheck } from '../guard/GuestCheck'
import { GuardParcels } from '../guard/Parcels'
import { GuardTraffic } from '../guard/Traffic'
import { AdminReservations } from '../admin/Reservations'
import { useStaffNav } from '../../lib/access'

/** چند صفحه‌ی موجود را زیر یک پنل با تب کنار هم می‌گذارد (مثلاً میز لابی) */
function Tabbed({ title, subtitle, tabs }: { title: string; subtitle: string; tabs: { id: string; label: string; node: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-muted text-sm mt-1">{subtitle}</p>
      </div>
      <div className="flex gap-1.5 bg-card border border-line rounded-2xl p-1.5 w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap min-h-[44px] ${
              active === t.id ? 'bg-ink text-white' : 'text-muted hover:text-ink-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* عنوان صفحه‌ی داخلی تکراری است؛ با کلاس staff-embedded کوچک‌تر نمایش داده می‌شود */}
      <div className="staff-embedded">{tabs.find((t) => t.id === active)?.node}</div>
    </div>
  )
}

/** پنل لابی‌من — ورودی ساختمان: پذیرش مهمان و مرسولات */
export function StaffLobbyDesk() {
  return (
    <Tabbed
      title="میز لابی"
      subtitle="پذیرش مهمان با کد یا پلاک، ثبت و تحویل مرسوله"
      tabs={[
        { id: 'guest', label: 'مهمان', node: <GuardGuestCheck /> },
        { id: 'parcels', label: 'مرسولات', node: <GuardParcels /> },
      ]}
    />
  )
}

/** نگهبانی (برای کارمندی که بخش نگهبانی یا دسترسی نگهبانی دارد) */
export function StaffSecurityDesk() {
  return (
    <Tabbed
      title="نگهبانی"
      subtitle="کنترل مهمان، مرسولات و تردد خودرو"
      tabs={[
        { id: 'guest', label: 'مهمان', node: <GuardGuestCheck /> },
        { id: 'parcels', label: 'مرسولات', node: <GuardParcels /> },
        { id: 'traffic', label: 'تردد خودرو', node: <GuardTraffic /> },
      ]}
    />
  )
}

/** پنل مسئول مشاعات — مسئول اصلی تایید رزروها */
export function StaffAmenityDesk() {
  return <AdminReservations mode="desk" />
}

/** /staff → اولین پنلی که کارمند به آن دسترسی دارد */
export function StaffHome() {
  const first = useStaffNav().find((i) => i.permission !== null)
  if (first) return <Navigate to={first.to} replace />
  return <StaffNoAccess />
}

export function StaffNoAccess() {
  return (
    <Card>
      <div className="p-10 text-center space-y-3">
        <Lock size={28} className="mx-auto text-muted" />
        <p className="font-medium">به این بخش دسترسی ندارید</p>
        <p className="text-sm text-muted">برای باز شدن پنل، مدیر ساختمان باید از بخش «کارکنان» دسترسی لازم را به حساب شما بدهد.</p>
      </div>
    </Card>
  )
}
