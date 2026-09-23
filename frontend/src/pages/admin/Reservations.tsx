import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { LiveCalendar } from '../../components/LiveCalendar'
import { amenitiesList, reservations } from '../../lib/mockData'

export function AdminReservations() {
  const [activeId, setActiveId] = useState(amenitiesList[0].id)
  const amenity = amenitiesList.find((a) => a.id === activeId)!

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">رزرو مشاعات</h1>
        <p className="text-muted text-sm mt-1">تقویم زنده همه فضاهای مشترک و مدیریت درخواست‌های در انتظار تایید</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {amenitiesList.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveId(a.id)}
            className={`px-4 py-2.5 rounded-xl text-sm border transition-colors ${
              activeId === a.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`تقویم زنده «${amenity.name}»`} />
        <div className="px-5 pb-5">
          <LiveCalendar amenity={amenity} selectable={false} />
        </div>
      </Card>

      <Card>
        <CardHeader title="درخواست‌های رزرو" />
        <div className="px-5 pb-5 space-y-3">
          {reservations.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-line">
              <div>
                <p className="font-medium text-sm">{r.amenity}</p>
                <p className="text-xs text-muted mt-1">{r.unit} · {r.date} · {r.time}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                {r.status === 'pending' && (
                  <button className="text-xs font-medium text-tile hover:underline">تایید</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
