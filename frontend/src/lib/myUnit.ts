import { usePermissions } from '../context/PermissionsContext'
import { DEMO_DATA } from './demoMode'

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
