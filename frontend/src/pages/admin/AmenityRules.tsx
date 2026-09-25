import { useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { LiveCalendar } from '../../components/LiveCalendar'
import { Modal, TextField, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { toman } from '../../lib/mockData'
import { useStore, saveAmenity, deleteAmenity, defaultRule, uid } from '../../lib/store'
import type { Amenity, AmenitySession, BookingRule, SessionType, DepositRefundPolicy } from '../../lib/types'

const palette = ['#0E9594', '#C08A3E', '#1D9A6C', '#16324F', '#7A5C3E', '#4C6EF5', '#C4442E']

const amenityTypes: { value: Amenity['type']; label: string }[] = [
  { value: 'pool', label: 'استخر / سونا' },
  { value: 'hall', label: 'سالن اجتماعات / سینما' },
  { value: 'roof_garden', label: 'روف‌گاردن / فضای باز' },
  { value: 'gym', label: 'سالن ورزشی' },
]

export function AdminAmenityRules() {
  const { amenities, rules, sessions: allSessions } = useStore()
  const [activeId, setActiveId] = useState(amenities[0]?.id ?? '')
  const [editing, setEditing] = useState<{ amenity: Amenity; rule: BookingRule; sessions: AmenitySession[]; isNew: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const amenity = amenities.find((a) => a.id === activeId) ?? amenities[0]
  const rule = amenity ? rules[amenity.id] ?? defaultRule(amenity.id) : null
  const sessions = amenity ? allSessions.filter((s) => s.amenityId === amenity.id) : []

  function openNew() {
    const id = uid('am')
    setEditing({
      amenity: { id, name: '', type: 'hall', capacity: 10, requiresApproval: false, color: palette[amenities.length % palette.length] },
      rule: defaultRule(id),
      sessions: [],
      isNew: true,
    })
  }

  function openEdit() {
    if (!amenity || !rule) return
    setEditing({ amenity: { ...amenity }, rule: { ...rule }, sessions: sessions.map((s) => ({ ...s })), isNew: false })
  }

  function handleSave() {
    if (!editing || !editing.amenity.name.trim()) return
    saveAmenity(editing.amenity, editing.rule, editing.sessions)
    setActiveId(editing.amenity.id)
    setEditing(null)
  }

  function handleDelete() {
    if (!amenity) return
    deleteAmenity(amenity.id)
    setActiveId(amenities.find((a) => a.id !== amenity.id)?.id ?? '')
    setConfirmDelete(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">قوانین رزرو هوشمند مشاعات</h1>
          <p className="text-muted text-sm mt-1">برای هر مشاع، سقف رزرو، بازه پیش‌سفارش، بیعانه و سانس‌بندی را تعریف کنید</p>
        </div>
        <PrimaryButton onClick={openNew}>
          <Plus size={16} />
          مشاع جدید
        </PrimaryButton>
      </div>

      <div className="flex gap-2 flex-wrap">
        {amenities.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveId(a.id)}
            className={`px-4 py-2.5 rounded-xl text-sm border transition-colors ${
              amenity?.id === a.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'
            }`}
          >
            <span className="inline-block w-2 h-2 rounded-full ml-2 align-middle" style={{ background: a.color }} />
            {a.name}
          </button>
        ))}
      </div>

      {!amenity || !rule ? (
        <Card>
          <div className="p-10 text-center text-sm text-muted">هنوز مشاعی تعریف نشده — با دکمه «مشاع جدید» شروع کنید.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader
              title={`قوانین «${amenity.name}»`}
              action={
                <div className="flex items-center gap-1">
                  <button onClick={openEdit} className="flex items-center gap-1.5 text-xs font-medium text-tile hover:bg-tile-soft px-2.5 py-1.5 rounded-lg" aria-label="ویرایش قوانین">
                    <Pencil size={14} /> ویرایش
                  </button>
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs font-medium text-bad hover:bg-bad-soft px-2.5 py-1.5 rounded-lg" aria-label="حذف مشاع">
                    <Trash2 size={14} /> حذف
                  </button>
                </div>
              }
            />
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="نوع و ظرفیت" value={`${amenityTypes.find((t) => t.value === amenity.type)?.label ?? ''} · ${amenity.capacity} نفر`} />
              <Field label="سقف رزرو هر واحد" value={`${rule.maxBookingsPerUnitPerPeriod} بار / ${periodLabel(rule.periodType)}`} />
              <Field label="حداقل فاصله تا رزرو" value={`${rule.minAdvanceHours} ساعت قبل`} />
              <Field label="حداکثر فاصله تا رزرو" value={`${rule.maxAdvanceDays} روز قبل`} />
              <Field label="طول هر بازه رزرو" value={`${rule.minSlotMinutes} تا ${rule.maxSlotMinutes} دقیقه`} />
              <Field label="مهلت کنسلی بدون جریمه" value={`تا ${rule.cancellationWindowHours} ساعت قبل`} />
              <Field label="بیعانه" value={rule.depositAmount > 0 ? toman(rule.depositAmount) : 'بدون بیعانه'} />
              <Field label="سیاست بازگشت بیعانه" value={refundPolicyLabel(rule.depositRefundPolicy)} />
              <Field
                label="نیاز به تایید مدیر"
                value={amenity.requiresApproval ? 'بله — رزرو تا تایید مدیر «در انتظار» می‌ماند' : 'خیر — رزرو بلافاصله قطعی می‌شود'}
                className="sm:col-span-2"
              />
            </div>

            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={15} className="text-muted" />
                <p className="text-sm font-medium">سانس‌بندی هفتگی</p>
              </div>
              {sessions.length === 0 ? (
                <p className="text-xs text-muted bg-canvas rounded-xl p-3">سانس‌بندی تعریف نشده — همه ساعات برای همه آزاد است.</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-line text-sm">
                      <span>{dayLabel(s.dayOfWeek)} · {s.startTime} تا {s.endTime}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs bg-tile-soft text-tile px-2 py-0.5 rounded-full">{sessionTypeLabel(s.sessionType)}</span>
                        <span className="text-xs text-muted">ظرفیت {s.maxOccupancy} نفر</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="پیش‌نمایش تقویم" />
            <div className="px-5 pb-5">
              <LiveCalendar amenity={amenity} selectable={false} />
            </div>
          </Card>
        </div>
      )}

      {editing && (
        <AmenityEditor
          value={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <Modal
        open={confirmDelete}
        title="حذف مشاع"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <GhostButton onClick={() => setConfirmDelete(false)}>انصراف</GhostButton>
            <PrimaryButton className="!bg-bad" onClick={handleDelete}>حذف</PrimaryButton>
          </>
        }
      >
        <p className="text-sm">
          «{amenity?.name}» و همه‌ی قوانین و سانس‌های آن حذف شود؟ رزروهای ثبت‌شده‌ی قبلی در سابقه باقی می‌مانند.
        </p>
      </Modal>
    </div>
  )
}

type EditState = { amenity: Amenity; rule: BookingRule; sessions: AmenitySession[]; isNew: boolean }

function AmenityEditor({
  value,
  onChange,
  onClose,
  onSave,
}: {
  value: EditState
  onChange: (v: EditState) => void
  onClose: () => void
  onSave: () => void
}) {
  const { amenity, rule, sessions } = value
  const setA = (p: Partial<Amenity>) => onChange({ ...value, amenity: { ...amenity, ...p } })
  const setR = (p: Partial<BookingRule>) => onChange({ ...value, rule: { ...rule, ...p } })
  const setS = (id: string, p: Partial<AmenitySession>) =>
    onChange({ ...value, sessions: sessions.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d]/g, '')) || 0)

  const invalid =
    !amenity.name.trim() || rule.minSlotMinutes > rule.maxSlotMinutes || sessions.some((s) => s.startTime >= s.endTime)

  return (
    <Modal
      open
      size="xl"
      title={value.isNew ? 'تعریف مشاع جدید' : `ویرایش «${amenity.name}»`}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton onClick={onSave} disabled={invalid}>ذخیره قوانین</PrimaryButton>
        </>
      }
    >
      <div className="space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextField label="نام مشاع" value={amenity.name} onChange={(e) => setA({ name: e.target.value })} placeholder="مثلاً سینما" autoFocus />
          <SelectField label="نوع" value={amenity.type} onChange={(e) => setA({ type: e.target.value as Amenity['type'] })} options={amenityTypes} />
          <TextField label="ظرفیت (نفر)" inputMode="numeric" value={String(amenity.capacity)} onChange={(e) => setA({ capacity: num(e.target.value) })} />
          <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={amenity.requiresApproval} onChange={(e) => setA({ requiresApproval: e.target.checked })} className="w-4 h-4 accent-[var(--color-tile)]" />
              رزرو نیاز به تایید مدیر دارد
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted ml-1">رنگ در تقویم:</span>
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setA({ color: c })}
                  className={`w-6 h-6 rounded-full border-2 ${amenity.color === c ? 'border-ink' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={`رنگ ${c}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section>
          <p className="text-sm font-medium mb-3">قوانین رزرو</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <TextField label="سقف رزرو هر واحد" inputMode="numeric" value={String(rule.maxBookingsPerUnitPerPeriod)} onChange={(e) => setR({ maxBookingsPerUnitPerPeriod: num(e.target.value) })} />
            <SelectField
              label="در هر"
              value={rule.periodType}
              onChange={(e) => setR({ periodType: e.target.value as BookingRule['periodType'] })}
              options={[{ value: 'day', label: 'روز' }, { value: 'week', label: 'هفته' }, { value: 'month', label: 'ماه' }]}
            />
            <TextField label="حداقل ساعت قبل از رزرو" inputMode="numeric" value={String(rule.minAdvanceHours)} onChange={(e) => setR({ minAdvanceHours: num(e.target.value) })} />
            <TextField label="حداکثر روز قبل از رزرو" inputMode="numeric" value={String(rule.maxAdvanceDays)} onChange={(e) => setR({ maxAdvanceDays: num(e.target.value) })} />
            <TextField label="حداقل طول رزرو (دقیقه)" inputMode="numeric" value={String(rule.minSlotMinutes)} onChange={(e) => setR({ minSlotMinutes: num(e.target.value) })} />
            <TextField label="حداکثر طول رزرو (دقیقه)" inputMode="numeric" value={String(rule.maxSlotMinutes)} onChange={(e) => setR({ maxSlotMinutes: num(e.target.value) })} />
            <TextField label="مهلت کنسلی بدون جریمه (ساعت)" inputMode="numeric" value={String(rule.cancellationWindowHours)} onChange={(e) => setR({ cancellationWindowHours: num(e.target.value) })} />
            <TextField label="بیعانه (تومان)" inputMode="numeric" value={rule.depositAmount.toLocaleString('en-US')} onChange={(e) => setR({ depositAmount: num(e.target.value) })} hint="۰ = بدون بیعانه" />
            <SelectField
              className="col-span-2 sm:col-span-4"
              label="سیاست بازگشت بیعانه"
              value={rule.depositRefundPolicy}
              onChange={(e) => setR({ depositRefundPolicy: e.target.value as DepositRefundPolicy })}
              options={[
                { value: 'full_if_cancelled_in_window', label: refundPolicyLabel('full_if_cancelled_in_window') },
                { value: 'partial_50', label: refundPolicyLabel('partial_50') },
                { value: 'non_refundable', label: refundPolicyLabel('non_refundable') },
              ]}
            />
          </div>
          {rule.minSlotMinutes > rule.maxSlotMinutes && (
            <p className="text-xs text-bad mt-2">حداقل طول رزرو نمی‌تواند از حداکثر آن بیشتر باشد.</p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">سانس‌بندی هفتگی (اختیاری)</p>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  sessions: [
                    ...sessions,
                    { id: uid('s'), amenityId: amenity.id, dayOfWeek: 0, startTime: '09:00', endTime: '12:00', sessionType: 'general', maxOccupancy: amenity.capacity || 10 },
                  ],
                })
              }
              className="flex items-center gap-1.5 text-xs font-medium text-tile hover:underline"
            >
              <Plus size={14} /> افزودن سانس
            </button>
          </div>
          <div className="space-y-2">
            {sessions.length === 0 && <p className="text-xs text-muted bg-canvas rounded-xl p-3">بدون سانس — همه ساعات برای همه آزاد است.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-xl border border-line">
                <SelectField label="روز" value={String(s.dayOfWeek)} onChange={(e) => setS(s.id, { dayOfWeek: Number(e.target.value) })} options={days.map((d, i) => ({ value: String(i), label: d }))} />
                <TextField label="از ساعت" type="time" value={s.startTime} onChange={(e) => setS(s.id, { startTime: e.target.value })} />
                <TextField label="تا ساعت" type="time" value={s.endTime} onChange={(e) => setS(s.id, { endTime: e.target.value })} />
                <SelectField
                  label="نوع سانس"
                  value={s.sessionType}
                  onChange={(e) => setS(s.id, { sessionType: e.target.value as SessionType })}
                  options={(['general', 'male_only', 'female_only', 'family'] as SessionType[]).map((t) => ({ value: t, label: sessionTypeLabel(t) }))}
                />
                <TextField label="ظرفیت" inputMode="numeric" value={String(s.maxOccupancy)} onChange={(e) => setS(s.id, { maxOccupancy: num(e.target.value) })} />
                <button
                  type="button"
                  onClick={() => onChange({ ...value, sessions: sessions.filter((x) => x.id !== s.id) })}
                  className="p-2.5 rounded-xl text-bad hover:bg-bad-soft justify-self-start"
                  aria-label="حذف سانس"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
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

const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

function periodLabel(p: string) {
  return p === 'day' ? 'روز' : p === 'week' ? 'هفته' : 'ماه'
}
function dayLabel(d: number) {
  return days[d]
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
