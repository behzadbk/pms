import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'

interface Log {
  id: string
  plate: string
  unit: string
  direction: 'in' | 'out'
  time: string
}

const initial: Log[] = [
  { id: '1', plate: '۱۲ ایران ۴۴۵ ب ۷۷', unit: 'واحد ۴', direction: 'in', time: '۰۸:۱۲' },
  { id: '2', plate: '۳۳ ایران ۹۰۱ الف ۲۲', unit: 'واحد ۱۵', direction: 'out', time: '۰۷:۵۰' },
]

export function GuardTraffic() {
  const [logs, setLogs] = useState<Log[]>(initial)
  const [plate, setPlate] = useState('')
  const [unit, setUnit] = useState('')

  function record(direction: 'in' | 'out') {
    if (!plate.trim()) return
    setLogs((prev) => [{ id: String(prev.length + 1), plate, unit: unit || '—', direction, time: 'اکنون' }, ...prev])
    setPlate('')
    setUnit('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تردد خودرو و پارکینگ</h1>
        <p className="text-muted text-sm mt-1">ثبت ورود و خروج خودروها</p>
      </div>

      <Card>
        <CardHeader title="ثبت تردد جدید" />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="شماره پلاک" className="rounded-xl border border-line px-3.5 py-2.5 text-sm sm:col-span-2" />
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="واحد (اختیاری)" className="rounded-xl border border-line px-3.5 py-2.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => record('in')} className="flex-1 flex items-center justify-center gap-1.5 bg-good text-white rounded-xl text-sm font-medium hover:opacity-90">
              <ArrowDownLeft size={15} /> ورود
            </button>
            <button onClick={() => record('out')} className="flex-1 flex items-center justify-center gap-1.5 bg-brass text-white rounded-xl text-sm font-medium hover:opacity-90">
              <ArrowUpRight size={15} /> خروج
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="گزارش تردد امروز" />
        <div className="px-5 pb-5 space-y-3">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
              <div className="flex items-center gap-3">
                {l.direction === 'in' ? (
                  <ArrowDownLeft size={16} className="text-good" />
                ) : (
                  <ArrowUpRight size={16} className="text-brass" />
                )}
                <div>
                  <p className="text-sm font-medium font-mono">{l.plate}</p>
                  <p className="text-xs text-muted mt-0.5">{l.unit}</p>
                </div>
              </div>
              <span className="text-xs text-muted">{l.time}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
