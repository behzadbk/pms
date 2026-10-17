import { useEffect, useRef, useState } from 'react'
import { CalendarHeart, Check, Search, Users, X } from 'lucide-react'
import { eventsApi } from '../../lib/api'
import { KIND_LABEL, type CommunityEvent, type EventKind, type PersonHit, type UnitHit } from '../../lib/api/events'
import { errText, fa } from '../../lib/api/residents'
import { whenFa, SelectField, TextAreaField } from '../shared/maintenanceUi'
import { DateTimePick } from '../../components/DateTimePick'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, Sheet, useLoad, useToast } from '../../components/hm'

/** رویدادهای ساکنین: مافیا، فیلم، فوتبال … هر ساکن می‌سازد؛ مدعوین «میام / نمی‌آیم» می‌زنند و ظرفیت پر می‌شود. */
export function ResidentEvents() {
  const { data, error, loading, reload } = useLoad<CommunityEvent[]>(() => eventsApi.list(), [])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'رویدادها · همین'
  }, [])

  async function rsvp(e: CommunityEvent, status: 'going' | 'declined') {
    setBusy(e.id)
    try {
      const r = await eventsApi.rsvp(e.id, status)
      toast(status === 'going' ? (r.full ? 'ثبت شد — ظرفیت تکمیل شد 🎉' : 'ثبت شد، منتظرتان هستیم') : 'ثبت شد')
      await reload(true)
    } catch (err) {
      toast(errText(err))
      void reload(true)
    } finally {
      setBusy(null)
    }
  }
  async function cancel(e: CommunityEvent) {
    try {
      await eventsApi.cancel(e.id)
      toast('رویداد لغو شد و مدعوین مطلع شدند')
      setDetail(null)
      void reload(true)
    } catch (err) {
      toast(errText(err))
    }
  }

  const open = (data ?? []).filter((e) => e.status === 'open')
  const sel = open.find((e) => e.id === detail) ?? null

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="ساختمان" title="رویدادها" action={<button className="hm-chip !min-h-[44px] font-bold" onClick={() => setCreating(true)}>رویداد جدید</button>} />
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBlock message={error ?? ''} retry={() => void reload()} />
      ) : open.length === 0 ? (
        <EmptyState icon={CalendarHeart} title="رویدادی در پیش نیست" sub="مافیا، فیلم یا فوتبال امشب؟ خودتان یک رویداد بسازید." tone="mute" />
      ) : (
        <div className="flex flex-col gap-3">
          {open.map((e) => {
            const pct = e.needed_players ? Math.min(100, Math.round((e.going_count / e.needed_players) * 100)) : 0
            const full = e.needed_players != null && (e.spots_left ?? 0) === 0
            const me = e.my_status
            return (
              <div key={e.id} className="hm-card p-4 flex flex-col gap-2">
                <button className="text-right" onClick={() => setDetail(e.id)}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold">{e.title}</p>
                      <p className="text-xs text-[var(--hm-t2)] mt-0.5">
                        {whenFa(e.starts_at)}
                        {e.place || e.amenity_name ? ` · ${e.place || e.amenity_name}` : ''}
                      </p>
                      <p className="text-xs text-[var(--hm-t2)]">میزبان: {e.is_host ? 'شما' : `${e.host_name ?? '—'}${e.host_unit ? ` (واحد ${e.host_unit})` : ''}`}</p>
                    </div>
                    <Badge tone="mute">{KIND_LABEL[e.kind]}</Badge>
                  </div>
                </button>
                {e.needed_players != null ? (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>
                        {fa(e.going_count)} از {fa(e.needed_players)} نفر
                      </span>
                      <span className={full ? 'text-[var(--hm-ok)] font-bold' : 'text-[var(--hm-t2)]'}>{full ? 'ظرفیت تکمیل' : `${fa(e.spots_left ?? 0)} جای خالی`}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--lg4-inner)' }} role="progressbar" aria-valuenow={e.going_count} aria-valuemin={0} aria-valuemax={e.needed_players} aria-label="تکمیل ظرفیت">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: full ? 'var(--hm-ok)' : 'var(--hm-pri)' }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--hm-t2)]">{fa(e.going_count)} نفر می‌آیند</p>
                )}
                {e.is_host ? (
                  <p className="text-xs text-[var(--hm-t2)]">شما میزبان هستید{e.audience === 'selected' ? ` · ${fa(e.pending_count)} نفر هنوز پاسخ نداده‌اند` : ''}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`min-h-[48px] rounded-full font-bold text-sm inline-flex items-center justify-center gap-1.5 ${me === 'going' ? 'hm-tone-ok' : 'hm-tone-pri'}`}
                      aria-pressed={me === 'going'}
                      disabled={busy === e.id || (full && me !== 'going')}
                      onClick={() => void rsvp(e, 'going')}
                    >
                      <Check size={16} aria-hidden /> {me === 'going' ? 'می‌آیم' : full ? 'پر شد' : 'میام / هستم'}
                    </button>
                    <button
                      className={`min-h-[48px] rounded-full font-bold text-sm inline-flex items-center justify-center gap-1.5 ${me === 'declined' ? 'hm-tone-bad' : 'hm-tone-mute'}`}
                      aria-pressed={me === 'declined'}
                      disabled={busy === e.id}
                      onClick={() => void rsvp(e, 'declined')}
                    >
                      <X size={16} aria-hidden /> نمی‌آیم
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={!!sel} onClose={() => setDetail(null)} label="جزئیات رویداد">
        {sel && (
          <>
            <p className="text-lg font-bold">{sel.title}</p>
            <p className="text-sm text-[var(--hm-t2)] mt-1">{whenFa(sel.starts_at)}</p>
            {sel.description && <p className="text-sm leading-7 mt-2">{sel.description}</p>}
            <p className="text-sm font-bold mt-3 flex items-center gap-1.5">
              <Users size={16} aria-hidden /> می‌آیند ({fa(sel.going_count)})
            </p>
            <p className="text-sm leading-7 text-[var(--hm-t2)]">{sel.going.length ? sel.going.map((p) => `${p.name ?? '—'}${p.unit_no ? ` (${p.unit_no})` : ''}`).join('، ') : 'هنوز کسی تأیید نکرده است.'}</p>
            {sel.pending && sel.pending.length > 0 && (
              <>
                <p className="text-sm font-bold mt-3">منتظر پاسخ ({fa(sel.pending.length)})</p>
                <p className="text-sm leading-7 text-[var(--hm-t2)]">{sel.pending.map((p) => p.name ?? '—').join('، ')}</p>
              </>
            )}
            {(sel.is_host) && (
              <button className="mt-4 w-full min-h-[48px] rounded-full hm-tone-bad font-bold text-sm" onClick={() => void cancel(sel)}>
                لغو رویداد
              </button>
            )}
          </>
        )}
      </Sheet>

      {creating && <CreateSheet onClose={() => setCreating(false)} toast={toast} onCreated={() => { setCreating(false); void reload(true) }} />}
      {toastNode}
    </div>
  )
}

type Chosen = { kind: 'person'; id: string; label: string } | { kind: 'unit'; id: string; label: string }

function CreateSheet({ onClose, onCreated, toast }: { onClose: () => void; onCreated: () => void; toast: (m: string) => void }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('game')
  const [when, setWhen] = useState('')
  const [place, setPlace] = useState('')
  const [desc, setDesc] = useState('')
  const [players, setPlayers] = useState('')
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ people: PersonHit[]; units: UnitHit[] }>({ people: [], units: [] })
  const [chosen, setChosen] = useState<Chosen[]>([])
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setHits({ people: [], units: [] })
      return
    }
    const my = ++seq.current
    const t = window.setTimeout(() => {
      eventsApi.people(term).then((r) => my === seq.current && setHits(r)).catch(() => undefined)
    }, 250)
    return () => window.clearTimeout(t)
  }, [q])

  const add = (c: Chosen) => setChosen((l) => (l.some((x) => x.kind === c.kind && x.id === c.id) ? l : [...l, c]))
  const n = players.trim() ? Number(players.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) : undefined

  async function submit() {
    if (title.trim().length < 2) return toast('عنوان رویداد را بنویسید')
    if (!when) return toast('زمان رویداد را انتخاب کنید')
    if (n != null && (!Number.isInteger(n) || n < 2 || n > 500)) return toast('تعداد نفرات باید بین ۲ تا ۵۰۰ باشد')
    if (audience === 'selected' && chosen.length === 0) return toast('حداقل یک نفر یا یک واحد را دعوت کنید')
    setBusy(true)
    try {
      const r = await eventsApi.create({
        title: title.trim(),
        kind,
        starts_at: when,
        audience,
        ...(place.trim() ? { place: place.trim() } : {}),
        ...(desc.trim() ? { description: desc.trim() } : {}),
        ...(n ? { needed_players: n } : {}),
        ...(audience === 'selected'
          ? { invite_person_ids: chosen.filter((c) => c.kind === 'person').map((c) => c.id), invite_unit_ids: chosen.filter((c) => c.kind === 'unit').map((c) => c.id) }
          : {}),
      })
      toast(`رویداد ساخته شد · ${fa(r.invited)} نفر دعوت شدند`)
      onCreated()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} label="رویداد جدید">
      <p className="text-lg font-bold">رویداد جدید</p>
      <div className="mt-3 flex flex-col gap-3">
        <FieldCard>
          <Field label="عنوان" value={title} onChange={setTitle} placeholder="مثلاً مافیا ساعت ۱۰ شب" />
          <SelectField label="نوع" value={kind} onChange={(v) => setKind(v as EventKind)} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
          <DateTimePick label="زمان" value={when} onChange={setWhen} days={14} fromHour={8} toHour={23} />
          <Field label="مکان (اختیاری)" value={place} onChange={setPlace} placeholder="مثلاً سینمای ساختمان" />
          <Field label="تعداد نفرات لازم (اختیاری)" value={players} onChange={setPlayers} inputMode="numeric" placeholder="مثلاً ۱۲" />
          <TextAreaField label="توضیح (اختیاری)" value={desc} onChange={setDesc} maxLength={400} rows={2} />
        </FieldCard>

        <div>
          <p className="text-sm font-bold mb-2">دعوت از</p>
          <Seg<'all' | 'selected'> options={[['all', 'همه‌ی ساکنین'], ['selected', 'افراد مشخص']]} value={audience} onChange={setAudience} />
        </div>

        {audience === 'selected' && (
          <div className="flex flex-col gap-2">
            <label className="hm-card flex items-center gap-2 px-4 min-h-[48px]">
              <Search size={18} aria-hidden className="text-[var(--hm-t2)]" />
              <span className="sr-only">جست‌وجوی نام یا شماره واحد</span>
              <input className="hm-input flex-1" placeholder="نام فرد یا شماره واحد…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {(hits.people.length > 0 || hits.units.length > 0) && (
              <div className="hm-card px-2 py-1 hm-divided max-h-56 overflow-y-auto">
                {hits.units.map((u) => (
                  <button key={u.unit_id} className="w-full min-h-[48px] px-2 text-right text-sm" onClick={() => add({ kind: 'unit', id: u.unit_id, label: `واحد ${u.unit_number}` })}>
                    <b>واحد {u.unit_number}</b> <span className="text-[var(--hm-t2)]">— {u.names.join('، ')}</span>
                  </button>
                ))}
                {hits.people.map((p) => (
                  <button key={p.person_id} className="w-full min-h-[48px] px-2 text-right text-sm" onClick={() => add({ kind: 'person', id: p.person_id, label: p.name })}>
                    <b>{p.name}</b> <span className="text-[var(--hm-t2)]">— واحد {p.units.join('، ')}</span>
                  </button>
                ))}
              </div>
            )}
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="دعوت‌شدگان">
                {chosen.map((c) => (
                  <button key={`${c.kind}${c.id}`} className="hm-chip !min-h-[40px] inline-flex items-center gap-1.5" onClick={() => setChosen((l) => l.filter((x) => x !== c))} aria-label={`حذف ${c.label}`}>
                    {c.label} <X size={14} aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Cta className="mt-4" onClick={submit} busy={busy}>
        ساخت رویداد و ارسال دعوت
      </Cta>
    </Sheet>
  )
}
