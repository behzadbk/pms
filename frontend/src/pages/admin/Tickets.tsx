import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Inbox, MapPin, Send, Sparkles, User, Wrench, History as HistoryIcon, Clock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import {
  maintenanceApi, CATEGORY_LABEL, KIND_LABEL, PRIORITY_LABEL, SERVICE_LABEL, STATUS_LABEL,
  type AssetCategory, type Priority, type ServiceType, type TeamMember, type Ticket, type TicketDetail, type TicketKind, type TicketStatus,
} from '../../lib/api/maintenance'
import { ago, errText, fa, toman } from '../../lib/api/residents'
import { parseDateInput } from '../../lib/jalali'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, Sheet, useLoad, useToast } from '../../components/hm'
import { CheckRow, DateField, Drawer, PRIORITY_TONE, STATUS_TONE, SelectField, TextAreaField, dateFa, whenFa } from '../shared/maintenanceUi'
import { WorkOrdersView } from '../staff/WorkOrders'
import { ScheduleView } from '../staff/Schedule'

type Tab = 'tickets' | 'orders' | 'schedule'
type StatusFilter = TicketStatus | 'active' | 'all'

const STATUS_FILTERS: [StatusFilter, string][] = [
  ['all', 'همه'],
  ['active', 'در جریان'],
  ['open', 'باز'],
  ['assigned', 'ارجاع‌شده'],
  ['in_progress', 'در حال انجام'],
  ['resolved', 'حل‌شده'],
  ['closed', 'بسته'],
]
const KIND_FILTERS: [TicketKind | 'all', string][] = [['all', 'همه‌ی انواع'], ['fault', 'خرابی'], ['criticism', 'انتقاد'], ['suggestion', 'پیشنهاد'], ['direct', 'پیام به مدیر']]

/** مرکز تیکت و نگهداری: تیکت‌ها (با تشخیص تجهیز و سابقه)، دستور کارها و سرویس دوره‌ای */
export function AdminTickets() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'tickets'
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'تیکت‌ها و نگهداری · همین'
  }, [])
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="مدیریت" title="تیکت‌ها و نگهداری" />
      <Seg<Tab>
        options={[['tickets', 'تیکت‌ها'], ['orders', 'دستور کارها'], ['schedule', 'سرویس دوره‌ای']]}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />
      {tab === 'tickets' && <TicketsTab toast={toast} />}
      {tab === 'orders' && <WorkOrdersView admin toast={toast} />}
      {tab === 'schedule' && <ScheduleView admin toast={toast} />}
      {toastNode}
    </div>
  )
}

