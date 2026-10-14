import { useEffect, useState } from 'react'
import { HandHelping, Pencil, Plus, Trash2 } from 'lucide-react'
import { departmentsApi, serviceDeskApi } from '../../lib/api'
import type { ServiceType } from '../../lib/api/serviceDesk'
import { errText } from '../../lib/api/residents'
import { SERVICE_ICONS, serviceIcon } from '../../lib/serviceIcons'
import { SelectField, TextAreaField } from '../shared/maintenanceUi'
import { ServiceDeskView } from '../staff/ServiceDesk'
import { Badge, Cta, EmptyState, ErrorBlock, Field, FieldCard, Loading, PageTitle, Seg, Sheet, Toggle, useLoad, useToast } from '../../components/hm'

type Tab = 'requests' | 'catalog'
interface Form { id?: string; title: string; icon: string; description: string; department_code: string; is_active: boolean }

/** مرکز خدمات: پایش همه‌ی درخواست‌ها + تعریف خدمات و وصل‌کردن هرکدام به یک دپارتمان (بدون پنل جدا برای هر خدمت). */
export function AdminServices() {
  const [tab, setTab] = useState<Tab>('requests')
  const { toast, toastNode } = useToast()
  useEffect(() => {
    document.title = 'خدمات ساختمان · همین'
  }, [])
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="مدیریت" title="خدمات ساختمان" />
      <Seg<Tab> options={[['requests', 'درخواست‌ها'], ['catalog', 'تعریف خدمات']]} value={tab} onChange={setTab} />
      {tab === 'requests' ? <ServiceDeskView toast={toast} /> : <Catalog toast={toast} />}
      {toastNode}
    </div>
  )
}

function Catalog({ toast }: { toast: (m: string) => void }) {
  const types = useLoad<ServiceType[]>(() => serviceDeskApi.types.list(true), [])
  const deps = useLoad(() => departmentsApi.list(), [])
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)

  const empty = (): Form => ({ title: '', icon: 'other', description: '', department_code: deps.data?.find((d) => d.isActive)?.code ?? '', is_active: true })

  async function save() {
    if (!form) return
    if (form.title.trim().length < 2) return toast('عنوان خدمت را بنویسید')
    if (!form.department_code) return toast('دپارتمان مسئول را انتخاب کنید')
    setBusy(true)
    try {
      const body = { title: form.title.trim(), icon: form.icon, description: form.description.trim(), department_code: form.department_code, is_active: form.is_active }
      if (form.id) await serviceDeskApi.types.update(form.id, body)
      else await serviceDeskApi.types.create(body)
      setForm(null)
      void types.reload(true)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }
  async function remove(t: ServiceType) {
    try {
      await serviceDeskApi.types.remove(t.id)
      toast('خدمت حذف شد')
      void types.reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  if (types.loading || deps.loading) return <Loading />
  if (types.error || !types.data) return <ErrorBlock message={types.error ?? ''} retry={() => void types.reload()} />

  return (
    <div className="flex flex-col gap-3">
      <Cta onClick={() => setForm(empty())}>
        <Plus size={18} aria-hidden /> تعریف خدمت جدید
      </Cta>
      {types.data.length === 0 ? (
        <EmptyState icon={HandHelping} title="هنوز خدمتی تعریف نشده" sub="مثلاً «کارواش» را به دپارتمان «کارواش» وصل کنید؛ درخواست ساکنین به مدیر همان دپارتمان می‌رسد." tone="mute" />
      ) : (
        <div className="hm-card px-4 py-1 hm-divided">
          {types.data.map((t) => {
            const Icon = serviceIcon(t.icon)
            return (
              <div key={t.id} className="py-3 flex items-center gap-3">
                <span className="grid place-items-center w-11 h-11 rounded-2xl hm-tone-pri shrink-0">
                  <Icon size={20} aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{t.title}</p>
                  <p className="text-xs text-[var(--hm-t2)] mt-0.5">
                    {t.department_name ?? t.department_code} · {t.manager_name ? `مدیر: ${t.manager_name}` : 'بدون مدیر (به شما می‌رسد)'}
                  </p>
                </div>
                {!t.is_active && <Badge tone="mute">غیرفعال</Badge>}
                <button
                  className="min-h-[44px] min-w-[44px] grid place-items-center"
                  aria-label={`ویرایش ${t.title}`}
                  onClick={() => setForm({ id: t.id, title: t.title, icon: t.icon ?? 'other', description: t.description ?? '', department_code: t.department_code, is_active: t.is_active })}
                >
                  <Pencil size={18} />
                </button>
                <button className="min-h-[44px] min-w-[44px] grid place-items-center text-[var(--hm-bad)]" aria-label={`حذف ${t.title}`} onClick={() => void remove(t)}>
                  <Trash2 size={18} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} label="تعریف خدمت">
        {form && (
          <>
            <p className="text-lg font-bold">{form.id ? 'ویرایش خدمت' : 'خدمت جدید'}</p>
            <div className="mt-3">
              <FieldCard>
                <Field label="عنوان" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="مثلاً کارواش" />
                <SelectField
                  label="دپارتمان مسئول"
                  value={form.department_code}
                  onChange={(v) => setForm({ ...form, department_code: v })}
                  options={[{ value: '', label: 'انتخاب کنید…' }, ...(deps.data ?? []).filter((d) => d.isActive).map((d) => ({ value: d.code, label: d.name }))]}
                />
                <SelectField label="آیکن" value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} options={Object.entries(SERVICE_ICONS).map(([value, x]) => ({ value, label: x.label }))} />
                <TextAreaField label="توضیح برای ساکن (اختیاری)" value={form.description} onChange={(v) => setForm({ ...form, description: v })} maxLength={300} rows={2} />
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">فعال (ساکنین می‌بینند)</span>
                  <Toggle on={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="فعال" />
                </div>
              </FieldCard>
            </div>
            <Cta className="mt-3" onClick={save} busy={busy}>
              ذخیره
            </Cta>
          </>
        )}
      </Sheet>
    </div>
  )
}
