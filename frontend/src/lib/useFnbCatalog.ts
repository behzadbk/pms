import { useCallback, useEffect, useState } from 'react'
import { DEMO_DATA } from './demoMode'
import { fnbVenues } from './mockData'
import { useStore } from './store'
import { getCatalog, listMyOrders, listStaffOrders } from './api/fnb'
import type { FnbOrder, FnbVenue, MenuItem } from './types'

const POLL_MS = 60_000

/**
 * رستوران/کافی‌شاپ و منوی آن‌ها.
 * حالت عادی: از سرور (fnb-svc) خوانده می‌شود تا هرچه مسئول رستوران/کافی‌شاپ ثبت می‌کند
 * در دستگاه ساکن هم دیده شود. حالت دمو (VITE_DEMO_DATA): همان استور محلی.
 */
export function useFnbCatalog(): {
  venues: FnbVenue[]
  menu: MenuItem[]
  loading: boolean
  error: string
  reload: () => Promise<void>
} {
  const store = useStore()
  const [remote, setRemote] = useState<{ venues: FnbVenue[]; menu: MenuItem[] } | null>(null)
  const [loading, setLoading] = useState(!DEMO_DATA)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (DEMO_DATA) return
    try {
      setRemote(await getCatalog())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت منو')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (DEMO_DATA) return
    void reload()
    const t = setInterval(() => void reload(), POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  if (DEMO_DATA) return { venues: fnbVenues, menu: store.menu, loading: false, error: '', reload }
  return { venues: remote?.venues ?? [], menu: remote?.menu ?? [], loading, error, reload }
}

const ORDERS_POLL_MS = 8_000

/**
 * سفارش‌ها از سرور: scope='mine' برای ساکن/کودک، scope='staff' برای صف آشپزخانه/کافی‌شاپ (با فیلتر venueId).
 * هر ۸ ثانیه تازه می‌شود تا تغییر وضعیت آشپزخانه سریع دیده شود. حالت دمو: استور محلی.
 */
export function useFnbOrders(scope: 'mine' | 'staff', venueId?: string): {
  orders: FnbOrder[]
  loading: boolean
  error: string
  reload: () => Promise<void>
} {
  const store = useStore()
  const [orders, setOrders] = useState<FnbOrder[]>([])
  const [loading, setLoading] = useState(!DEMO_DATA)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (DEMO_DATA) return
    try {
      setOrders(scope === 'mine' ? await listMyOrders() : await listStaffOrders(venueId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت سفارش‌ها')
    } finally {
      setLoading(false)
    }
  }, [scope, venueId])

  useEffect(() => {
    if (DEMO_DATA) return
    void reload()
    const t = setInterval(() => void reload(), ORDERS_POLL_MS)
    return () => clearInterval(t)
  }, [reload])

  if (DEMO_DATA) return { orders: venueId ? store.orders.filter((o) => o.venueId === venueId) : store.orders, loading: false, error: '', reload }
  return { orders, loading, error, reload }
}
