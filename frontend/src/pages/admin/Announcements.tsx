import { Megaphone, Plus, Vote } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'

const announcements = [
  { id: '1', title: 'قطعی آب — چهارشنبه ۵ شهریور', body: 'به دلیل تعمیرات لوله‌کشی، از ساعت ۹ تا ۱۳ آب ساختمان قطع خواهد بود.', emergency: true, date: '۲ ساعت پیش' },
  { id: '2', title: 'شستشوی نمای ساختمان', body: 'تیم نظافت از روز شنبه کار شستشوی نما را آغاز می‌کند.', emergency: false, date: '۱ روز پیش' },
]

const poll = {
  title: 'رأی‌گیری تعویض دستگاه پارکینگ هوشمند',
  weightNote: 'وزن‌دهی رأی بر اساس متراژ واحد',
  options: [
    { label: 'موافقم', percent: 64 },
    { label: 'مخالفم', percent: 22 },
    { label: 'نظری ندارم', percent: 14 },
  ],
}

export function AdminAnnouncements() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">اعلانات و رأی‌گیری</h1>
          <p className="text-muted text-sm mt-1">تابلوی اعلانات دیجیتال و نظرسنجی‌های ساختمان</p>
        </div>
        <button className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={16} />
          اعلان جدید
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="اعلانات فعال" />
          <div className="px-5 pb-5 space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className={`p-4 rounded-xl border ${a.emergency ? 'border-bad/30 bg-bad-soft' : 'border-line'}`}>
                <div className="flex items-center gap-2">
                  {a.emergency && <Megaphone size={15} className="text-bad" />}
                  <p className="font-medium text-sm">{a.title}</p>
                </div>
                <p className="text-sm text-muted mt-1.5">{a.body}</p>
                <p className="text-xs text-muted/70 mt-2">{a.date}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="نظرسنجی جاری" action={<Vote size={16} className="text-tile" />} />
          <div className="px-5 pb-5">
            <p className="text-sm font-medium">{poll.title}</p>
            <p className="text-xs text-muted mt-1 mb-4">{poll.weightNote}</p>
            <div className="space-y-3">
              {poll.options.map((o) => (
                <div key={o.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{o.label}</span>
                    <span className="text-muted">{o.percent}٪</span>
                  </div>
                  <div className="h-2 rounded-full bg-canvas overflow-hidden">
                    <div className="h-full bg-tile rounded-full" style={{ width: `${o.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
