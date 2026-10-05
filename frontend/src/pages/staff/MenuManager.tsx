import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Eye, EyeOff, ImagePlus, Pencil, Plus, Settings2, ShoppingBag, Star, Trash2, UtensilsCrossed, Coffee, Truck, X } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { ErrorBlock, Loading, useToast } from '../../components/hm'
import {
  fnbApi, type Availability, type DeliveryZone, type MenuCategory, type MenuItem, type MenuResponse, type Venue, type VenueKind,
} from '../../lib/api/fnb'
import { errText, fa, toman } from '../../lib/api/residents'

type VenueKey = VenueKind

const availabilityInfo: Record<Availability, { label: string; cls: string }> = {
  available: { label: 'موجود', cls: 'bg-good-soft text-good' },
  sold_out: { label: 'ناموجود (تمام شد)', cls: 'bg-warn-soft text-warn' },
  hidden: { label: 'مخفی از منو', cls: 'bg-canvas text-muted' },
}

const TITLES: Record<VenueKind, string> = { restaurant: 'رستوران', cafe: 'کافی‌شاپ' }

/** کوچک‌کردن عکس قبل از ارسال (حداکثر ۴۸۰ پیکسل، JPEG) تا حجم انتقال و دیتابیس کم بماند */
function resizeImage(file: File, max = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('فرمت عکس پشتیبانی نمی‌شود'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function StaffMenuManager({ venue: kind }: { venue: VenueKey }) {
  const title = TITLES[kind]
  const { toast, toastNode } = useToast()
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'menu' | 'zones'>('menu')

  const loadVenues = useCallback(async (selectId?: string) => {
    try {
      const v = await fnbApi.manageVenues(kind)
      setVenues(v)
      setVenueId((cur) => selectId ?? (cur && v.some((x) => x.id === cur) ? cur : v.find((x) => x.is_active)?.id ?? v[0]?.id ?? null))
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت اطلاعات ناموفق بود'))
    }
  }, [kind])
  useEffect(() => { void loadVenues() }, [loadVenues])

  if (error && !venues) return <ErrorBlock message={error} retry={() => loadVenues()} />
  if (!venues) return <Loading />

  const venue = venues.find((v) => v.id === venueId) ?? null

  // اولین اجرا: هیچ مجموعه‌ای تعریف نشده → ویزارد ساخت
  if (venues.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">راه‌اندازی {title}</h1>
          <p className="text-muted text-sm mt-1">هنوز {title}ی تعریف نشده. اطلاعات اولیه را وارد کنید؛ بعد از آن می‌توانید دسته‌ها و آیتم‌های منو را بسازید.</p>
        </div>
        <VenueWizard kind={kind} onDone={async (id) => { await loadVenues(id); toast('مجموعه ساخته شد — حالا منو را بچینید') }} />
        {toastNode}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">منوی {title}</h1>
          <p className="text-muted text-sm mt-1">دسته‌ها، آیتم‌ها، عکس و قیمت، ناموجود کردن، غذای روز و مناطق تحویل</p>
        </div>
        <GhostButton onClick={() => setCreating(true)}><Plus size={15} /> {title} جدید</GhostButton>
      </div>

      {(venues.length > 1 || (venue && !venue.is_active)) && (
        <div className="flex gap-2 flex-wrap">
          {venues.map((v) => (
            <button key={v.id} onClick={() => setVenueId(v.id)} className={`px-3.5 py-2 rounded-xl text-sm border min-h-[44px] ${venueId === v.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'} ${v.is_active ? '' : 'opacity-60'}`}>
              {v.name}{!v.is_active && ' (غیرفعال)'}
            </button>
          ))}
        </div>
      )}

      {venue && <VenueBar venue={venue} kind={kind} onChanged={(id) => loadVenues(id)} toast={toast} />}

      <div className="flex gap-1.5 bg-canvas rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {([['menu', 'منو'], ['zones', 'مناطق تحویل']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[40px] whitespace-nowrap ${tab === k ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}>{l}</button>
        ))}
      </div>

      {tab === 'menu' && venue && <MenuTab key={venue.id} venue={venue} kind={kind} toast={toast} />}
      {tab === 'zones' && <ZonesTab toast={toast} />}

      <Modal open={creating} title={`${title} جدید`} onClose={() => setCreating(false)}>
        <VenueWizard kind={kind} onDone={async (id) => { setCreating(false); await loadVenues(id); toast('مجموعه ساخته شد') }} />
      </Modal>
      {toastNode}
    </div>
  )
}

