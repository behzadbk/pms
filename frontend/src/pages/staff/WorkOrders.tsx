import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { workOrders } from '../../lib/mockData'

export function StaffWorkOrders() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">کارهای نگهداری</h1>
        <p className="text-muted text-sm mt-1">فاکتورهای خرابی و کارهای واگذارشده به شما</p>
      </div>

      <Card>
        <CardHeader title="کارهای فعال" />
        <div className="px-5 pb-5 space-y-3">
          {workOrders.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-line">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{w.title}</p>
                  <StatusPill status={w.priority} />
                </div>
                <p className="text-xs text-muted mt-1">{w.asset} · مهلت: {w.dueDate}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={w.status} />
                {w.status !== 'done' && (
                  <button className="text-xs font-medium text-tile hover:underline whitespace-nowrap">
                    بروزرسانی وضعیت
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
