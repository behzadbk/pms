import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building, Info } from 'lucide-react'
import { residentsApi, errText, fa, type Residency, type UnitFile, type UnitListItem } from '../../../lib/api/residents'
import { formatJalali, parseDateInput, todayJalali } from '../../../lib/jalali'
import { Cta, Field, FieldCard, Loading, PageHeader, Seg, StickyCta, useToast } from '../../../components/hm'
import { CredentialsSheet } from './CredentialsSheet'
import { useResidentsScope, useUnitParam } from '../../../lib/residentsScope'
import { UnitPickSheet, useBuildingId } from './Residents'

const RES_HINT: Record<Residency, string> = {
  owner: 'مالک ساکن هم ساکن است و هم صورتحساب‌ها را پرداخت می‌کند.',
  tenant: 'مالک از ثبت مستأجر مطلع می‌شود؛ پایان قرارداد یادآوری می‌شود.',
  owner_absent: 'مالک غیرساکن فقط صورتحساب و اطلاعیه‌ها را می‌بیند و جزو ساکنین شمرده نمی‌شود. واحد «خالی» یا «اجاره‌ای» می‌ماند.',
}

interface FormState {
  name: string
  phone: string
  nid: string
  start: string
  end: string
}
const EMPTY: FormState = { name: '', phone: '', nid: '', start: todayJalali(), end: '' }

/**
 * A3 — فرم ثبت/ویرایش ساکن. فیلدها با نوع سکونت عوض می‌شوند:
 * مستأجر → «پایان قرارداد اجاره» + «پرداخت شارژ با»؛ مالک غیرساکن → «تاریخ مالکیت».
 */