// ───────────────────────── فرم ساخت مجموعه (ویزارد اولین اجرا) ─────────────────────────

function VenueWizard({ kind, onDone }: { kind: VenueKind; onDone: (id: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [opens, setOpens] = useState('08:00')
  const [closes, setCloses] = useState('23:00')
  const [allDay, setAllDay] = useState(false)
  const [prep, setPrep] = useState('20')
  const [delivery, setDelivery] = useState(true)
  const [minOrder, setMinOrder] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const Icon = kind === 'cafe' ? Coffee : UtensilsCrossed

  async function submit() {
    setBusy(true)
    setErr('')
    try {
      const v = await fnbApi.createVenue({
        kind, name: name.trim(), description: description.trim() || null,
        opens_at: allDay ? null : opens, closes_at: allDay ? null : closes,
        prep_time_minutes: Number(prep) || 20, accepts_delivery: delivery, min_order: Number(minOrder.replace(/[^\d]/g, '')) || 0,
      })
      await onDone(v.id)
    } catch (e) {
      setErr(errText(e, 'ساخت مجموعه ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-tile-soft text-tile grid place-items-center"><Icon size={22} /></span>
          <p className="font-semibold">اطلاعات {TITLES[kind]}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField className="sm:col-span-2" label="نام *" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'cafe' ? 'مثلاً کافه لابی' : 'مثلاً رستوران برج'} maxLength={80} />
          <TextArea className="sm:col-span-2" label="توضیح کوتاه (اختیاری)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="w-4 h-4" /> همه‌ی ساعت‌ها باز است
          </label>
          {!allDay && (
            <>
              <TextField label="ساعت شروع" type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
              <TextField label="ساعت پایان" type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </>
          )}
          <TextField label="زمان آماده‌سازی (دقیقه)" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/[^\d]/g, ''))} />
          <TextField label="حداقل مبلغ سفارش (تومان)" inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/[^\d]/g, ''))} placeholder="۰ = بدون حداقل" />
          <label className="sm:col-span-2 flex items-start gap-2.5 p-3 rounded-xl border border-line cursor-pointer">
            <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} className="mt-0.5 w-4 h-4" />
            <span className="text-sm"><b>تحویل در واحد</b><span className="block text-xs text-muted mt-0.5">اگر خاموش باشد، سفارش فقط به مناطق مشاعات (استخر، سالن…) تحویل می‌شود.</span></span>
          </label>
        </div>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex justify-end">
          <PrimaryButton disabled={busy || name.trim().length < 2} onClick={submit}>{busy ? 'در حال ساخت…' : `ساخت ${TITLES[kind]}`}</PrimaryButton>
        </div>
      </div>
    </Card>
  )
}

// ───────────────────────── نوار وضعیت مجموعه ─────────────────────────

