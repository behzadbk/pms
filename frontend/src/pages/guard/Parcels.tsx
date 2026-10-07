import { useCallback, useEffect, useState } from 'react'
import { ScanBarcode, BellRing, CheckCircle2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { ErrorBlock, Loading } from '../../components/hm'
import { guardApi, type Parcel, type UnitOption } from '../../lib/api/guard'
import { ago, errText, fa } from '../../lib/api/residents'
import { UnitPicker } from './shared'

export function GuardParcels() {
  const [parcels, setParcels] = useState<Parcel[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [unit, setUnit] = useState<UnitOption | null>(null)
  const [courier, setCourier] = useState('')
  const [trackingCode, setTrackingCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setParcels(await guardApi.parcels())
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت مرسولات ناموفق بود'))
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  async function register() {
    if (!unit) return
    setBusy(true)
    setFormErr('')
    try {
      const p = await guardApi.registerParcel({ unitId: unit.id, courierCompany: courier.trim() || undefined, trackingCode: trackingCode.trim() || undefined })
      setNotice(`برای ساکنین واحد ${fa(p.unit_number ?? unit.no)} اعلان فرستاده شد: «مرسوله‌ای برای شما در نگهبانی منتظر است»`)
      setUnit(null)
      setCourier('')
      setTrackingCode('')
      await load()
      setTimeout(() => setNotice(null), 5000)
    } catch (e) {
      setFormErr(errText(e, 'ثبت مرسوله ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  async function pickup(id: string) {
    try {
      await guardApi.confirmPickup(id)
      await load()
    } catch (e) {
      setFormErr(errText(e))
    }
  }

  if (error && !parcels) return <ErrorBlock message={error} retry={load} />
  if (!parcels) return <Loading />
  const shown = filter === 'pending' ? parcels.filter((p) => p.status === 'pending_pickup') : parcels

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">مرسولات پستی</h1>
      </div>

      <Card>
        <CardHeader title="ثبت مرسوله جدید" />
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UnitPicker value={unit} onChange={setUnit} placeholder="واحد مقصد (مثلاً ۱۲۰۴)" />
            <input value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={60} placeholder="شرکت پیک (مثلاً تیپاکس)" className="rounded-xl border border-line px-3.5 py-2.5 text-sm min-h-[46px] bg-card" />
            <label className="relative sm:col-span-2">
              <ScanBarcode size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                maxLength={60}
                placeholder="کد رهگیری / بارکد (اختیاری)"
                className="w-full rounded-xl border border-line pr-9 pl-3.5 py-2.5 text-sm font-mono min-h-[46px] bg-card"
                dir="ltr"
              />
            </label>
          </div>
          <button onClick={register} disabled={!unit || busy} className="w-full bg-tile text-white rounded-xl text-sm font-medium hover:opacity-90 py-3 min-h-[48px] disabled:opacity-50">
            {busy ? 'در حال ثبت…' : 'ثبت و اطلاع‌رسانی به ساکن'}
          </button>
          {formErr && <p className="text-sm text-bad">{formErr}</p>}
          {notice && (
            <div className="flex items-center gap-2.5 text-sm bg-tile-soft text-tile rounded-xl px-4 py-3">
              <BellRing size={16} className="shrink-0" />
              {notice}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="لیست مرسولات"
          action={
            <div className="flex gap-1 bg-canvas rounded-lg p-1">
              {([['pending', 'منتظر تحویل'], ['all', 'همه']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${filter === k ? 'bg-card shadow-sm' : 'text-muted'}`}>{l}</button>
              ))}
            </div>
          }
        />
        <div className="px-5 pb-5 space-y-3">
          {shown.length === 0 && <p className="text-sm text-muted text-center py-6">مرسوله‌ای نیست</p>}
          {shown.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                {p.status === 'picked_up' && <CheckCircle2 size={16} className="text-good shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">واحد {fa(p.unit_number ?? '—')}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {p.courier_company || 'بدون نام پیک'}{p.tracking_code ? ` · ${p.tracking_code}` : ''} · {ago(p.received_at)}
                  </p>
                </div>
              </div>
              {p.status === 'pending_pickup' ? (
                <button onClick={() => pickup(p.id)} className="text-xs font-medium text-white bg-good rounded-lg px-3 py-2 min-h-[40px]">تحویل به ساکن شد</button>
              ) : (
                <StatusPill status={p.status} />
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
