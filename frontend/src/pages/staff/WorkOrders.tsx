import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, MapPin, Plus, Play, Ticket as TicketIcon, User } from 'lucide-react'
import { maintenanceApi, PRIORITY_LABEL, type Asset, type Priority, type TeamMember, type WorkOrder } from '../../lib/api/maintenance'
import { errText, fa, toman } from '../../lib/api/residents'
import { parseDateInput } from '../../lib/jalali'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, Sheet, useLoad, useToast } from '../../components/hm'
import { DateField, PRIORITY_TONE, SelectField, TextAreaField, WO_LABEL, WO_TONE, dateFa } from '../shared/maintenanceUi'

type Tab = 'active' | 'done'

/** فهرست دستور کارها: کارمند نگهداری فقط کارهای خودش (و واگذارنشده‌ها) را می‌بیند، مدیر همه را. */
export function WorkOrdersView({ admin, toast }: { admin?: boolean; toast: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('active')
  const { data, error, loading, reload } = useLoad<WorkOrder[]>(() => maintenanceApi.workOrders(tab), [tab])
  const [finish, setFinish] = useState<WorkOrder | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && void reload(true), 30_000)
    return () => window.clearInterval(t)
  }, [reload])

  async function start(w: WorkOrder) {
    setBusy(w.id)
    try {
      await maintenanceApi.workOrderStatus(w.id, 'in_progress')
      toast('کار شروع شد')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Seg<Tab> className="flex-1" options={[['active', 'کارهای فعال'], ['done', 'انجام‌شده']]} value={tab} onChange={setTab} />
        {admin && (
          <button className="lg4-capsule min-h-[44px] px-4 text-sm font-bold inline-flex items-center gap-1.5" onClick={() => setCreating(true)}>
            <Plus size={16} /> کار جدید
          </button>
        )}
      </div>

      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBlock message={error ?? ''} retry={() => void reload()} />
      ) : data.length === 0 ? (
        <EmptyState icon={ClipboardList} title={tab === 'active' ? 'کار فعالی ندارید' : 'هنوز کاری انجام نشده'} sub={tab === 'active' ? 'کارهای ارجاع‌شده و سرویس‌های دوره‌ای اینجا نمایش داده می‌شوند.' : undefined} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((w) => (
            <article key={w.id} className="hm-card p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="font-bold text-[15px] flex-1 min-w-0 leading-7">{w.title}</p>
                <Badge tone={WO_TONE[w.status]}>{WO_LABEL[w.status]}</Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={PRIORITY_TONE[w.priority]}>{PRIORITY_LABEL[w.priority]}</Badge>
                {w.schedule_id && <Badge tone="acc">سرویس دوره‌ای</Badge>}
                {w.ticket_id && <Badge tone="pri">از تیکت</Badge>}
                {w.overdue && (
                  <Badge tone="bad">
                    <AlertTriangle size={12} className="ml-1" /> دیرکرد
                  </Badge>
                )}
              </div>
              {w.description && <p className="text-sm text-[var(--hm-t2)] leading-7 whitespace-pre-line">{w.description}</p>}
              <div className="flex flex-col gap-1 text-xs text-[var(--hm-t2)]">
                {(w.asset_name || w.ticket_location) && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={13} /> {[w.asset_name, w.ticket_location ?? w.asset_location].filter(Boolean).join(' · ')}
                  </span>
                )}
                {w.ticket_subject && (
                  <span className="inline-flex items-center gap-1.5">
                    <TicketIcon size={13} /> {w.ticket_subject}
                    {w.ticket_unit ? ` · واحد ${fa(w.ticket_unit)}` : ''}
                  </span>
                )}
                {w.due_date && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={13} /> مهلت: {dateFa(w.due_date)}
                  </span>
                )}
                {admin && (
                  <span className="inline-flex items-center gap-1.5">
                    <User size={13} /> {w.assignee_name ?? 'واگذار نشده'}
                  </span>
                )}
                {w.status === 'done' && w.result_note && <span className="rounded-xl px-3 py-2 hm-tone-ok leading-6">{w.result_note}</span>}
              </div>
              {(w.status === 'open' || w.status === 'in_progress') && (
                <div className="grid grid-cols-2 gap-2">
                  {w.status === 'open' ? (
                    <button className="lg4-capsule min-h-[44px] text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60" disabled={busy === w.id} onClick={() => start(w)}>
                      <Play size={15} /> شروع کار
                    </button>
                  ) : (
                    <span className="min-h-[44px] rounded-full text-sm font-bold hm-tone-pri inline-flex items-center justify-center">در حال انجام</span>
                  )}
                  <button className="min-h-[44px] rounded-full text-sm font-bold hm-tone-ok inline-flex items-center justify-center gap-1.5" onClick={() => setFinish(w)}>
                    <CheckCircle2 size={15} /> ثبت انجام
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <FinishSheet
        wo={finish}
        onClose={() => setFinish(null)}
        onDone={async () => {
          setFinish(null)
          toast('انجام کار ثبت شد')
          await reload(true)
        }}
      />
      {admin && (
        <CreateSheet
          open={creating}
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false)
            toast('کار ثبت و به کارمند اعلان شد')
            await reload(true)
          }}
        />
      )}
    </div>
  )
}

