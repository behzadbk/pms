import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, ClipboardList, Play, User } from 'lucide-react'
import { serviceDeskApi } from '../../lib/api'
import { STATUS_LABEL, type ManagedRequest, type RequestStatus, type TeamMember } from '../../lib/api/serviceDesk'
import { errText, type Tone } from '../../lib/api/residents'
import { whenFa, SelectField, TextAreaField } from '../shared/maintenanceUi'
import { DateTimePick } from '../../components/DateTimePick'
import { Badge, Cta, EmptyState, ErrorBlock, FieldCard, Loading, PageTitle, Seg, Sheet, useLoad, useToast } from '../../components/hm'

const TONE: Record<RequestStatus, Tone> = { submitted: 'warn', scheduled: 'acc', assigned: 'acc', in_progress: 'pri', done: 'ok', rejected: 'bad', cancelled: 'mute' }
type Filter = 'open' | 'all'

/**
 * صف درخواست خدمات.
 * مدیر دپارتمان: زمان را تأیید/تغییر می‌دهد، کار را به یکی از کارکنان زیردست می‌سپارد یا رد می‌کند.
 * مجری: فقط کارهای سپرده‌شده به خودش را می‌بیند و شروع/پایان می‌زند. مدیر ساختمان همه را می‌بیند.
 */
