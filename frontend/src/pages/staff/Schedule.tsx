import { Card } from '../../components/ui/Card'
import { AlertTriangle, Clock } from 'lucide-react'

const schedules = [
  { asset: 'آسانسور A', task: 'سرویس ماهانه', nextDue: '۱۴۰۴/۰۶/۰۵', daysLeft: 3, urgent: true },
  { asset: 'آسانسور B', task: 'سرویس ماهانه', nextDue: '۱۴۰۴/۰۶/۱۲', daysLeft: 10, urgent: false },
  { asset: 'موتورخانه مرکزی', task: 'بازرسی فصلی', nextDue: '۱۴۰۴/۰۶/۲۰', daysLeft: 18, urgent: false },
  { asset: 'سیستم اطفا حریق', task: 'بازدید سالانه کپسول‌ها', nextDue: '۱۴۰۴/۰۵/۲۹', daysLeft: -2, urgent: true },
]

export function StaffSchedule() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">برنامه سرویس دوره‌ای</h1>
        <p className="text-muted text-sm mt-1">یادآوری خودکار سرویس آسانسور، موتورخانه و آتش‌نشانی</p>
      </div>

      <Card>
        <div className="divide-y divide-line">
          {schedules.map((s) => (
            <div key={s.asset + s.task} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {s.urgent ? (
                  <AlertTriangle size={18} className="text-bad shrink-0" />
                ) : (
                  <Clock size={18} className="text-tile shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">{s.asset}</p>
                  <p className="text-xs text-muted mt-0.5">{s.task}</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{s.nextDue}</p>
                <p className={`text-xs mt-0.5 ${s.daysLeft < 0 ? 'text-bad' : s.daysLeft <= 5 ? 'text-warn' : 'text-muted'}`}>
                  {s.daysLeft < 0 ? `${Math.abs(s.daysLeft)} روز تأخیر` : `${s.daysLeft} روز مانده`}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