function FinishSheet({ wo, onClose, onDone }: { wo: WorkOrder | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [note, setNote] = useState('')
  const [performer, setPerformer] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (wo) {
      setNote('')
      setPerformer('')
      setCost('')
      setErr('')
    }
  }, [wo])
  async function go() {
    if (!wo) return
    setBusy(true)
    try {
      const c = Number(cost.replace(/[^\d]/g, '')) || undefined
      await maintenanceApi.workOrderStatus(wo.id, 'done', { note: note.trim() || undefined, performer: performer.trim() || undefined, cost: c })
      await onDone()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={!!wo} onClose={onClose} label="ثبت انجام کار">
      <p className="text-lg font-bold">ثبت انجام کار</p>
      <p className="mt-1 text-sm text-[var(--hm-t2)] leading-7">{wo?.title}</p>
      <div className="mt-3">
        <FieldCard>
          <TextAreaField label="شرح کار انجام‌شده" value={note} onChange={setNote} placeholder="مثلاً تعویض لامپ LED ۱۸ وات" maxLength={500} />
          <Field label="انجام‌دهنده (اختیاری)" value={performer} onChange={setPerformer} placeholder="نام تکنسین یا شرکت" />
          <Field label="هزینه (تومان، اختیاری)" value={cost} onChange={setCost} inputMode="numeric" placeholder="۰" />
        </FieldCard>
      </div>
      {cost && <p className="mt-2 text-xs text-[var(--hm-t2)]">{toman(Number(cost.replace(/[^\d]/g, '')) || 0)} تومان</p>}
      {wo?.ticket_id && <p className="mt-2 text-xs text-[var(--hm-t2)] leading-6">تیکت مرتبط «حل‌شده» می‌شود و ساکن اعلان می‌گیرد.</p>}
      {wo?.schedule_id && <p className="mt-2 text-xs text-[var(--hm-t2)] leading-6">سررسید بعدی این سرویس خودکار از امروز محاسبه می‌شود.</p>}
      {err && <p className="mt-2 text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta className="mt-3" busy={busy} onClick={go}>
        ثبت انجام
      </Cta>
    </Sheet>
  )
}

function CreateSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [asset, setAsset] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [due, setDue] = useState('')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setTitle('')
    setDesc('')
    setAsset('')
    setAssignee('')
    setDue('')
    setPriority('normal')
    setErr('')
    void maintenanceApi.team().then(setTeam).catch(() => undefined)
    void maintenanceApi.assets().then((r) => setAssets(r.assets)).catch(() => undefined)
  }, [open])
  async function go() {
    if (title.trim().length < 3) return setErr('عنوان کار را بنویسید')
    const iso = due.trim() ? parseDateInput(due) : undefined
    if (due.trim() && !iso) return setErr('تاریخ مهلت نامعتبر است')
    setBusy(true)
    try {
      await maintenanceApi.createWorkOrder({ title: title.trim(), description: desc.trim() || undefined, asset_id: asset || undefined, assignee_login: assignee || null, priority, due_date: iso ?? undefined })
      await onDone()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} label="کار جدید">
      <p className="text-lg font-bold">کار نگهداری جدید</p>
      <div className="mt-3">
        <FieldCard>
          <Field label="عنوان" value={title} onChange={setTitle} placeholder="مثلاً بازدید موتورخانه" />
          <TextAreaField label="توضیح (اختیاری)" value={desc} onChange={setDesc} />
          <SelectField label="تجهیز (اختیاری)" value={asset} onChange={setAsset} options={[{ value: '', label: '— بدون تجهیز —' }, ...assets.map((a) => ({ value: a.id, label: a.name }))]} />
          <SelectField label="کارمند مسئول" value={assignee} onChange={setAssignee} options={[{ value: '', label: '— همه‌ی کارکنان نگهداری —' }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
          <SelectField label="اولویت" value={priority} onChange={(v) => setPriority(v as Priority)} options={(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
          <DateField label="مهلت (اختیاری)" value={due} onChange={setDue} />
        </FieldCard>
      </div>
      {err && <p className="mt-2 text-xs text-[var(--hm-bad)]">{err}</p>}
      <Cta className="mt-3" busy={busy} onClick={go}>
        ثبت و اعلان به کارمند
      </Cta>
    </Sheet>
  )
}

export function StaffWorkOrders() {
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'کارهای نگهداری · همین'
  }, [])
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="نگهداری" title="کارهای نگهداری" />
      <WorkOrdersView toast={toast} />
      {toastNode}
    </div>
  )
}
