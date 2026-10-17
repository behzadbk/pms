import { useEffect, useState } from 'react'
import { HandHelping } from 'lucide-react'
import { serviceDeskApi } from '../../lib/api'
import { STATUS_LABEL, type RequestStatus, type ServiceRequest, type ServiceType } from '../../lib/api/serviceDesk'
import { errText } from '../../lib/api/residents'
import { serviceIcon } from '../../lib/serviceIcons'
import { whenFa, TextAreaField } from '../shared/maintenanceUi'
import { DateTimePick } from '../../components/DateTimePick'
import { Badge, Cta, EmptyState, ErrorBlock, FieldCard, Loading, PageTitle, Sheet, useLoad, useToast } from '../../components/hm'
import type { Tone } from '../../lib/api/residents'

const TONE: Record<RequestStatus, Tone> = { submitted: 'warn', scheduled: 'acc', assigned: 'acc', in_progress: 'pri', done: 'ok', rejected: 'bad', cancelled: 'mute' }

/** خدمات ساختمان (کارواش، خانه‌داری، نظافت …): ساکن خدمت و زمان دلخواه را می‌فرستد؛ مسئول دپارتمان زمان را تأیید می‌کند. */
export function ResidentServices() {
  const types = useLoad<ServiceType[]>(() => serviceDeskApi.types.list(), [])
  const mine = useLoad<ServiceRequest[]>(() => serviceDeskApi.mine.list(), [])
  const [pick, setPick] = useState<ServiceType | null>(null)
  const [when, setWhen] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'خدمات · Livo'
  }, [])

  async function submit() {
    if (!pick || !when) return toast('زمان دلخواه را انتخاب کنید')
    setBusy(true)
    try {
      await serviceDeskApi.mine.create({ service_type_id: pick.id, preferred_at: when, ...(note.trim() ? { note: note.trim() } : {}) })
      toast('درخواست ثبت شد — پس از تأیید زمان اعلان می‌گیرید')
      setPick(null)
      setWhen('')
      setNote('')
      void mine.reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }
  async function cancel(r: ServiceRequest) {
    try {
      await serviceDeskApi.mine.cancel(r.id)
      toast('درخواست لغو شد')
      void mine.reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  if (types.loading) return <Loading />
  if (types.error || !types.data) return <ErrorBlock message={types.error ?? ''} retry={() => void types.reload()} />

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="ساختمان" title="درخواست خدمات" />
      {types.data.length === 0 ? (
        <EmptyState icon={HandHelping} title="هنوز خدمتی تعریف نشده است" sub="مدیر ساختمان خدمات (کارواش، نظافت، …) را تعریف می‌کند." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {types.data.map((t) => {
            const Icon = serviceIcon(t.icon)
            return (
              <button key={t.id} className="hm-card p-4 min-h-[104px] flex flex-col items-start gap-2 text-right" onClick={() => setPick(t)}>
                <span className="grid place-items-center w-11 h-11 rounded-2xl hm-tone-pri">
                  <Icon size={22} aria-hidden />
                </span>
                <span className="font-bold text-sm">{t.title}</span>
                {t.description && <span className="text-xs text-[var(--hm-t2)] line-clamp-2">{t.description}</span>}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-sm font-bold mt-2">درخواست‌های من</p>
      {mine.loading ? (
        <Loading />
      ) : !mine.data || mine.data.length === 0 ? (
        <EmptyState icon={HandHelping} title="درخواستی ندارید" tone="mute" />
      ) : (
        <div className="hm-card px-4 py-1 hm-divided">
          {mine.data.map((r) => {
            const open = r.status === 'submitted' || r.status === 'scheduled'
            return (
              <div key={r.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{r.service_title}</p>
                  <p className="mt-0.5 text-xs text-[var(--hm-t2)]">
                    {r.scheduled_at ? `زمان تأییدشده: ${whenFa(r.scheduled_at)}` : `زمان درخواستی: ${whenFa(r.preferred_at)}`}
                  </p>
                  {r.assigned_name && <p className="text-xs text-[var(--hm-t2)]">مجری: {r.assigned_name}</p>}
                  {r.reject_reason && <p className="text-xs text-[var(--hm-bad)]">{r.reject_reason}</p>}
                </div>
                <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                {open && (
                  <button className="text-xs font-bold text-[var(--hm-bad)] min-h-[44px] px-2" onClick={() => void cancel(r)}>
                    لغو
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={!!pick} onClose={() => setPick(null)} label={`درخواست ${pick?.title ?? ''}`}>
        <p className="text-lg font-bold">{pick?.title}</p>
        {pick?.description && <p className="text-sm text-[var(--hm-t2)] mt-1 leading-7">{pick.description}</p>}
        <div className="mt-3">
          <FieldCard>
            <DateTimePick label="چه زمانی می‌خواهید؟" value={when} onChange={setWhen} days={7} />
            <TextAreaField label="توضیح (اختیاری)" value={note} onChange={setNote} placeholder="مثلاً پلاک خودرو یا نکته‌ی خاص" maxLength={300} rows={2} />
          </FieldCard>
        </div>
        <p className="text-xs text-[var(--hm-t2)] mt-2 leading-6">مسئول این خدمت زمان را تأیید یا زمان دیگری پیشنهاد می‌کند و شما اعلان می‌گیرید.</p>
        <Cta className="mt-3" onClick={submit} busy={busy} disabled={!when}>
          ارسال درخواست
        </Cta>
      </Sheet>
      {toastNode}
    </div>
  )
}
