import { useState } from 'react'
import { AlertTriangle, ChevronLeft, History, Plus, Sparkles, Wrench, CalendarClock, User } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import {
  useStore,
  updateTicket,
  addAsset,
  addServiceRecord,
  matchAsset,
  assetCategoryInfo,
  serviceTypeLabel,
  faDate,
  faDateTime,
  daysBetween,
  type TicketRec,
  type AssetRec,
  type AssetCategory,
  type ServiceRecord,
} from '../../lib/store'
import { toman } from '../../lib/mockData'
import type { TicketStatus } from '../../lib/types'

const filters: { id: TicketStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'open', label: 'باز' },
  { id: 'in_progress', label: 'در حال انجام' },
  { id: 'resolved', label: 'حل‌شده' },
]

export function AdminTickets() {
  const { tickets, assets, services } = useStore()
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter)
  const current = tickets.find((t) => t.id === openId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تیکت‌ها و گزارش‌ها</h1>
        <p className="text-muted text-sm mt-1">روی هر تیکت بزنید تا جزئیات، سابقه‌ی تعمیرات همان تجهیز و آخرین سرویس را ببینید</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${
              filter === f.id ? 'bg-ink text-white border-ink' : 'border-line text-ink-text hover:border-ink-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`${list.length.toLocaleString('fa-IR')} تیکت`} />
        <div className="px-5 pb-5 space-y-3">
          {list.map((t) => {
            const { asset, category } = matchAsset(t, assets)
            const last = asset ? services.filter((s) => s.assetId === asset.id).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined
            return (
              <button
                key={t.id}
                onClick={() => setOpenId(t.id)}
                className="w-full text-right flex items-center justify-between gap-3 p-4 rounded-xl border border-line hover:border-tile hover:bg-tile-soft/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{t.subject}</p>
                    <StatusPill status={t.priority} />
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {t.unit} · {t.category} · {t.createdAt}
                  </p>
                  {(asset || category) && (
                    <p className="text-[11px] text-tile mt-1.5 flex items-center gap-1">
                      <Sparkles size={11} />
                      {asset ? asset.name : assetCategoryInfo[category!].label}
                      {last ? ` · آخرین ${serviceTypeLabel[last.type]}: ${faDate(last.date)}` : asset ? ' · سابقه‌ای ثبت نشده' : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={t.status} />
                  <ChevronLeft size={16} className="text-muted" />
                </div>
              </button>
            )
          })}
          {list.length === 0 && <p className="text-sm text-muted text-center py-6">تیکتی در این وضعیت وجود ندارد</p>}
        </div>
      </Card>

      {current && <TicketDetail ticket={current} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function TicketDetail({ ticket, onClose }: { ticket: TicketRec; onClose: () => void }) {
  const { assets, services, tickets } = useStore()
  const { asset, category, candidates } = matchAsset(ticket, assets)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [note, setNote] = useState('')

  const history = asset ? services.filter((s) => s.assetId === asset.id).sort((a, b) => b.date.localeCompare(a.date)) : []
  const last = history[0]
  const relatedTickets = asset
    ? tickets.filter((t) => t.id !== ticket.id && matchAsset(t, assets).asset?.id === asset.id)
    : []
  const overdue = asset?.serviceIntervalDays && last ? daysBetween(last.date) > asset.serviceIntervalDays : false

  function setStatus(status: TicketStatus) {
    const label = { open: 'باز', in_progress: 'در حال انجام', resolved: 'حل‌شده' }[status]
    updateTicket(ticket.id, { status }, `وضعیت به «${label}» تغییر کرد${note.trim() ? ` — ${note.trim()}` : ''}`)
    setNote('')
  }

  return (
    <Modal open size="xl" title={ticket.subject} onClose={onClose}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── محتوای تیکت ── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={ticket.status} />
            <StatusPill status={ticket.priority} />
            <span className="text-xs text-muted">{ticket.category}</span>
          </div>
          <div className="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1"><User size={12} /> {ticket.reporter} ({ticket.unit})</span>
            <span className="flex items-center gap-1"><CalendarClock size={12} /> {faDateTime(ticket.createdIso)}</span>
          </div>
          <div className="bg-canvas rounded-xl p-4 text-sm leading-7 whitespace-pre-line">{ticket.body || 'توضیحی ثبت نشده است.'}</div>

          <div>
            <p className="text-sm font-medium mb-2">روند پیگیری</p>
            <ol className="space-y-2 border-r-2 border-line pr-4">
              {ticket.timeline.map((e, i) => (
                <li key={i} className="text-xs">
                  <span className="text-muted">{faDateTime(e.at)}</span> — {e.text}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <TextField label="یادداشت (اختیاری، در روند پیگیری ثبت می‌شود)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {ticket.status !== 'in_progress' && <GhostButton onClick={() => setStatus('in_progress')}>شروع رسیدگی</GhostButton>}
              {ticket.status !== 'resolved' && <GhostButton onClick={() => setStatus('resolved')}>بستن تیکت (حل‌شده)</GhostButton>}
              {ticket.status === 'resolved' && <GhostButton onClick={() => setStatus('open')}>بازگشایی</GhostButton>}
              {category && (
                <PrimaryButton onClick={() => setServiceOpen(true)}>
                  <Wrench size={15} /> ثبت تعمیر / تعویض
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>

        {/* ── تشخیص هوشمند تجهیز + سابقه ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-tile/30 bg-tile-soft/40 p-4 space-y-3">
            <p className="text-xs font-medium text-tile flex items-center gap-1.5">
              <Sparkles size={14} /> تشخیص هوشمند تجهیز
            </p>
            {!category ? (
              <p className="text-xs text-muted">این تیکت به تجهیز خاصی مربوط نیست (مثلاً پیشنهاد یا انتقاد).</p>
            ) : (
              <>
                <p className="text-sm">
                  دسته: <b>{assetCategoryInfo[category].label}</b>
                </p>
                <SelectField
                  label="تجهیز مرتبط"
                  value={asset?.id ?? ''}
                  onChange={(e) => updateTicket(ticket.id, { assetId: e.target.value || undefined })}
                  options={[{ value: '', label: asset ? '— تشخیص خودکار —' : '— انتخاب کنید —' }, ...candidates.map((c) => ({ value: c.id, label: `${c.name} (${c.location})` }))]}
                />
                {asset && (
                  <div className="bg-card rounded-xl p-3 space-y-1">
                    <p className="text-xs text-muted">آخرین سرویس / تعویض</p>
                    {last ? (
                      <>
                        <p className="text-sm font-semibold">
                          {serviceTypeLabel[last.type]} — {faDate(last.date)}
                          <span className="text-xs text-muted font-normal"> ({daysBetween(last.date).toLocaleString('fa-IR')} روز پیش)</span>
                        </p>
                        <p className="text-xs text-muted">{last.description} · {last.performer}</p>
                        {overdue && (
                          <p className="text-xs text-bad flex items-center gap-1 pt-1">
                            <AlertTriangle size={12} /> از موعد سرویس دوره‌ای ({asset.serviceIntervalDays!.toLocaleString('fa-IR')} روزه) گذشته است
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-warn">برای این تجهیز هنوز سرویسی ثبت نشده. بعد از «ثبت تعمیر / تعویض»، دفعه‌ی بعد تاریخ آن اینجا نمایش داده می‌شود.</p>
                    )}
                  </div>
                )}
                {!asset && <NewAssetInline ticket={ticket} category={category} />}
              </>
            )}
          </div>

          {asset && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <History size={15} /> سابقه‌ی «{asset.name}»
              </p>
              {history.length === 0 && relatedTickets.length === 0 && <p className="text-xs text-muted">سابقه‌ای وجود ندارد.</p>}
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="text-xs p-3 rounded-xl border border-line">
                    <div className="flex justify-between">
                      <b>{serviceTypeLabel[h.type]}</b>
                      <span className="text-muted">{faDate(h.date)}</span>
                    </div>
                    <p className="text-muted mt-1">{h.description}</p>
                    <p className="text-muted/80 mt-0.5">
                      {h.performer}
                      {h.cost > 0 && ` · ${toman(h.cost)}`}
                    </p>
                  </div>
                ))}
                {relatedTickets.map((t) => (
                  <div key={t.id} className="text-xs p-3 rounded-xl border border-dashed border-line flex justify-between gap-2">
                    <span>گزارش قبلی: {t.subject}</span>
                    <StatusPill status={t.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {serviceOpen && category && (
        <ServiceDialog
          ticket={ticket}
          asset={asset}
          category={category}
          onClose={() => setServiceOpen(false)}
        />
      )}
    </Modal>
  )
}

/** اگر تجهیز دقیقاً در فهرست نبود، از روی همین تیکت تعریفش می‌کنیم تا سابقه از این به بعد جمع شود */
function NewAssetInline({ ticket, category }: { ticket: TicketRec; category: AssetCategory }) {
  const [name, setName] = useState(ticket.subject.replace(/(خراب است|خراب شده|خرابه|سوخته)/g, '').trim())
  const [location, setLocation] = useState('')
  return (
    <div className="space-y-2 border-t border-tile/20 pt-3">
      <p className="text-xs text-muted">تجهیز مشخصی پیدا نشد. تعریفش کنید تا سابقه‌ی سرویس آن از این به بعد نگه داشته شود:</p>
      <TextField label="نام تجهیز" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="محل" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثلاً راه‌پله طبقه ۵" />
      <button
        disabled={!name.trim()}
        onClick={() => {
          const id = addAsset({ name: name.trim(), category, location: location.trim() || '—' })
          updateTicket(ticket.id, { assetId: id }, `تجهیز «${name.trim()}» به تیکت متصل شد`)
        }}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-tile text-white rounded-lg py-2 disabled:opacity-40"
      >
        <Plus size={14} /> تعریف تجهیز و اتصال به تیکت
      </button>
    </div>
  )
}

function ServiceDialog({
  ticket,
  asset,
  category,
  onClose,
}: {
  ticket: TicketRec
  asset: AssetRec | null
  category: AssetCategory
  onClose: () => void
}) {
  const [form, setForm] = useState({
    type: (category === 'lighting' ? 'replace' : 'repair') as ServiceRecord['type'],
    date: new Date().toISOString().slice(0, 10),
    description: '',
    performer: '',
    cost: '',
    assetName: asset?.name ?? '',
    closeTicket: true,
  })
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))
  const valid = form.description.trim() && form.performer.trim() && (asset || form.assetName.trim())

  function submit() {
    if (!valid) return
    let assetId = asset?.id
    if (!assetId) {
      assetId = addAsset({ name: form.assetName.trim(), category, location: '—' })
      updateTicket(ticket.id, { assetId })
    }
    addServiceRecord({
      assetId,
      date: new Date(form.date).toISOString(),
      type: form.type,
      description: form.description.trim(),
      performer: form.performer.trim(),
      cost: Number(form.cost.replace(/[^\d]/g, '')) || 0,
      ticketId: ticket.id,
    })
    updateTicket(
      ticket.id,
      form.closeTicket ? { status: 'resolved' } : { status: 'in_progress' },
      `${serviceTypeLabel[form.type]} ثبت شد: ${form.description.trim()} (${form.performer.trim()})`,
    )
    onClose()
  }

  return (
    <Modal
      open
      title={`ثبت ${serviceTypeLabel[form.type]}${asset ? ` — ${asset.name}` : ''}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={!valid} onClick={submit}>ثبت در سابقه‌ی تجهیز</PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!asset && (
          <TextField className="sm:col-span-2" label="نام تجهیز (جدید)" value={form.assetName} onChange={(e) => set({ assetName: e.target.value })} />
        )}
        <SelectField
          label="نوع کار"
          value={form.type}
          onChange={(e) => set({ type: e.target.value as ServiceRecord['type'] })}
          options={(Object.keys(serviceTypeLabel) as ServiceRecord['type'][]).map((k) => ({ value: k, label: serviceTypeLabel[k] }))}
        />
        <TextField label="تاریخ انجام" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <TextArea className="sm:col-span-2" label="شرح کار" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="مثلاً تعویض لامپ LED ۱۸ وات" />
        <TextField label="انجام‌دهنده" value={form.performer} onChange={(e) => set({ performer: e.target.value })} placeholder="نام تکنسین یا شرکت" />
        <TextField label="هزینه (تومان)" inputMode="numeric" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />
        <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.closeTicket} onChange={(e) => set({ closeTicket: e.target.checked })} className="w-4 h-4 accent-[var(--color-tile)]" />
          تیکت پس از ثبت «حل‌شده» شود
        </label>
      </div>
    </Modal>
  )
}
