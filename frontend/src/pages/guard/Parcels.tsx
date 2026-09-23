import { useState } from 'react'
import { ScanBarcode, BellRing, CheckCircle2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { parcels as initial } from '../../lib/mockData'
import type { Parcel } from '../../lib/types'

export function GuardParcels() {
  const [parcels, setParcels] = useState<Parcel[]>(initial)
  const [unit, setUnit] = useState('')
  const [courier, setCourier] = useState('')
  const [trackingCode, setTrackingCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  function scanBarcode() {
    // شبیه‌سازی اسکن بارکد مرسوله با دوربین تبلت نگهبانی
    const fake = 'TP' + Math.floor(100000 + Math.random() * 900000)
    setTrackingCode(fake)
  }

  function register() {
    if (!unit.trim()) return
    setParcels((prev) => [
      { id: String(prev.length + 1), unit, courier: courier || 'نامشخص', receivedAt: 'اکنون', status: 'pending_pickup' },
      ...prev,
    ])
    setNotice(`Push Notification برای ${unit} ارسال شد: «یک مرسوله جدید در نگهبانی منتظر شماست»`)
    setUnit('')
    setCourier('')
    setTrackingCode('')
    setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">مرسولات پستی</h1>
        <p className="text-muted text-sm mt-1">ثبت مرسوله فقط با اسکن بارکد و اعلان خودکار به ساکن</p>
      </div>

      <Card>
        <CardHeader title="ثبت مرسوله جدید" />
        <div className="px-5 pb-5 space-y-4">
          <button
            onClick={scanBarcode}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-line rounded-xl py-8 text-muted hover:border-tile hover:text-tile transition-colors"
          >
            <ScanBarcode size={24} />
            <span className="text-sm">{trackingCode ? `بارکد اسکن شد: ${trackingCode}` : 'برای اسکن بارکد مرسوله ضربه بزنید'}</span>
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="واحد (مثلاً واحد ۹)" className="rounded-xl border border-line px-3.5 py-2.5 text-sm" />
            <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="شرکت پیک" className="rounded-xl border border-line px-3.5 py-2.5 text-sm" />
            <button onClick={register} className="bg-tile text-white rounded-xl text-sm font-medium hover:opacity-90">
              ثبت و اطلاع‌رسانی به ساکن
            </button>
          </div>
          {notice && (
            <div className="flex items-center gap-2.5 text-sm bg-tile-soft text-tile rounded-xl px-4 py-3">
              <BellRing size={16} />
              {notice}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="لیست مرسولات" />
        <div className="px-5 pb-5 space-y-3">
          {parcels.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
              <div className="flex items-center gap-3">
                {p.status === 'picked_up' && <CheckCircle2 size={16} className="text-good" />}
                <div>
                  <p className="text-sm font-medium">{p.unit}</p>
                  <p className="text-xs text-muted mt-0.5">{p.courier} · {p.receivedAt}</p>
                </div>
              </div>
              <StatusPill status={p.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
