import { useState } from 'react'
import { Check, PhoneCall, Plus, X } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { LiveCalendar } from '../../components/LiveCalendar'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { useStore, addReservation, decideReservation, faDateTime, type ReservationRec } from '../../lib/store'

const quickReasons = [
  'این بازه قبلاً برای برنامه‌ی ساختمان رزرو شده است',
  'سقف رزرو ماهانه‌ی واحد تکمیل شده است',
  'مشاع در این تاریخ در حال تعمیرات است',
  'بدهی شارژ معوق واحد تسویه نشده است',
]

type Filter = 'pending' | 'all' | 'manual'

export function AdminReservations() {
  const { amenities, reservations } = useStore()
  const [activeId, setActiveId] = useState(amenities[0]?.id ?? '')
  const [filter, setFilter] = useState<Filter>('pending')
  const [manualOpen, setManualOpen] = useState(false)
  const [rejecting, setRejecting] = useState<ReservationRec | null>(null)
  const [reason, setReason] = useState('')

  const amenity = amenities.find((a) => a.id === activeId) ?? amenities[0]
  const list = reservations.filter((r) =>
    filter === 'pending' ? r.status === 'pending' : filter === 'manual' ? r.source === 'manual' : true,
  )
  const pendingCount = reservations.filter((r) => r.status === 'pending').length

  function submitReject() {
    if (!rejecting || !reason.trim()) return
    decideReservation(rejecting.id, 'rejected', reason.trim())
    setRejecting(null)
    setReason('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">رزرو مشاعات</h1>
          <p className="text-muted text-sm mt-1">تقویم زنده همه فضاهای مشترک و مدیریت درخواست‌های در انتظار تایید</p>
        </div>
        <PrimaryButton onClick={() => setManualOpen(true)}>
          <PhoneCall size={16} />
          ثبت دستی رزرو
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
            {a.name}
          </button>
        ))}
      </div>

      {amenity && (
        <Card>
          <CardHeader title={`تقویم زنده «${amenity.name}»`} />
          <div className="px-5 pb-5">
            <LiveCalendar amenity={amenity} selectable={false} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="درخواست‌های رزرو"
          action={
            <div className="flex gap-1.5 bg-canvas rounded-xl p-1">
              {([
                ['pending', `در انتظار (${pendingCount.toLocaleString('fa-IR')})`],
                ['manual', 'ثبت دستی'],
                ['all', 'همه'],
              ] as [Filter, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === id ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <div className="px-5 pb-5 space-y-3">
          {list.length === 0 && <p className="text-sm text-muted text-center py-6">موردی وجود ندارد</p>}
          {list.map((r) => (
            <div key={r.id} className="p-4 rounded-xl border border-line">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-sm flex items-center gap-2">
                    {r.amenity}
                    {r.source === 'manual' && (
                      <span className="text-[11px] bg-brass-soft text-brass px-2 py-0.5 rounded-full flex items-center gap-1">
                        <PhoneCall size={11} /> ثبت دستی
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {r.unit} · {r.date} · {r.time}
                    {r.contactName && ` · ${r.contactName}`}
                    {r.contactPhone && ` · ${r.contactPhone}`}
                  </p>
                  {r.note && <p className="text-xs text-muted mt-1">یادداشت: {r.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={r.status} />
                  {r.status === 'pending' && (
                    <>
                      <button
                        onClick={() => decideReservation(r.id, 'confirmed')}
                        className="flex items-center gap-1 text-xs font-medium text-good bg-good-soft hover:opacity-80 px-3 py-1.5 rounded-lg"
                      >
                        <Check size={14} /> تایید
                      </button>
                      <button
                        onClick={() => {
                          setRejecting(r)
                          setReason('')
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-bad bg-bad-soft hover:opacity-80 px-3 py-1.5 rounded-lg"
                      >
                        <X size={14} /> عدم تایید
                      </button>
                    </>
                  )}
                </div>
              </div>
              {r.status === 'rejected' && r.rejectReason && (
                <p className="text-xs text-bad bg-bad-soft rounded-lg px-3 py-2 mt-3">
                  دلیل عدم تایید: {r.rejectReason}
                  <span className="text-bad/60"> — برای {r.unit} اعلان شد ({faDateTime(r.decidedAt)})</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <ManualReservationDialog open={manualOpen} onClose={() => setManualOpen(false)} defaultAmenityId={amenity?.id} />

      <Modal
        open={!!rejecting}
        title="عدم تایید رزرو"
        onClose={() => setRejecting(null)}
        footer={
          <>
            <GhostButton onClick={() => setRejecting(null)}>انصراف</GhostButton>
            <PrimaryButton className="!bg-bad" disabled={!reason.trim()} onClick={submitReject}>
              ثبت و ارسال برای ساکن
            </PrimaryButton>
          </>
        }
      >
        {rejecting && (
          <div className="space-y-4">
            <p className="text-sm bg-canvas rounded-xl p-3">
              {rejecting.amenity} · {rejecting.unit} · {rejecting.date} · {rejecting.time}
            </p>
            <div className="flex flex-wrap gap-2">
              {quickReasons.map((q) => (
                <button
                  key={q}
                  onClick={() => setReason(q)}
                  className={`text-xs px-3 py-1.5 rounded-full border ${reason === q ? 'border-bad text-bad bg-bad-soft' : 'border-line text-muted hover:border-ink-soft'}`}
                >
                  {q}
                </button>
              ))}
            </div>
            <TextArea label="دلیل عدم تایید (برای ساکن ارسال می‌شود)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل را بنویسید…" autoFocus />
          </div>
        )}
      </Modal>
    </div>
  )
}

function ManualReservationDialog({ open, onClose, defaultAmenityId }: { open: boolean; onClose: () => void; defaultAmenityId?: string }) {
  const { amenities } = useStore()
  const [form, setForm] = useState({
    amenityId: defaultAmenityId ?? amenities[0]?.id ?? '',
    unit: '',
    contactName: '',
    contactPhone: '',
    date: new Date().toISOString().slice(0, 10),
    from: '18:00',
    to: '20:00',
    note: '',
  })
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))
  const amenityId = form.amenityId || defaultAmenityId || amenities[0]?.id
  const valid = form.unit.trim() && form.date && form.from < form.to && amenityId

  function submit() {
    const a = amenities.find((x) => x.id === amenityId)
    if (!a || !valid) return
    addReservation({
      amenityId: a.id,
      amenity: a.name,
      unit: normalizeUnit(form.unit),
      date: new Date(form.date).toLocaleDateString('fa-IR'),
      time: `${toFa(form.from)} - ${toFa(form.to)}`,
      status: 'confirmed',
      source: 'manual',
      contactName: form.contactName.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      note: form.note.trim() || undefined,
    })
    onClose()
    set({ unit: '', contactName: '', contactPhone: '', note: '' })
  }

  return (
    <Modal
      open={open}
      title="ثبت دستی رزرو (هماهنگی تلفنی)"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={!valid} onClick={submit}>
            <Plus size={16} /> ثبت رزرو
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="مشاع" value={amenityId} onChange={(e) => set({ amenityId: e.target.value })} options={amenities.map((a) => ({ value: a.id, label: a.name }))} />
        <TextField label="واحد" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="مثلاً ۱۲" />
        <TextField label="نام تماس‌گیرنده" value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        <TextField label="شماره تماس" inputMode="tel" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="۰۹۱۲…" />
        <TextField label="تاریخ" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="از ساعت" type="time" value={form.from} onChange={(e) => set({ from: e.target.value })} />
          <TextField label="تا ساعت" type="time" value={form.to} onChange={(e) => set({ to: e.target.value })} />
        </div>
        <TextArea className="sm:col-span-2" label="یادداشت (اختیاری)" value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="مثلاً: جشن تولد، ۲۵ نفر مهمان" />
        <p className="sm:col-span-2 text-xs text-muted bg-canvas rounded-xl p-3">
          رزرو دستی مستقیم «تاییدشده» ثبت می‌شود و برای واحد مربوطه اعلان داخل برنامه ارسال می‌شود.
        </p>
      </div>
    </Modal>
  )
}

const toFa = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

function normalizeUnit(u: string) {
  const t = u.trim()
  return t.startsWith('واحد') ? t : `واحد ${toFa(t)}`
}
