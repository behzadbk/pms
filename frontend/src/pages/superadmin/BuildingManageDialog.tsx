import { useCallback, useEffect, useState } from 'react'
import { Download, LogIn, Trash2 } from 'lucide-react'
import { GhostButton, Modal, PrimaryButton, SelectField, TextArea } from '../../components/ui/Modal'
import { StatusPill } from '../../components/ui/StatusPill'
import { useAuth } from '../../context/AuthContext'
import { platformApi, ApiError } from '../../lib/api'
import type { Building, BuildingNote, NoteKind, PlatformRole } from '../../lib/api/platform'
import { startImpersonation } from '../../lib/impersonation'

const kindLabels: Record<NoteKind, string> = { note: 'یادداشت', call: 'تماس', visit: 'بازدید', sales: 'فروش' }
const can = (role: PlatformRole | undefined, allowed: PlatformRole[]) => !!role && allowed.includes(role)
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'خطای اتصال به سرور')

/** مدیریت یک ساختمان: چرخه‌ی عمر (تعلیق/فعال‌سازی/لغو)، ورود به‌جای مدیر، یادداشت‌های پشتیبانی، خروجی داده */
export function BuildingManageDialog({
  building,
  onClose,
  onChanged,
}: {
  building: Building
  onClose: () => void
  onChanged: () => void
}) {
  const { user } = useAuth()
  const role = user?.platformRole as PlatformRole | undefined
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<BuildingNote[]>([])
  const [noteKind, setNoteKind] = useState<NoteKind>('note')
  const [noteBody, setNoteBody] = useState('')

  const canLifecycle = can(role, ['owner', 'support'])
  const canNotes = can(role, ['owner', 'support', 'sales'])
  const inactive = building.status === 'suspended' || building.status === 'cancelled'

  const loadNotes = useCallback(() => {
    if (!canNotes) return
    platformApi.listNotes(building.id).then((r) => setNotes(r.notes)).catch((e) => setError(errText(e)))
  }, [building.id, canNotes])
  useEffect(loadNotes, [loadNotes])

  async function run(fn: () => Promise<unknown>, done?: () => void) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      done?.()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const lifecycle = (action: 'suspend' | 'cancel' | 'reactivate') => {
    if (action !== 'reactivate' && !reason.trim()) return setError('دلیل الزامی است')
    const label = action === 'suspend' ? 'تعلیق' : action === 'cancel' ? 'لغو' : 'فعال‌سازی مجدد'
    if (!window.confirm(`«${building.name}» — ${label}؟`)) return
    void run(
      () =>
        action === 'suspend' ? platformApi.suspendBuilding(building.id, reason.trim())
        : action === 'cancel' ? platformApi.cancelBuilding(building.id, reason.trim())
        : platformApi.reactivateBuilding(building.id),
      () => { onChanged(); onClose() },
    )
  }

  const impersonate = () => {
    if (!window.confirm(`ورود به‌جای مدیر «${building.name}» (۳۰ دقیقه، در لاگ فعالیت ثبت می‌شود)؟`)) return
    void run(async () => {
      const r = await platformApi.impersonateBuilding(building.id)
      startImpersonation(r.accessToken, { by: user?.fullName ?? 'superadmin', tenantName: r.tenantName, expiresInSeconds: r.expiresInSeconds })
    })
  }

  const exportData = () =>
    void run(async () => {
      const data = await platformApi.exportBuilding(building.id)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      a.download = `${building.subdomain}-export.json`
      a.click()
      URL.revokeObjectURL(a.href)
    })

  const addNote = () => {
    if (!noteBody.trim()) return
    void run(() => platformApi.addNote(building.id, noteKind, noteBody.trim()), () => { setNoteBody(''); loadNotes() })
  }

  return (
    <Modal open title={`مدیریت: ${building.name}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill status={building.status} />
          {building.status === 'suspended' && building.suspendReason && (
            <span className="text-xs text-muted">دلیل: {building.suspendReason}</span>
          )}
          {building.status === 'trial' && building.trialEndsAt && (
            <span className="text-xs text-muted" dir="ltr">پایان آزمایشی: {building.trialEndsAt}</span>
          )}
        </div>

        {error && <p className="rounded-lg bg-bad-soft text-bad text-sm px-3 py-2" role="alert">{error}</p>}

        {canLifecycle && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">وضعیت</h3>
            {inactive ? (
              <PrimaryButton disabled={busy} onClick={() => lifecycle('reactivate')}>فعال‌سازی مجدد</PrimaryButton>
            ) : (
              <>
                <TextArea label="دلیل (برای تعلیق/لغو الزامی است)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
                <div className="flex gap-2 flex-wrap">
                  <GhostButton disabled={busy} onClick={() => lifecycle('suspend')}>تعلیق</GhostButton>
                  {role === 'owner' && <GhostButton disabled={busy} onClick={() => lifecycle('cancel')} className="text-bad">لغو قرارداد</GhostButton>}
                </div>
              </>
            )}
            <p className="text-xs text-muted">داده‌ی ساختمان پاک نمی‌شود؛ تعلیق فوراً نشست‌های ورود را باطل می‌کند.</p>
          </section>
        )}

        <section className="flex gap-2 flex-wrap">
          {canLifecycle && !inactive && (
            <GhostButton disabled={busy} onClick={impersonate}><LogIn size={14} className="inline ms-1" /> ورود به‌جای مدیر</GhostButton>
          )}
          {role === 'owner' && (
            <GhostButton disabled={busy} onClick={exportData}><Download size={14} className="inline ms-1" /> خروجی داده</GhostButton>
          )}
        </section>

        {canNotes && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">یادداشت‌ها و تماس‌ها</h3>
            <div className="grid grid-cols-[8rem_1fr] gap-2 items-end">
              <SelectField label="نوع" value={noteKind} onChange={(e) => setNoteKind(e.target.value as NoteKind)}
                options={(Object.keys(kindLabels) as NoteKind[]).map((k) => ({ value: k, label: kindLabels[k] }))} />
              <TextArea label="متن" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} maxLength={2000} />
            </div>
            <PrimaryButton disabled={busy || !noteBody.trim()} onClick={addNote}>افزودن</PrimaryButton>
            <ul className="divide-y divide-line">
              {notes.length === 0 && <li className="py-3 text-xs text-muted">هنوز یادداشتی ثبت نشده.</li>}
              {notes.map((n) => (
                <li key={n.id} className="py-2 flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted">{kindLabels[n.kind]} · {n.author} · {new Date(n.createdAt).toLocaleString('fa-IR')}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                  </div>
                  {role === 'owner' && (
                    <button aria-label="حذف" className="text-muted hover:text-bad p-1" onClick={() => void run(() => platformApi.deleteNote(building.id, n.id), loadNotes)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