function VenueBar({ venue, kind, onChanged, toast }: { venue: Venue; kind: VenueKind; onChanged: (id?: string) => Promise<void>; toast: (m: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  async function toggleOpen() {
    setBusy(true)
    try {
      await fnbApi.updateVenue(venue.id, { is_open: !venue.is_open })
      await onChanged()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Card>
        <div className="p-4 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-full sm:basis-0">
            <p className="font-semibold">{venue.name}</p>
            <p className="text-xs text-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><Clock size={12} />{venue.opens_at && venue.closes_at ? `${fa(venue.opens_at)} تا ${fa(venue.closes_at)}` : 'همیشه باز'}</span>
              <span>آماده‌سازی {fa(venue.prep_time_minutes)} دقیقه</span>
              {venue.min_order > 0 && <span>حداقل سفارش {toman(venue.min_order)}</span>}
              <span className="inline-flex items-center gap-1"><Truck size={12} />{venue.accepts_delivery ? 'تحویل در واحد' : 'فقط مشاعات'}</span>
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full ${venue.is_active && venue.open_now ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`}>
            {!venue.is_active ? 'غیرفعال' : venue.open_now ? 'باز است' : 'بسته است'}
          </span>
          {venue.is_active && (
            <button onClick={toggleOpen} disabled={busy} className="text-xs font-medium px-3 py-2 rounded-lg border border-line min-h-[40px] disabled:opacity-60">
              {venue.is_open ? 'بستن موقت' : 'باز کردن'}
            </button>
          )}
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-medium text-tile hover:bg-tile-soft px-3 py-2 rounded-lg min-h-[40px]">
            <Settings2 size={14} /> تنظیمات
          </button>
        </div>
      </Card>
      {editing && <VenueEditor venue={venue} kind={kind} onClose={() => setEditing(false)} onChanged={onChanged} toast={toast} />}
    </>
  )
}

function VenueEditor({ venue, kind, onClose, onChanged, toast }: { venue: Venue; kind: VenueKind; onClose: () => void; onChanged: (id?: string) => Promise<void>; toast: (m: string) => void }) {
  const [name, setName] = useState(venue.name)
  const [description, setDescription] = useState(venue.description ?? '')
  const [allDay, setAllDay] = useState(!venue.opens_at)
  const [opens, setOpens] = useState(venue.opens_at ?? '08:00')
  const [closes, setCloses] = useState(venue.closes_at ?? '23:00')
  const [prep, setPrep] = useState(String(venue.prep_time_minutes))
  const [minOrder, setMinOrder] = useState(venue.min_order ? String(venue.min_order) : '')
  const [delivery, setDelivery] = useState(venue.accepts_delivery)
  const [active, setActive] = useState(venue.is_active)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    setBusy(true)
    setErr('')
    try {
      await fnbApi.updateVenue(venue.id, {
        name: name.trim(), description: description.trim() || null,
        opens_at: allDay ? null : opens, closes_at: allDay ? null : closes,
        prep_time_minutes: Number(prep) || 20, min_order: Number(minOrder.replace(/[^\d]/g, '')) || 0,
        accepts_delivery: delivery, is_active: active,
      })
      await onChanged()
      toast('تنظیمات ذخیره شد')
      onClose()
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    try {
      const r = await fnbApi.deleteVenue(venue.id)
      toast(r.deleted ? 'مجموعه حذف شد' : 'به‌دلیل سفارش‌های قبلی، مجموعه غیرفعال شد')
      await onChanged()
      onClose()
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`تنظیمات ${TITLES[kind]}`}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={busy || name.trim().length < 2} onClick={save}>ذخیره</PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField className="sm:col-span-2" label="نام *" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <TextArea className="sm:col-span-2" label="توضیح" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="w-4 h-4" /> همه‌ی ساعت‌ها باز است</label>
        {!allDay && (
          <>
            <TextField label="ساعت شروع" type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
            <TextField label="ساعت پایان" type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </>
        )}
        <TextField label="زمان آماده‌سازی (دقیقه)" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/[^\d]/g, ''))} />
        <TextField label="حداقل مبلغ سفارش (تومان)" inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/[^\d]/g, ''))} />
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} className="w-4 h-4" /> تحویل در واحد فعال است</label>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" /> مجموعه فعال است (برای ساکنین نمایش داده می‌شود)</label>
      </div>
      {err && <p className="text-sm text-bad mt-3">{err}</p>}
      <div className="mt-5 pt-4 border-t border-line">
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} className="text-sm text-bad flex items-center gap-1.5"><Trash2 size={14} /> حذف مجموعه</button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm">منو و دسته‌ها هم حذف می‌شود (اگر سفارشی ثبت شده باشد فقط غیرفعال می‌شود). مطمئنید؟</p>
            <PrimaryButton className="!bg-bad" disabled={busy} onClick={remove}>بله، حذف شود</PrimaryButton>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ───────────────────────── منو ─────────────────────────

function MenuTab({ venue, kind, toast }: { venue: Venue; kind: VenueKind; toast: (m: string) => void }) {
  const [menu, setMenu] = useState<MenuResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MenuItem | null>(null)
  const [cat, setCat] = useState<string>('') // '' = همه
  const [catEditor, setCatEditor] = useState<MenuCategory | 'new' | null>(null)

  const load = useCallback(async () => {
    try {
      setMenu(await fnbApi.menu(venue.id, true))
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت منو ناموفق بود'))
    }
  }, [venue.id])
  useEffect(() => { void load() }, [load])

  const act = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast(ok)
      await load()
    } catch (e) {
      toast(errText(e))
    }
  }, [load, toast])

  const items = useMemo(() => menu?.items ?? [], [menu])
  const categories = menu?.categories ?? []
  const shown = cat === '' ? items : cat === '__none' ? items.filter((i) => !i.category_id) : items.filter((i) => i.category_id === cat)
  const special = items.find((i) => i.is_daily_special)
  const Icon = kind === 'cafe' ? Coffee : UtensilsCrossed

  if (error && !menu) return <ErrorBlock message={error} retry={load} />
  if (!menu) return <Loading />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => setCat('')} className={`px-3.5 py-2 rounded-xl text-sm border min-h-[40px] ${cat === '' ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>
            همه ({fa(items.length)})
          </button>
          {categories.map((c) => (
            <span key={c.id} className={`inline-flex items-center rounded-xl border min-h-[40px] ${cat === c.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>
              <button onClick={() => setCat(c.id)} className="pr-3.5 pl-1.5 py-2 text-sm">{c.name}</button>
              <button onClick={() => setCatEditor(c)} aria-label={`ویرایش دسته ${c.name}`} className="px-2 py-2 opacity-70 hover:opacity-100"><Pencil size={12} /></button>
            </span>
          ))}
          {items.some((i) => !i.category_id) && categories.length > 0 && (
            <button onClick={() => setCat('__none')} className={`px-3.5 py-2 rounded-xl text-sm border min-h-[40px] ${cat === '__none' ? 'bg-ink text-white border-ink' : 'border-line'}`}>بدون دسته</button>
          )}
          <button onClick={() => setCatEditor('new')} className="px-3 py-2 rounded-xl text-sm border border-dashed border-line text-tile min-h-[40px] flex items-center gap-1"><Plus size={14} /> دسته</button>
        </div>
        <PrimaryButton onClick={() => setEditing('new')}><Plus size={16} /> آیتم جدید</PrimaryButton>
      </div>

      {special && (
        <div className="flex items-center gap-3 bg-brass-soft text-brass rounded-2xl px-4 py-3 text-sm">
          <Star size={18} className="shrink-0 fill-current" />
          <span className="flex-1">غذای روز: <b>{special.name}</b> — برای ساکنین اعلان شده است</span>
          <button onClick={() => act(() => fnbApi.updateItem(special.id, { is_daily_special: false }))} className="text-xs font-medium hover:underline">برداشتن</button>
        </div>
      )}

      {shown.length === 0 ? (
        <Card>
          <div className="p-10 text-center space-y-3">
            <span className="w-14 h-14 rounded-2xl bg-tile-soft text-tile grid place-items-center mx-auto"><Icon size={26} /></span>
            <p className="text-sm font-medium">{items.length === 0 ? 'منو هنوز خالی است' : 'آیتمی در این دسته نیست'}</p>
            {items.length === 0 && <p className="text-xs text-muted">اول یک دسته (مثلاً «غذای اصلی») و بعد اولین آیتم را اضافه کنید.</p>}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((m) => (
            <Card key={m.id} className={m.availability === 'hidden' ? 'opacity-60' : ''}>
              <div className="p-3 flex gap-3">
                {m.image_url ? (
                  <img src={m.image_url} alt={m.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />
                ) : (
                  <span className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0 bg-tile-soft text-tile"><Icon size={30} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    <p className="font-semibold text-sm flex-1">{m.name}</p>
                    {m.is_daily_special && <Star size={15} className="text-brass fill-current shrink-0" aria-label="غذای روز" />}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{m.category_name ?? 'بدون دسته'} · {m.price ? `${toman(m.price)} تومان` : 'رایگان'}</p>
                  <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full mt-1.5 ${availabilityInfo[m.availability].cls}`}>{availabilityInfo[m.availability].label}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 px-3 pb-3 flex-wrap">
                {m.availability === 'available' ? (
                  <button onClick={() => act(() => fnbApi.setAvailability(m.id, 'sold_out'))} className="text-xs font-medium text-warn bg-warn-soft px-2.5 py-2 rounded-lg">اعلام ناموجود</button>
                ) : (
                  <button onClick={() => act(() => fnbApi.setAvailability(m.id, 'available'))} className="text-xs font-medium text-good bg-good-soft px-2.5 py-2 rounded-lg">اعلام موجود</button>
                )}
                <button
                  onClick={() => act(() => fnbApi.setAvailability(m.id, m.availability === 'hidden' ? 'available' : 'hidden'))}
                  className="flex items-center gap-1 text-xs font-medium text-muted hover:bg-canvas px-2 py-2 rounded-lg"
                >
                  {m.availability === 'hidden' ? <Eye size={13} /> : <EyeOff size={13} />}
                  {m.availability === 'hidden' ? 'نمایش' : 'مخفی'}
                </button>
                <button onClick={() => setEditing(m)} className="flex items-center gap-1 text-xs font-medium text-tile hover:bg-tile-soft px-2 py-2 rounded-lg" aria-label={`ویرایش ${m.name}`}>
                  <Pencil size={13} /> ویرایش
                </button>
                <button onClick={() => setDeleting(m)} className="mr-auto p-2 rounded-lg text-bad hover:bg-bad-soft" aria-label={`حذف ${m.name}`}><Trash2 size={14} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ItemEditor
          item={editing === 'new' ? null : editing}
          venue={venue}
          categories={categories}
          defaultCategory={cat && cat !== '__none' ? cat : categories[0]?.id ?? ''}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast(msg); await load() }}
        />
      )}

      {catEditor && (
        <CategoryEditor
          venueId={venue.id}
          category={catEditor === 'new' ? null : catEditor}
          onClose={() => setCatEditor(null)}
          onSaved={async (msg) => { setCatEditor(null); toast(msg); await load() }}
          onDeleted={async () => { setCatEditor(null); setCat(''); toast('دسته حذف شد؛ آیتم‌ها بدون دسته ماندند'); await load() }}
        />
      )}

      <Modal
        open={!!deleting}
        title="حذف آیتم منو"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <GhostButton onClick={() => setDeleting(null)}>انصراف</GhostButton>
            <PrimaryButton
              className="!bg-bad"
              onClick={async () => {
                const d = deleting
                setDeleting(null)
                if (d) await act(async () => { const r = await fnbApi.deleteItem(d.id); toast(r.deleted ? 'آیتم حذف شد' : 'این آیتم در سفارش‌های قبلی هست؛ فقط از منو مخفی شد') })
              }}
            >
              حذف
            </PrimaryButton>
          </>
        }
      >
        <p className="text-sm">«{deleting?.name}» از منو حذف شود؟ اگر فقط موقتاً نیست، «اعلام ناموجود» یا «مخفی» را بزنید.</p>
      </Modal>
    </div>
  )
}

function CategoryEditor({ venueId, category, onClose, onSaved, onDeleted }: {
  venueId: string; category: MenuCategory | null; onClose: () => void; onSaved: (msg: string, newId?: string) => Promise<void>; onDeleted: () => Promise<void>
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true)
    setErr('')
    try {
      if (category) {
        await fnbApi.updateCategory(category.id, { name: name.trim() })
        await onSaved('دسته ذخیره شد')
      } else {
        const c = await fnbApi.createCategory(venueId, name.trim())
        await onSaved('دسته ساخته شد', c.id)
      }
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }
  async function del() {
    if (!category) return
    setBusy(true)
    try {
      await fnbApi.deleteCategory(category.id)
      await onDeleted()
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      title={category ? 'ویرایش دسته' : 'دسته‌ی جدید'}
      onClose={onClose}
      footer={
        <>
          {category && <button onClick={del} disabled={busy} className="ml-auto text-sm text-bad flex items-center gap-1"><Trash2 size={14} /> حذف دسته</button>}
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={busy || !name.trim()} onClick={save}>ذخیره</PrimaryButton>
        </>
      }
    >
      <TextField label="نام دسته" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="مثلاً غذای اصلی، نوشیدنی گرم" />
      {err && <p className="text-sm text-bad mt-3">{err}</p>}
    </Modal>
  )
}

function ItemEditor({ item, venue, categories, defaultCategory, onClose, onSaved }: {
  item: MenuItem | null
  venue: Venue
  categories: MenuCategory[]
  defaultCategory: string
  onClose: () => void
  onSaved: (msg: string) => Promise<void>
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(item ? String(item.price) : '')
  const [categoryId, setCategoryId] = useState(item ? item.category_id ?? '' : defaultCategory)
  const [description, setDescription] = useState(item?.description ?? '')
  const [image, setImage] = useState<string | null>(item?.image_url ?? null)
  const [prep, setPrep] = useState(item?.prep_time_minutes ? String(item.prep_time_minutes) : '')
  const [availability, setAvailability] = useState<Availability>(item?.availability ?? 'available')
  const [special, setSpecial] = useState(item?.is_daily_special ?? false)
  const [imgError, setImgError] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const Icon = venue.kind === 'cafe' ? Coffee : ShoppingBag

  async function onFile(f?: File) {
    if (!f) return
    setImgError('')
    if (f.size > 8 * 1024 * 1024) return setImgError('حجم عکس بیشتر از ۸ مگابایت است')
    try {
      setImage(await resizeImage(f))
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'عکس بارگذاری نشد')
    }
  }

  async function save() {
    setBusy(true)
    setErr('')
    const body = {
      name: name.trim(), price: Number(price.replace(/[^\d]/g, '')) || 0, category_id: categoryId || null,
      description: description.trim() || null, image_url: image, prep_time_minutes: prep ? Number(prep) : null, availability, is_daily_special: special,
    }
    try {
      if (item) await fnbApi.updateItem(item.id, body)
      else await fnbApi.createItem({ ...body, venue_id: venue.id })
      await onSaved(item ? 'آیتم ذخیره شد' : 'آیتم به منو اضافه شد')
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={item ? `ویرایش «${item.name}»` : 'آیتم جدید منو'}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={busy || !name.trim()} onClick={save}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-4 items-start flex-wrap sm:flex-nowrap">
          <div className="shrink-0 space-y-2 text-center">
            {image ? (
              <div className="relative">
                <img src={image} alt="" className="w-28 h-28 rounded-2xl object-cover" />
                <button onClick={() => setImage(null)} className="absolute -top-2 -left-2 bg-card border border-line rounded-full p-1 text-bad" aria-label="حذف عکس"><X size={13} /></button>
              </div>
            ) : (
              <span className="w-28 h-28 rounded-2xl flex items-center justify-center bg-tile-soft text-tile"><Icon size={40} /></span>
            )}
            <label className="inline-flex items-center gap-1 text-xs font-medium text-tile cursor-pointer hover:underline">
              <ImagePlus size={14} /> {image ? 'تغییر عکس' : 'افزودن عکس'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {imgError && <p className="text-[11px] text-bad max-w-28">{imgError}</p>}
          </div>
          <div className="flex-1 min-w-[220px] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField className="sm:col-span-2" label="نام آیتم *" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
            <TextField label="قیمت (تومان)" inputMode="numeric" value={price ? Number(price.replace(/[^\d]/g, '')).toLocaleString('en-US') : ''} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="مثلاً 120,000" />
            <TextField label="زمان آماده‌سازی (دقیقه)" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/[^\d]/g, ''))} placeholder={`پیش‌فرض ${fa(venue.prep_time_minutes)}`} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="دسته"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[{ value: '', label: 'بدون دسته' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <SelectField
            label="وضعیت"
            value={availability}
            onChange={(e) => setAvailability(e.target.value as Availability)}
            options={(Object.keys(availabilityInfo) as Availability[]).map((k) => ({ value: k, label: availabilityInfo[k].label }))}
          />
          <TextArea className="sm:col-span-2" label="توضیح کوتاه (اختیاری)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={400} />
        </div>

        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-brass/40 bg-brass-soft/40 cursor-pointer">
          <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-brass)]" />
          <span className="text-sm">
            <b>غذای روز</b>
            <span className="block text-xs text-muted mt-0.5">با ذخیره، برای همه‌ی ساکنین اعلان ارسال می‌شود و در منو بالاتر از بقیه نمایش داده می‌شود (فقط یک غذای روز در هر مجموعه).</span>
          </span>
        </label>
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  )
}

// ───────────────────────── مناطق تحویل ─────────────────────────

function ZonesTab({ toast }: { toast: (m: string) => void }) {
  const [zones, setZones] = useState<DeliveryZone[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<DeliveryZone | 'new' | null>(null)

  const load = useCallback(async () => {
    try {
      setZones((await fnbApi.zones(true)).filter((z) => z.zone_type === 'amenity_zone'))
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت مناطق ناموفق بود'))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (error && !zones) return <ErrorBlock message={error} retry={load} />
  if (!zones) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted max-w-xl">مناطقی از مشاعات (استخر، سالن، روف‌گاردن…) که سفارش می‌تواند به آن‌ها تحویل شود. این فهرست برای همه‌ی رستوران‌ها و کافی‌شاپ‌های ساختمان مشترک است.</p>
        <PrimaryButton onClick={() => setEditing('new')}><Plus size={16} /> منطقه‌ی جدید</PrimaryButton>
      </div>
      {zones.length === 0 ? (
        <Card><p className="p-10 text-center text-sm text-muted">هنوز منطقه‌ای تعریف نشده؛ سفارش فقط به واحد تحویل می‌شود.</p></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {zones.map((z) => (
            <Card key={z.id} className={z.is_active ? '' : 'opacity-60'}>
              <div className="p-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-tile-soft text-tile grid place-items-center shrink-0"><Truck size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{z.name}</p>
                  <p className="text-xs text-muted mt-0.5">{z.surcharge > 0 ? `هزینه‌ی تحویل ${toman(z.surcharge)} تومان` : 'بدون هزینه‌ی تحویل'}{!z.is_active && ' · غیرفعال'}</p>
                </div>
                <button onClick={() => setEditing(z)} className="p-2 rounded-lg text-tile hover:bg-tile-soft" aria-label={`ویرایش ${z.name}`}><Pencil size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <ZoneEditor
          zone={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={async (msg) => { setEditing(null); toast(msg); await load() }}
        />
      )}
    </div>
  )
}

function ZoneEditor({ zone, onClose, onDone }: { zone: DeliveryZone | null; onClose: () => void; onDone: (m: string) => Promise<void> }) {
  const [name, setName] = useState(zone?.name ?? '')
  const [surcharge, setSurcharge] = useState(zone ? String(zone.surcharge) : '')
  const [active, setActive] = useState(zone?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true)
    setErr('')
    const s = Number(surcharge.replace(/[^\d]/g, '')) || 0
    try {
      if (zone) await fnbApi.updateZone(zone.id, { name: name.trim(), surcharge: s, is_active: active })
      else await fnbApi.createZone({ name: name.trim(), surcharge: s })
      await onDone('منطقه ذخیره شد')
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }
  async function del() {
    if (!zone) return
    setBusy(true)
    try {
      const r = await fnbApi.deleteZone(zone.id)
      await onDone(r.deleted ? 'منطقه حذف شد' : 'به‌دلیل سفارش‌های قبلی، منطقه غیرفعال شد')
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      title={zone ? 'ویرایش منطقه' : 'منطقه‌ی تحویل جدید'}
      onClose={onClose}
      footer={
        <>
          {zone && <button onClick={del} disabled={busy} className="ml-auto text-sm text-bad flex items-center gap-1"><Trash2 size={14} /> حذف</button>}
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={busy || !name.trim()} onClick={save}>ذخیره</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="نام منطقه" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="مثلاً استخر" />
        <TextField label="هزینه‌ی تحویل (تومان)" inputMode="numeric" value={surcharge} onChange={(e) => setSurcharge(e.target.value.replace(/[^\d]/g, ''))} placeholder="۰ = رایگان" />
        {zone && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" /> فعال</label>}
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  )
}
