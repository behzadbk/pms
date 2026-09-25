import { useMemo, useState } from 'react'
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Star, Trash2, X, ShoppingBag } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Modal, TextField, TextArea, SelectField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { toman, fnbVenues } from '../../lib/mockData'
import { foodIcon } from '../../lib/foodIcons'
import { useStore, saveMenuItem, deleteMenuItem, setMenuAvailability, uid } from '../../lib/store'
import { venueByKey, type VenueKey } from '../../lib/staff'
import type { ItemAvailability, MenuItem } from '../../lib/types'

const availabilityInfo: Record<ItemAvailability, { label: string; cls: string }> = {
  available: { label: 'موجود', cls: 'bg-good-soft text-good' },
  sold_out: { label: 'ناموجود (تمام شد)', cls: 'bg-warn-soft text-warn' },
  hidden: { label: 'مخفی از منو', cls: 'bg-canvas text-muted' },
}

const iconChoices = ['burger', 'pasta', 'steak', 'egg', 'cake', 'icecream', 'espresso', 'latte', 'iced-coffee', 'tea', 'croissant']
const colorChoices = ['#c9a227', '#0e9594', '#c0392b', '#b8860b', '#4c6ef5', '#7a5c3e', '#1d9a6c']

/** کوچک‌کردن عکس قبل از ذخیره (حداکثر ۴۸۰ پیکسل، JPEG) تا حافظه و حجم انتقال کم بماند */
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
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function StaffMenuManager({ venue: venueKey }: { venue: VenueKey }) {
  const { menu } = useStore()
  const { venueId, title } = venueByKey[venueKey]
  const venue = fnbVenues.find((v) => v.id === venueId)!
  const items = menu.filter((m) => m.venueId === venueId)
  const categories = useMemo(() => {
    const fromItems = items.map((m) => m.category)
    return [...new Set([...venue.categories.filter((c) => c !== 'همه'), ...fromItems])]
  }, [items, venue.categories])

  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [deleting, setDeleting] = useState<MenuItem | null>(null)
  const [cat, setCat] = useState('')
  const shown = cat ? items.filter((i) => i.category === cat) : items
  const special = items.find((i) => i.isDailySpecial)

  function openNew() {
    setEditing({
      id: uid('m'),
      venueId,
      category: cat || categories[0] || 'سایر',
      name: '',
      price: 0,
      icon: venueKey === 'cafe' ? 'latte' : 'burger',
      color: colorChoices[0],
      availability: 'available',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">منوی {title}</h1>
          <p className="text-muted text-sm mt-1">افزودن و ویرایش آیتم‌ها، عکس و قیمت، ناموجود کردن و انتخاب غذای روز</p>
        </div>
        <PrimaryButton onClick={openNew}>
          <Plus size={16} /> آیتم جدید
        </PrimaryButton>
      </div>

      {special && (
        <div className="flex items-center gap-3 bg-brass-soft text-brass rounded-2xl px-4 py-3 text-sm">
          <Star size={18} className="shrink-0 fill-current" />
          <span className="flex-1">
            غذای روز: <b>{special.name}</b> — برای ساکنین اعلان شده است
          </span>
          <button onClick={() => saveMenuItem({ ...special, isDailySpecial: false })} className="text-xs font-medium hover:underline">
            برداشتن
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCat('')} className={`px-3.5 py-2 rounded-xl text-sm border ${cat === '' ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>
          همه ({items.length.toLocaleString('fa-IR')})
        </button>
        {categories.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-3.5 py-2 rounded-xl text-sm border ${cat === c ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink-soft'}`}>
            {c}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card><p className="p-10 text-center text-sm text-muted">آیتمی در این دسته نیست</p></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((m) => {
            const Icon = foodIcon[m.icon] ?? ShoppingBag
            return (
              <Card key={m.id} className={m.availability === 'hidden' ? 'opacity-60' : ''}>
                <div className="p-3 flex gap-3">
                  {m.image ? (
                    <img src={m.image} alt={m.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />
                  ) : (
                    <span className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0" style={{ color: m.color, background: `${m.color}1a` }}>
                      <Icon size={30} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <p className="font-semibold text-sm flex-1">{m.name}</p>
                      {m.isDailySpecial && <Star size={15} className="text-brass fill-current shrink-0" aria-label="غذای روز" />}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{m.category} · {m.price ? toman(m.price) : 'بدون قیمت'}</p>
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full mt-1.5 ${availabilityInfo[m.availability].cls}`}>
                      {availabilityInfo[m.availability].label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 px-3 pb-3 flex-wrap">
                  {m.availability === 'available' ? (
                    <button onClick={() => setMenuAvailability(m.id, 'sold_out')} className="text-xs font-medium text-warn bg-warn-soft px-2.5 py-1.5 rounded-lg">
                      اعلام ناموجود
                    </button>
                  ) : (
                    <button onClick={() => setMenuAvailability(m.id, 'available')} className="text-xs font-medium text-good bg-good-soft px-2.5 py-1.5 rounded-lg">
                      اعلام موجود
                    </button>
                  )}
                  <button
                    onClick={() => setMenuAvailability(m.id, m.availability === 'hidden' ? 'available' : 'hidden')}
                    className="flex items-center gap-1 text-xs font-medium text-muted hover:bg-canvas px-2 py-1.5 rounded-lg"
                    title={m.availability === 'hidden' ? 'نمایش در منو' : 'خارج کردن از منو'}
                  >
                    {m.availability === 'hidden' ? <Eye size={13} /> : <EyeOff size={13} />}
                    {m.availability === 'hidden' ? 'نمایش' : 'مخفی'}
                  </button>
                  <button onClick={() => setEditing({ ...m })} className="flex items-center gap-1 text-xs font-medium text-tile hover:bg-tile-soft px-2 py-1.5 rounded-lg" aria-label={`ویرایش ${m.name}`}>
                    <Pencil size={13} /> ویرایش
                  </button>
                  <button onClick={() => setDeleting(m)} className="mr-auto p-1.5 rounded-lg text-bad hover:bg-bad-soft" aria-label={`حذف ${m.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          categories={categories}
          isNew={!items.some((i) => i.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(it) => {
            // فقط یک غذای روز در هر venue
            if (it.isDailySpecial) items.filter((x) => x.isDailySpecial && x.id !== it.id).forEach((x) => saveMenuItem({ ...x, isDailySpecial: false }))
            saveMenuItem(it)
            setEditing(null)
          }}
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
              onClick={() => {
                if (deleting) deleteMenuItem(deleting.id)
                setDeleting(null)
              }}
            >
              حذف
            </PrimaryButton>
          </>
        }
      >
        <p className="text-sm">«{deleting?.name}» برای همیشه از منو حذف شود؟ اگر فقط موقتاً نیست، «تمام شد» یا «مخفی» را بزنید.</p>
      </Modal>
    </div>
  )
}

function ItemEditor({
  item,
  categories,
  isNew,
  onClose,
  onSave,
}: {
  item: MenuItem
  categories: string[]
  isNew: boolean
  onClose: () => void
  onSave: (m: MenuItem) => void
}) {
  const [m, setM] = useState<MenuItem>(item)
  // null = انتخاب از دسته‌های موجود؛ رشته = تایپ دسته‌ی جدید
  const [newCat, setNewCat] = useState<string | null>(categories.includes(item.category) ? null : item.category)
  const [imgError, setImgError] = useState('')
  const set = (p: Partial<MenuItem>) => setM((x) => ({ ...x, ...p }))
  const category = newCat !== null ? newCat.trim() : m.category
  const valid = m.name.trim() && category
  const Icon = foodIcon[m.icon] ?? ShoppingBag

  async function onFile(f?: File) {
    if (!f) return
    setImgError('')
    if (f.size > 8 * 1024 * 1024) return setImgError('حجم عکس بیشتر از ۸ مگابایت است')
    try {
      set({ image: await resizeImage(f) })
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'عکس بارگذاری نشد')
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={isNew ? 'آیتم جدید منو' : `ویرایش «${item.name}»`}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>انصراف</GhostButton>
          <PrimaryButton disabled={!valid} onClick={() => onSave({ ...m, name: m.name.trim(), category, description: m.description?.trim() || undefined })}>
            ذخیره
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-4 items-start">
          <div className="shrink-0 space-y-2 text-center">
            {m.image ? (
              <div className="relative">
                <img src={m.image} alt="" className="w-28 h-28 rounded-2xl object-cover" />
                <button onClick={() => set({ image: undefined })} className="absolute -top-2 -left-2 bg-card border border-line rounded-full p-1 text-bad" aria-label="حذف عکس">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <span className="w-28 h-28 rounded-2xl flex items-center justify-center" style={{ color: m.color, background: `${m.color}1a` }}>
                <Icon size={40} />
              </span>
            )}
            <label className="inline-flex items-center gap-1 text-xs font-medium text-tile cursor-pointer hover:underline">
              <ImagePlus size={14} /> {m.image ? 'تغییر عکس' : 'افزودن عکس'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {imgError && <p className="text-[11px] text-bad max-w-28">{imgError}</p>}
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField className="sm:col-span-2" label="نام آیتم *" value={m.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
            <TextField
              label="قیمت (تومان) — اختیاری"
              inputMode="numeric"
              value={m.price ? m.price.toLocaleString('en-US') : ''}
              onChange={(e) => set({ price: Number(e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '')) || 0 })}
              placeholder="خالی = بدون قیمت"
            />
            <SelectField
              label="وضعیت"
              value={m.availability}
              onChange={(e) => set({ availability: e.target.value as ItemAvailability })}
              options={(Object.keys(availabilityInfo) as ItemAvailability[]).map((k) => ({ value: k, label: availabilityInfo[k].label }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="دسته"
            value={newCat !== null ? '__new' : m.category}
            onChange={(e) => {
              if (e.target.value === '__new') return setNewCat('')
              setNewCat(null)
              set({ category: e.target.value })
            }}
            options={[...categories.map((c) => ({ value: c, label: c })), { value: '__new', label: '+ دسته‌ی جدید' }]}
          />
          {newCat !== null ? (
            <TextField label="نام دسته‌ی جدید" value={newCat} onChange={(e) => setNewCat(e.target.value)} autoFocus />
          ) : (
            <div />
          )}
          <TextArea className="sm:col-span-2" label="توضیح کوتاه (اختیاری)" value={m.description ?? ''} onChange={(e) => set({ description: e.target.value })} rows={2} />
        </div>

        {!m.image && (
          <div className="space-y-2">
            <p className="text-xs text-muted">آیکون و رنگ (وقتی عکس ندارد)</p>
            <div className="flex flex-wrap gap-1.5">
              {iconChoices.map((ic) => {
                const I = foodIcon[ic] ?? ShoppingBag
                return (
                  <button key={ic} type="button" onClick={() => set({ icon: ic })} className={`p-2 rounded-lg border ${m.icon === ic ? 'border-tile bg-tile-soft' : 'border-line'}`} aria-label={ic}>
                    <I size={18} />
                  </button>
                )
              })}
            </div>
            <div className="flex gap-1.5">
              {colorChoices.map((c) => (
                <button key={c} type="button" onClick={() => set({ color: c })} className={`w-6 h-6 rounded-full border-2 ${m.color === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
              ))}
            </div>
          </div>
        )}

        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-brass/40 bg-brass-soft/40 cursor-pointer">
          <input type="checkbox" checked={!!m.isDailySpecial} onChange={(e) => set({ isDailySpecial: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[var(--color-brass)]" />
          <span className="text-sm">
            <b>غذای روز</b>
            <span className="block text-xs text-muted mt-0.5">با ذخیره، برای همه‌ی ساکنین اعلان داخل برنامه ارسال می‌شود و در منو بالاتر از بقیه نمایش داده می‌شود.</span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
