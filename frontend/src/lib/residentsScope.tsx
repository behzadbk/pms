import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { setBuildingScope } from './api/residents'

/**
 * مسیرهای صفحه‌های «ساکنین». همان صفحه‌ها هم برای مدیر ساختمان (/admin/…) و هم برای سوپرادمین
 * (/super-admin/residents/:buildingId/…) استفاده می‌شوند؛ این Context پیشوند مسیر و ساختمان فعال را می‌دهد.
 */
export interface ResidentsScope {
  superAdmin: boolean
  buildingId: string
  list: string
  newResident: string
  requests: string
  unit: (id: string) => string
  edit: (id: string) => string
  moveOut: (id: string) => string
}

const adminScope = (buildingId: string): ResidentsScope => ({
  superAdmin: false,
  buildingId,
  list: '/admin/residents',
  newResident: '/admin/residents/new',
  requests: '/admin/residents/requests',
  unit: (id) => `/admin/units/${id}`,
  edit: (id) => `/admin/units/${id}/edit`,
  moveOut: (id) => `/admin/units/${id}/move-out`,
})

const saScope = (b: string): ResidentsScope => {
  const base = `/super-admin/residents/${b}`
  return {
    superAdmin: true,
    buildingId: b,
    list: base,
    newResident: `${base}/new`,
    requests: `${base}/requests`,
    unit: (id) => `${base}/units/${id}`,
    edit: (id) => `${base}/units/${id}/edit`,
    moveOut: (id) => `${base}/units/${id}/move-out`,
  }
}

const Ctx = createContext<ResidentsScope | null>(null)

export function useResidentsScope(): ResidentsScope {
  const c = useContext(Ctx)
  const { user } = useAuth()
  return c ?? adminScope(user?.tenantId ?? '')
}

/** شناسه‌ی واحد در هر دو خانواده‌ی مسیر: /admin/units/:id یا …/units/:unitId */
export function useUnitParam() {
  const p = useParams()
  const sc = useContext(Ctx)
  return sc?.superAdmin ? (p.unitId ?? '') : (p.id ?? '')
}

/**
 * لایه‌ی مسیر سوپرادمین: ساختمان را همزمان با رندر در لایه‌ی API ثبت می‌کند تا درخواست‌های
 * «واحد/ساکن» خودکار ?building_id= بگیرند (افکت‌های فرزندان قبل از افکت والد اجرا می‌شوند).
 */
export function SuperAdminBuildingScope({ children }: { children?: ReactNode }) {
  const { id = '' } = useParams()
  setBuildingScope(id)
  useEffect(() => () => setBuildingScope(null), [])
  return <Ctx.Provider value={saScope(id)}>{children ?? <Outlet />}</Ctx.Provider>
}
