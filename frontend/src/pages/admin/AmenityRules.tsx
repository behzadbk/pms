import { useState } from 'react'
import { SlidersHorizontal, Users } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { LiveCalendar } from '../../components/LiveCalendar'
import { amenitiesList, bookingRules, amenitySessions, toman } from '../../lib/mockData'

export function AdminAmenityRules() {
  const [activeId, setActiveId] = useState(amenitiesList[0].id)
  const amenity = amenitiesList.find((a) => a.id === activeId)!
  const rule = bookingRules[activeId]
  const sessions = amenitySessions.filter((s) => s.amenityId === activeId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">قوانین رزرو هوشمند مشاعات</h1>
        <p className="text-muted text-sm mt-1">برای هر مشاع، سقف رزرو، بازه پیش‌سفارش، بیعانه و سانس‌بندی را تعریف کنید</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title={`قوانین «${amenity.name}»`} action={<SlidersHorizontal size={16} className="text-tile" />} />
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="سقف رزرو هر واحد" value={`${rule.maxBookingsPerUnitPerPeriod} بار / ${periodLabel(rule.periodType)}`} />
            <Field label="حداقل فاصله تا رزرو" value={`${rule.minAdvanceHours} ساعت قبل`} />
            <Field label="حداکثر فاصله تا رزرو" value={`${rule.maxAdvanceDays} روز قبل`} />
            <Field label="طول هر بازه رزرو" value={`${rule.minSlotMinutes} تا ${rule.maxSlotMinutes} دقیقه`} />
            <Field label="مهلت کنسلی بدون جریمه" value={`تا ${rule.cancellationWindowHours} ساعت قبل`} />
            <Field
              label="بیعانه"
              value={rule.depositAmount > 0 ? toman(rule.depositAmount) : 'بدون بیعانه'}
            />
            <Field label="سیاست بازگشت بیعانه" value={refundPolicyLabel(rule.depositRefundPolicy)} className="sm:col-span-2" />
            <Field
              label="نیاز به تایید مدیر"
              value={amenity.requiresApproval ? 'بله — رزرو تا تایید مدیر «در انتظار» می‌ماند' : 'خیر — رزرو بلافاصله قطعی می‌شود'}
              className="sm:col-span-2"
            />
          </div>

          {sessions.length > 0 && (
            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={15} className="text-muted" />
                <p className="text-sm font-medium">سانس‌بندی هفتگی</p>
              </div>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-line text-sm">
                    <span>{dayLabel(s.dayOfWeek)} · {s.startTime} تا {s.endTime}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs bg-tile-soft text-tile px-2 py-0.5 rounded-full">
                        {sessionTypeLabel(s.sessionType)}
                      </span>
                      <span className="text-xs text-muted">ظرفیت {s.maxOccupancy} نفر</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="پیش‌نمایش تقویم" />
          <div className="px-5 pb-5">
            <LiveCalendar amenity={amenity} selectable={false} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`p-3.5 rounded-xl bg-canvas ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-medium mt-1">{value}</p>
    </div>
  )
}

function periodLabel(p: string) {
  return p === 'day' ? 'روز' : p === 'week' ? 'هفته' : 'ماه'
}
function dayLabel(d: number) {
  return ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'][d]
}
function sessionTypeLabel(t: string) {
  return { general: 'آزاد', male_only: 'مردانه', female_only: 'زنانه', family: 'خانوادگی' }[t] ?? t
}
function refundPolicyLabel(p: string) {
  return {
    full_if_cancelled_in_window: 'بازگشت کامل در صورت کنسلی در مهلت مجاز',
    partial_50: 'بازگشت ۵۰٪ در صورت کنسلی دیرهنگام',
    non_refundable: 'غیرقابل بازگشت',
  }[p] ?? p
}