export function ServiceDeskView({ toast }: { toast: (m: string) => void }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [dept, setDept] = useState('')
  const { data, error, loading, reload } = useLoad(() => serviceDeskApi.desk.list(filter, dept || undefined), [filter, dept])
  const [manage, setManage] = useState<ManagedRequest | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && void reload(true), 30_000)
    return () => window.clearInterval(t)
  }, [reload])

  async function act(r: ManagedRequest, kind: 'start' | 'done') {
    setBusy(r.id)
    try {
      await serviceDeskApi.desk[kind](r.id)
      toast(kind === 'start' ? 'کار شروع شد' : 'کار انجام‌شده ثبت شد')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Seg<Filter> options={[['open', 'فعال'], ['all', 'همه']]} value={filter} onChange={setFilter} />
      {data && data.managed_departments.length > 1 && (
        <div className="hm-card py-1">
          <SelectField label="دپارتمان" value={dept} onChange={setDept} options={[{ value: '', label: 'همه دپارتمان‌ها' }, ...data.managed_departments.map((d) => ({ value: d.code, label: d.name }))]} />
        </div>
      )}
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBlock message={error ?? ''} retry={() => void reload()} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="درخواستی نیست" tone="mute" />
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((r) => (
            <div key={r.id} className="hm-card p-4 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{r.service_title}</p>
                  <p className="text-xs text-[var(--hm-t2)] mt-0.5">
                    {r.department_name} · {r.requester_name ?? 'ساکن'}
                    {r.unit_no ? ` · واحد ${r.unit_no}` : ''}
                  </p>
                </div>
                <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </div>
              <p className="text-sm flex items-center gap-1.5">
                <CalendarClock size={15} aria-hidden /> درخواست: {whenFa(r.preferred_at)}
              </p>
              {r.scheduled_at && <p className="text-sm font-bold text-[var(--hm-pri)]">زمان تأییدشده: {whenFa(r.scheduled_at)}</p>}
              {r.assigned_name && (
                <p className="text-sm flex items-center gap-1.5">
                  <User size={15} aria-hidden /> مجری: {r.assigned_name}
                  {r.is_mine && ' (شما)'}
                </p>
              )}
              {r.note && <p className="text-sm text-[var(--hm-t2)] leading-6">«{r.note}»</p>}
              {r.reject_reason && <p className="text-sm text-[var(--hm-bad)]">{r.reject_reason}</p>}
              <div className="flex gap-2 flex-wrap">
                {r.can_manage && (r.status === 'submitted' || r.status === 'scheduled' || r.status === 'assigned') && (
                  <button className="hm-chip !min-h-[44px] font-bold" onClick={() => setManage(r)}>
                    {r.status === 'submitted' ? 'تأیید زمان و ارجاع' : 'تغییر زمان / انتقال'}
                  </button>
                )}
                {(r.is_mine || r.can_manage) && r.status === 'assigned' && (
                  <button className="hm-chip !min-h-[44px] font-bold inline-flex items-center gap-1.5" disabled={busy === r.id} onClick={() => void act(r, 'start')}>
                    <Play size={15} aria-hidden /> شروع
                  </button>
                )}
                {(r.is_mine || r.can_manage) && (r.status === 'assigned' || r.status === 'in_progress') && (
                  <button className="hm-chip !min-h-[44px] font-bold inline-flex items-center gap-1.5" disabled={busy === r.id} onClick={() => void act(r, 'done')}>
                    <CheckCircle2 size={15} aria-hidden /> انجام شد
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {manage && (
        <ManageSheet
          r={manage}
          onClose={() => setManage(null)}
          toast={toast}
          onDone={() => {
            setManage(null)
            void reload(true)
          }}
        />
      )}
    </div>
  )
}

function ManageSheet({ r, onClose, onDone, toast }: { r: ManagedRequest; onClose: () => void; onDone: () => void; toast: (m: string) => void }) {
  const [when, setWhen] = useState(r.scheduled_at ?? r.preferred_at)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [who, setWho] = useState(r.assigned_to ?? '')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    serviceDeskApi.desk.team(r.department_code).then((t) => live && setTeam(t)).catch((e) => toast(errText(e)))
    return () => {
      live = false
    }
  }, [r.department_code, toast])

  async function save() {
    setBusy(true)
    try {
      const timeChanged = when !== r.scheduled_at
      if (r.status === 'submitted' || timeChanged) {
        await serviceDeskApi.desk.schedule(r.id, { scheduled_at: when, ...(who ? { assigned_to: who } : {}) })
      } else if (who && who !== r.assigned_to) {
        await serviceDeskApi.desk.assign(r.id, who)
      }
      toast('ذخیره شد و ساکن مطلع شد')
      onDone()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }
  async function reject() {
    if (reason.trim().length < 2) return toast('دلیل رد را بنویسید')
    setBusy(true)
    try {
      await serviceDeskApi.desk.reject(r.id, reason.trim())
      toast('درخواست رد شد')
      onDone()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} label="مدیریت درخواست">
      <p className="text-lg font-bold">{r.service_title}</p>
      <p className="text-xs text-[var(--hm-t2)] mt-1">
        {r.requester_name ?? 'ساکن'}
        {r.unit_no ? ` · واحد ${r.unit_no}` : ''} · درخواست: {whenFa(r.preferred_at)}
      </p>
      {!rejecting ? (
        <>
          <div className="mt-3">
            <FieldCard>
              <DateTimePick label="زمان انجام" value={when} onChange={setWhen} days={14} />
              <SelectField
                label="مجری (از کارکنان این دپارتمان)"
                value={who}
                onChange={setWho}
                options={[{ value: '', label: 'فعلاً بدون مجری' }, ...team.map((m) => ({ value: m.id, label: `${m.full_name} — ${m.open_count} کار باز` }))]}
              />
            </FieldCard>
          </div>
          <Cta className="mt-3" onClick={save} busy={busy}>
            {r.status === 'submitted' ? 'تأیید زمان' : 'ذخیره'}
          </Cta>
          <button className="mt-2 w-full min-h-[48px] rounded-full hm-tone-bad font-bold text-sm" onClick={() => setRejecting(true)}>
            رد درخواست
          </button>
        </>
      ) : (
        <>
          <div className="mt-3">
            <FieldCard>
              <TextAreaField label="دلیل رد (برای ساکن نمایش داده می‌شود)" value={reason} onChange={setReason} maxLength={200} rows={2} />
            </FieldCard>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button className="min-h-[48px] rounded-full hm-tone-mute font-bold text-sm" onClick={() => setRejecting(false)}>
              بازگشت
            </button>
            <button className="min-h-[48px] rounded-full hm-tone-bad font-bold text-sm" disabled={busy} onClick={reject}>
              رد کردن
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

export function StaffServices() {
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'درخواست‌های خدمات · Livo'
  }, [])
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="دپارتمان" title="درخواست‌های خدمات" />
      <ServiceDeskView toast={toast} />
      {toastNode}
    </div>
  )
}