function TicketsTab({ toast }: { toast: (m: string) => void }) {
  const [status, setStatus] = useState<StatusFilter>('active')
  const [kind, setKind] = useState<TicketKind | 'all'>('all')
  const { data, error, loading, reload } = useLoad<Ticket[]>(() => maintenanceApi.tickets({ status, kind }), [status, kind])
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && void reload(true), 30_000)
    return () => window.clearInterval(t)
  }, [reload])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {STATUS_FILTERS.map(([k, l]) => (
          <button key={k} className="hm-chip" data-on={status === k} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {KIND_FILTERS.map(([k, l]) => (
          <button key={k} className="hm-chip" data-on={kind === k} onClick={() => setKind(k)}>
            {l}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBlock message={error ?? ''} retry={() => void reload()} />
      ) : data.length === 0 ? (
        <EmptyState icon={Inbox} title="تیکتی در این وضعیت نیست" tone="mute" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((t) => (
            <button key={t.id} className="hm-card p-4 text-right flex flex-col gap-2 active:scale-[0.99] transition-transform" onClick={() => setOpenId(t.id)}>
              <div className="flex items-start gap-2">
                <p className="font-bold text-[15px] flex-1 min-w-0 leading-7">{t.subject}</p>
                <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {t.kind === 'fault' && <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>}
                <Badge tone="mute">{KIND_LABEL[t.kind]}</Badge>
                {t.sla_breached && (
                  <Badge tone="bad">
                    <AlertTriangle size={12} className="ml-1" /> فراتر از SLA
                  </Badge>
                )}
              </div>
              <p className="text-xs text-[var(--hm-t2)] leading-6">
                {t.unit ? `واحد ${fa(t.unit)}` : t.reporter_name} · {ago(t.created_at)}
                {t.location && ` · محل: ${t.location}`}
              </p>
              {(t.asset_name || t.asset_category) && (
                <p className="text-xs flex items-center gap-1 text-[var(--hm-pri)]">
                  <Sparkles size={12} />
                  {t.asset_name ?? CATEGORY_LABEL[t.asset_category as AssetCategory]}
                  {t.last_service ? ` · آخرین ${SERVICE_LABEL[t.last_service.type]}: ${dateFa(t.last_service.performed_on)}` : t.asset_name ? ' · سابقه‌ای ثبت نشده' : ''}
                </p>
              )}
              {t.assignee_name && (
                <p className="text-xs text-[var(--hm-t2)] flex items-center gap-1">
                  <User size={12} /> {t.assignee_name}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      <TicketDrawer id={openId} onClose={() => setOpenId(null)} toast={toast} onChanged={() => reload(true)} />
    </div>
  )
}

function TicketDrawer({ id, onClose, toast, onChanged }: { id: string | null; onClose: () => void; toast: (m: string) => void; onChanged: () => Promise<unknown> }) {
  const { data: t, error, reload } = useLoad<TicketDetail | null>(() => (id ? maintenanceApi.ticket(id) : Promise.resolve(null)), [id])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [serviceOpen, setServiceOpen] = useState(false)

  useEffect(() => {
    setText('')
    setInternal(false)
    setAssignee('')
    setDue('')
  }, [id])
  useEffect(() => {
    if (id) void maintenanceApi.team().then(setTeam).catch(() => undefined)
  }, [id])

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      setText('')
      await reload(true)
      await onChanged()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const m = t?.match
  const status = t?.status
  return (
    <Drawer open={!!id} onClose={onClose} title={t?.subject ?? 'تیکت'}>
      {error ? (
        <ErrorBlock message={error} />
      ) : !t ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ── محتوای تیکت ── */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
              <Badge tone="mute">{KIND_LABEL[t.kind]}</Badge>
              <span className="text-xs text-[var(--hm-t2)]">#{fa(t.no)}</span>
              {t.sla_due_at && t.status !== 'resolved' && t.status !== 'closed' && (
                <Badge tone={t.sla_breached ? 'bad' : 'mute'}>
                  <Clock size={12} className="ml-1" /> SLA {whenFa(t.sla_due_at)}
                </Badge>
              )}
            </div>
            <div className="text-xs text-[var(--hm-t2)] flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1"><User size={12} /> {t.reporter_name ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {whenFa(t.created_at)}</span>
            </div>
            {t.location && (
              <p className="text-sm rounded-2xl px-3 py-2 hm-tone-pri flex items-center gap-2">
                <MapPin size={15} className="shrink-0" /> محل: <b>{t.location}</b>
              </p>
            )}
            <p className="text-sm leading-7 rounded-2xl px-4 py-3 hm-tone-mute whitespace-pre-line">{t.body || 'توضیحی ثبت نشده است.'}</p>

            <div>
              <p className="text-sm font-bold mb-2">روند پیگیری</p>
              <ol className="flex flex-col gap-2.5 border-r-2 pr-4" style={{ borderColor: 'var(--hm-hair)' }}>
                {t.events.map((e) => (
                  <li key={e.id} className="text-xs leading-6">
                    <span className="text-[var(--hm-t2)]">
                      {whenFa(e.created_at)} {e.actor_name && `· ${e.actor_name}`}
                    </span>
                    <p className="text-sm">
                      {e.internal && <Badge tone="warn">یادداشت داخلی</Badge>} {e.text}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            {/* پاسخ / یادداشت */}
            <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--hm-hair)' }}>
              <div className="flex items-end gap-2">
                <label className="hm-card flex-1 px-3 py-2">
                  <span className="block text-xs text-[var(--hm-t2)]">{internal ? 'یادداشت داخلی (ساکن نمی‌بیند)' : 'پاسخ به ساکن'}</span>
                  <input className="hm-input mt-0.5" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="بنویسید…" />
                </label>
                <button className="hm-back" aria-label="ارسال" disabled={busy || !text.trim()} onClick={() => act(() => maintenanceApi.comment(t.id, text.trim(), internal), internal ? 'یادداشت ثبت شد' : 'پاسخ برای ساکن ارسال شد')}>
                  <Send size={18} />
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--hm-t2)] cursor-pointer w-fit">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[var(--hm-pri)]" /> فقط یادداشت داخلی
              </label>
            </div>

            {/* وضعیت */}
            <div className="flex flex-wrap gap-2">
              {status !== 'in_progress' && status !== 'resolved' && status !== 'closed' && (
                <button className="hm-chip" disabled={busy} onClick={() => act(() => maintenanceApi.setStatus(t.id, 'in_progress'), 'در حال انجام')}>
                  شروع رسیدگی
                </button>
              )}
              {status !== 'resolved' && status !== 'closed' && (
                <button className="hm-chip" disabled={busy} onClick={() => act(() => maintenanceApi.setStatus(t.id, 'resolved', text.trim() || undefined), 'حل‌شده ثبت شد')}>
                  حل‌شده
                </button>
              )}
              {status === 'resolved' && (
                <button className="hm-chip" disabled={busy} onClick={() => act(() => maintenanceApi.setStatus(t.id, 'closed'), 'تیکت بسته شد')}>
                  بستن
                </button>
              )}
              {(status === 'resolved' || status === 'closed') && (
                <button className="hm-chip" disabled={busy} onClick={() => act(() => maintenanceApi.setStatus(t.id, 'open'), 'تیکت دوباره باز شد')}>
                  بازگشایی
                </button>
              )}
              {m?.category && (
                <button className="hm-chip" data-on="true" onClick={() => setServiceOpen(true)}>
                  <Wrench size={13} className="inline ml-1" /> ثبت تعمیر / تعویض
                </button>
              )}
            </div>
          </div>

          {/* ── ارجاع + تشخیص هوشمند تجهیز ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {t.kind === 'fault' && (
              <section className="hm-card p-4 flex flex-col gap-3">
                <p className="text-sm font-bold">ارجاع به کارمند نگهداری</p>
                {t.assignee_name && <p className="text-sm">اکنون: <b>{t.assignee_name}</b>{t.work_order ? ` · ${t.work_order.status === 'done' ? 'انجام‌شده' : t.work_order.status === 'in_progress' ? 'در حال انجام' : 'در انتظار'}` : ''}</p>}
                <FieldCard>
                  <SelectField label="کارمند" value={assignee} onChange={setAssignee} options={[{ value: '', label: team.length ? '— انتخاب کنید —' : 'کارمند نگهداری تعریف نشده' }, ...team.map((x) => ({ value: x.id, label: `${x.name}${x.open_orders ? ` (${fa(x.open_orders)} کار باز)` : ''}` }))]} />
                  <DateField label="مهلت (اختیاری)" value={due} onChange={setDue} />
                </FieldCard>
                <div className="flex gap-2">
                  <button
                    className="lg4-capsule flex-1 min-h-[44px] text-sm font-bold disabled:opacity-50"
                    disabled={busy || !assignee || (!!due.trim() && !parseDateInput(due))}
                    onClick={() => act(() => maintenanceApi.assign(t.id, assignee, due.trim() ? parseDateInput(due) ?? undefined : undefined), 'ارجاع شد و به کارمند اعلان رفت')}
                  >
                    ارجاع
                  </button>
                  {t.assignee_name && (
                    <button className="hm-chip" disabled={busy} onClick={() => act(() => maintenanceApi.assign(t.id, null), 'ارجاع برداشته شد')}>
                      برداشتن
                    </button>
                  )}
                </div>
                <SelectField label="اولویت" value={t.priority} onChange={(v) => act(() => maintenanceApi.patchTicket(t.id, { priority: v as Priority }), 'اولویت تغییر کرد')} options={(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
              </section>
            )}

            <section className="rounded-3xl p-4 flex flex-col gap-3 hm-tone-pri" style={{ color: 'var(--hm-t1)' }}>
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--hm-pri)' }}>
                <Sparkles size={14} /> تشخیص هوشمند تجهیز
              </p>
              {!m?.category ? (
                <p className="text-xs text-[var(--hm-t2)]">این تیکت به تجهیز خاصی مربوط نیست (مثلاً پیشنهاد یا انتقاد).</p>
              ) : (
                <>
                  <p className="text-sm">دسته: <b>{m.category_label}</b></p>
                  <FieldCard>
                    <SelectField
                      label="تجهیز مرتبط"
                      value={m.asset?.id ?? ''}
                      onChange={(v) => act(() => maintenanceApi.patchTicket(t.id, { asset_id: v || null }), 'تجهیز متصل شد')}
                      options={[{ value: '', label: m.asset ? '— برداشتن اتصال —' : '— انتخاب کنید —' }, ...m.candidates.map((c) => ({ value: c.id, label: `${c.name}${c.location ? ` (${c.location})` : ''}` }))]}
                    />
                  </FieldCard>
                  {m.asset ? (
                    <div className="hm-card p-3 flex flex-col gap-1">
                      <p className="text-xs text-[var(--hm-t2)]">آخرین سرویس / تعویض</p>
                      {m.history[0] ? (
                        <>
                          <p className="text-sm font-bold">
                            {SERVICE_LABEL[m.history[0].type]} — {dateFa(m.history[0].performed_on)}
                          </p>
                          <p className="text-xs text-[var(--hm-t2)] leading-6">{m.history[0].description} · {m.history[0].performer}</p>
                          {m.overdue && (
                            <p className="text-xs flex items-center gap-1 pt-1 text-[var(--hm-bad)]">
                              <AlertTriangle size={12} /> از موعد سرویس دوره‌ای ({fa(m.service_interval_days ?? 0)} روزه) گذشته است
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-[var(--hm-warn)] leading-6">برای این تجهیز هنوز سرویسی ثبت نشده.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--hm-t2)] leading-6">تجهیز مشخصی پیدا نشد. با «ثبت تعمیر / تعویض» تجهیز جدید تعریف و به این تیکت متصل می‌شود.</p>
                  )}
                </>
              )}
            </section>

            {m?.asset && (m.history.length > 0 || m.related.length > 0) && (
              <section>
                <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
                  <HistoryIcon size={15} /> سابقه‌ی «{m.asset.name}»
                </p>
                <div className="flex flex-col gap-2">
                  {m.history.map((h) => (
                    <div key={h.id} className="hm-card p-3 text-xs">
                      <div className="flex justify-between gap-2">
                        <b>{SERVICE_LABEL[h.type]}</b>
                        <span className="text-[var(--hm-t2)]">{dateFa(h.performed_on)}</span>
                      </div>
                      <p className="text-[var(--hm-t2)] mt-1 leading-6">{h.description}</p>
                      <p className="text-[var(--hm-t3)] mt-0.5">
                        {h.performer}
                        {h.cost > 0 && ` · ${toman(h.cost)} تومان`}
                      </p>
                    </div>
                  ))}
                  {m.related.map((r) => (
                    <div key={r.id} className="hm-row-dashed text-xs justify-between">
                      <span>گزارش دیگر: {r.subject}</span>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <ServiceSheet
            open={serviceOpen}
            ticket={t}
            onClose={() => setServiceOpen(false)}
            onDone={async () => {
              setServiceOpen(false)
              toast('ثبت شد و ساکن مطلع شد')
              await reload(true)
              await onChanged()
            }}
          />
        </div>
      )}
    </Drawer>
  )
}

function ServiceSheet({ open, ticket, onClose, onDone }: { open: boolean; ticket: TicketDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const m = ticket.match
  const [type, setType] = useState<ServiceType>('repair')
  const [date, setDate] = useState('')
  const [desc, setDesc] = useState('')
  const [performer, setPerformer] = useState('')
  const [cost, setCost] = useState('')
  const [assetName, setAssetName] = useState('')
  const [resolve, setResolve] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setType(m?.category === 'lighting' ? 'replace' : 'repair')
    setDate('')
    setDesc('')
    setPerformer('')
    setCost('')
    setAssetName(ticket.subject.replace(/(خراب است|خراب شده|خرابه|سوخته)/g, '').trim())
    setResolve(true)
    setErr('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const needsAsset = !m?.asset
  async function go() {
    if (desc.trim().length < 2) return setErr('شرح کار را بنویسید')
    if (needsAsset && assetName.trim().length < 2) return setErr('نام تجهیز را بنویسید')
    const iso = date.trim() ? parseDateInput(date) : undefined
    if (date.trim() && !iso) return setErr('تاریخ نامعتبر است')
    setBusy(true)
    try {
      await maintenanceApi.ticketService(ticket.id, {
        type, description: desc.trim(), performer: performer.trim() || undefined, cost: Number(cost.replace(/[^\d]/g, '')) || 0,
        performed_on: iso ?? undefined, asset_id: m?.asset?.id, asset_name: needsAsset ? assetName.trim() : undefined, resolve,
      })
      await onDone()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label="ثبت تعمیر / تعویض">
      <p className="text-lg font-bold">ثبت {SERVICE_LABEL[type]}{m?.asset ? ` — ${m.asset.name}` : ''}</p>
      <div className="mt-3 flex flex-col gap-3">
        <FieldCard>
          {needsAsset && <Field label="نام تجهیز (جدید)" value={assetName} onChange={setAssetName} />}
          <SelectField label="نوع کار" value={type} onChange={(v) => setType(v as ServiceType)} options={(Object.keys(SERVICE_LABEL) as ServiceType[]).map((k) => ({ value: k, label: SERVICE_LABEL[k] }))} />
          <DateField label="تاریخ انجام (خالی = امروز)" value={date} onChange={setDate} />
          <TextAreaField label="شرح کار" value={desc} onChange={setDesc} placeholder="مثلاً تعویض لامپ LED ۱۸ وات" maxLength={500} />
          <Field label="انجام‌دهنده" value={performer} onChange={setPerformer} placeholder="نام تکنسین یا شرکت" />
          <Field label="هزینه (تومان)" value={cost} onChange={setCost} inputMode="numeric" />
          <CheckRow checked={resolve} onChange={setResolve}>تیکت پس از ثبت «حل‌شده» شود</CheckRow>
        </FieldCard>
      </div>
      {err && <p className="mt-2 text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta className="mt-3" busy={busy} onClick={go}>
        ثبت در سابقه‌ی تجهیز
      </Cta>
    </Sheet>
  )
}