export function AdminResidentForm() {
  const buildingId = useBuildingId()
  const navigate = useNavigate()
  const editUnitId = useUnitParam() || undefined
  const sc = useResidentsScope()
  const [creds, setCreds] = useState<{ name: string; unitNo: string; username: string; password: string | null; toast: string } | null>(null)
  const [search] = useSearchParams()
  const memberId = search.get('member')
  const editing = !!editUnitId && !!memberId
  const [unitId, setUnitId] = useState<string | null>(editUnitId ?? search.get('unit'))
  const [units, setUnits] = useState<UnitListItem[]>([])
  const [file, setFile] = useState<UnitFile | null>(null)
  const [res, setRes] = useState<Residency>('tenant')
  const [payer, setPayer] = useState<'tenant' | 'owner'>('tenant')
  const [f, setF] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(editing)
  const { toast, toastNode } = useToast()

  useEffect(() => {
    residentsApi.units(buildingId).then((r) => setUnits(r.units)).catch(() => undefined)
  }, [buildingId])

  useEffect(() => {
    if (!unitId) return setFile(null)
    residentsApi
      .unit(unitId)
      .then((u) => {
        setFile(u)
        if (editing) {
          const m = u.members.find((x) => x.id === memberId)
          if (m) {
            setRes(m.residency)
            setPayer(m.residency === 'tenant' && !m.pays_charge ? 'owner' : 'tenant')
            setF({
              name: m.name,
              phone: m.phone ?? '',
              nid: m.national_id ?? '',
              start: formatJalali(m.start_date),
              end: m.end_date ? formatJalali(m.end_date) : '',
            })
          }
        }
      })
      .catch((e) => toast(errText(e)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId])

  const unitLabel = useMemo(() => {
    const u = file ?? units.find((x) => x.id === unitId)
    return u ? `${fa(u.no)} · طبقه ${fa(u.floor ?? '—')}` : 'انتخاب واحد'
  }, [file, units, unitId])

  const set = (k: keyof FormState) => (v: string) => {
    setF((s) => ({ ...s, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function save() {
    const e: typeof errors = {}
    if (f.name.trim().length < 2) e.name = 'نام و شماره موبایل را وارد کنید'
    const digits = f.phone.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')
    if (digits.length < 10) e.phone = 'نام و شماره موبایل را وارد کنید'
    const start = f.start ? parseDateInput(f.start) : null
    if (f.start && !start) e.start = 'تاریخ را مثل «۱ مهر ۱۴۰۵» یا «۱۴۰۵/۰۷/۰۱» بنویسید'
    const end = res === 'tenant' && f.end ? parseDateInput(f.end) : null
    if (res === 'tenant' && f.end && !end) e.end = 'تاریخ را مثل «۳۱ شهریور ۱۴۰۶» بنویسید'
    if (start && end && end < start) e.end = 'پایان قرارداد نمی‌تواند قبل از شروع سکونت باشد'
    setErrors(e)
    if (Object.keys(e).length) return
    if (!unitId) return toast('واحد را انتخاب کنید')
    setBusy(true)
    try {
      if (editing) {
        await residentsApi.updateMembership(memberId!, {
          name: f.name.trim(),
          phone: f.phone,
          national_id: f.nid || undefined,
          residency: res,
          start_date: start ?? undefined,
          end_date: res === 'tenant' ? end : null,
          pays_charge: res === 'tenant' ? payer === 'tenant' : res === 'owner',
        })
        navigate(sc.unit(unitId), { replace: true, state: { toast: 'اطلاعات ساکن ذخیره شد' } })
      } else {
        const r = await residentsApi.addResident(unitId, {
          name: f.name.trim(),
          phone: f.phone,
          national_id: f.nid || undefined,
          residency: res,
          start_date: start ?? undefined,
          end_date: end ?? undefined,
          pays_charge: res === 'tenant' ? payer === 'tenant' : res === 'owner' ? true : undefined,
          // ثبت مستقیم: ساکن فعال می‌شود و حساب ورود ساخته می‌شود (نام کاربری = موبایل، رمز = رمز موقت تصادفی)
          send_sms: false,
        })
        const unitNo = units.find((u) => u.id === unitId)?.no ?? ''
        const toastMsg = res === 'owner_absent' ? 'مالک ثبت شد · واحد خالی می‌ماند' : 'ساکن ثبت شد'
        if (r.credentials) setCreds({ name: f.name.trim(), unitNo, username: r.credentials.username, password: r.credentials.password, toast: toastMsg })
        else navigate(sc.list, { replace: true, state: { toast: toastMsg } })
      }
    } catch (err) {
      toast(errText(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      {creds && (
        <CredentialsSheet
          open
          name={creds.name}
          unitNo={fa(creds.unitNo)}
          username={creds.username}
          password={creds.password}
          onClose={() => navigate(sc.list, { replace: true, state: { toast: creds.toast } })}
        />
      )}
      <div className="flex flex-col gap-3">
        <PageHeader title={editing ? 'ویرایش ساکن' : 'ثبت دستی ساکن'} sub={editing ? `واحد ${fa(file?.no ?? '')}` : 'مرحله ۱ از ۲ · اطلاعات سرپرست'} back />
        {!editing && (
          <div className="flex gap-1">
            <span className="flex-1 h-1 rounded-full" style={{ background: 'var(--hm-pri)' }} />
            <span className="flex-1 h-1 rounded-full" style={{ background: 'var(--hm-hair)' }} />
          </div>
        )}
        <button className="hm-row" onClick={() => !editing && setPicking(true)} disabled={editing}>
          <Building size={22} className="text-[var(--hm-pri)] shrink-0" />
          <span className="flex-1 text-right">
            <span className="block text-xs text-[var(--hm-t2)]">واحد</span>
            <span className="block mt-0.5 text-sm font-bold">{unitLabel}</span>
          </span>
          {!editing && <span className="text-sm font-bold text-[var(--hm-pri)]">تغییر</span>}
        </button>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">نوع سکونت</p>
          <Seg<Residency>
            options={[
              ['owner', 'مالک ساکن'],
              ['tenant', 'مستأجر'],
              ['owner_absent', 'مالک غیرساکن'],
            ]}
            value={res}
            onChange={setRes}
          />
          <div className="hm-note hm-tone-pri" style={{ color: 'var(--hm-t1)' }}>
            <Info size={18} className="shrink-0 text-[var(--hm-pri)]" />
            <p>{RES_HINT[res]}</p>
          </div>
        </div>

        <FieldCard>
          <Field label="نام و نام خانوادگی" value={f.name} onChange={set('name')} placeholder="مثلاً رضا کریمی" error={errors.name} />
          <Field label="شماره موبایل" value={f.phone} onChange={set('phone')} placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" inputMode="tel" dir="ltr" error={errors.phone} />
          <Field label="کد ملی (اختیاری)" value={f.nid} onChange={set('nid')} placeholder="برای صدور رسید رسمی" inputMode="numeric" />
          <Field
            label={res === 'owner_absent' ? 'تاریخ مالکیت' : 'شروع سکونت'}
            value={f.start}
            onChange={set('start')}
            placeholder={res === 'owner_absent' ? '۱۴۰۲' : '۱ مهر ۱۴۰۵'}
            error={errors.start}
          />
          {res === 'tenant' && <Field label="پایان قرارداد اجاره" value={f.end} onChange={set('end')} placeholder="۳۱ شهریور ۱۴۰۶" error={errors.end} />}
        </FieldCard>

        {res === 'tenant' && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm font-bold">پرداخت شارژ با</p>
            <Seg<'tenant' | 'owner'>
              className="w-[180px]"
              small
              options={[
                ['tenant', 'مستأجر'],
                ['owner', 'مالک'],
              ]}
              value={payer}
              onChange={setPayer}
            />
          </div>
        )}
      </div>

      <StickyCta>
        <Cta onClick={save} busy={busy}>
          {editing ? 'ذخیره تغییرات' : 'ثبت و ارسال پیامک دعوت'}
        </Cta>
        {!editing && <p className="mt-2 text-center text-xs text-[var(--hm-t2)]">پیامک فعال‌سازی پس از ثبت برای ساکن ارسال می‌شود</p>}
      </StickyCta>

      <UnitPickSheet
        open={picking}
        title="انتخاب واحد"
        units={units}
        onClose={() => setPicking(false)}
        onPick={(u) => {
          setUnitId(u.id)
          setPicking(false)
        }}
        onCreated={async (created) => {
          const r = await residentsApi.units(buildingId)
          setUnits(r.units)
          // یک واحد ساخته شده ⇒ همان را انتخاب کن
          if (created.length === 1) {
            setUnitId(created[0].id)
            setPicking(false)
          }
        }}
      />
      {toastNode}
    </div>
  )
}
