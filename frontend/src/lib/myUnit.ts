import { useEffect, useState } from 'react'
import { usePermissions } from '../context/PermissionsContext'
import { DEMO_DATA } from './demoMode'
import { unitCharges } from './api/finance'
import { myCharges as demoCharges } from './mockData'
import type { Charge } from './types'

const fa = (v: string | number) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/**
 * واحد واقعی ساکن واردشده (از /me/permissions). در حالت دمو همان «واحد ۱۲» نمونه.
 * label برای ثبت تیکت/سفارش استفاده می‌شود؛ اگر ساکن هنوز به واحدی وصل نیست null است.
 */
export function useMyUnit(): { label: string | null; no: string | null; floor: number | null } {
  const { perms } = usePermissions()
  if (DEMO_DATA) return { label: 'واحد ۱۲', no: '12', floor: 3 }
  const u = perms?.unit
  if (!u) return { label: null, no: null, floor: null }
  return { label: `واحد ${fa(u.no)}`, no: u.no, floor: u.floor }
}

/** شارژهای واحد ساکن: در حالت عادی از سرور (finance-service)، در حالت دمو داده‌ی نمونه */
export function useMyCharges(): { charges: Charge[]; loading: boolean; error: string } {
  const { perms } = usePermissions()
  const unitId = perms?.unit?.id ?? null
  const [state, setState] = useState<{ charges: Charge[]; loading: boolean; error: string }>({ charges: DEMO_DATA ? demoCharges : [], loading: !DEMO_DATA, error: '' })
  useEffect(() => {
    if (DEMO_DATA) return
    if (!unitId) {
      setState({ charges: [], loading: !perms, error: '' })
      return
    }
    let alive = true
    unitCharges(unitId)
      .then((charges) => alive && setState({ charges, loading: false, error: '' }))
      .catch((e) => alive && setState({ charges: [], loading: false, error: e instanceof Error ? e.message : 'خطا در دریافت شارژها' }))
    return () => {
      alive = false
    }
  }, [unitId, perms])
  return state
}
