import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Check, CircleAlert, CircleCheck, Package, CalendarRange } from 'lucide-react'
import { residentsApi, errText, fa, toman, type MoveOutBlockers, type UnitFile } from '../../../lib/api/residents'
import { useResidentsScope, useUnitParam } from '../../../lib/residentsScope'
import { formatJalali, parseDateInput, todayJalali } from '../../../lib/jalali'
import { Loading, PageHeader, useToast } from '../../../components/hm'

const RES_LABEL = { owner: 'مالک ساکن', tenant: 'مستأجر', owner_absent: 'مالک غیرساکن' } as const

/** A6 — تخلیه‌ی واحد: موارد مانع، پیامدها، ثبت */
export function AdminMoveOut() {
  const id = useUnitParam()
  const sc = useResidentsScope()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [unit, setUnit] = useState<UnitFile | null>(null)
  const [dateText, setDateText] = useState(todayJalali())
  const [blockers, setBlockers] = useState<MoveOutBlockers | null>(null)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()
  const iso = parseDateInput(dateText)

  useEffect(() => {
    residentsApi.unit(id).then(setUnit).catch((e) => toast(errText(e)))
  }, [id, toast])
  useEffect(() => {
    if (!iso) return
    residentsApi
      .moveOutPreview(id, iso)
      .then((p) => {
        setBlockers(p.blockers)
        setCount(p.affected.length)
      })
      .catch((e) => toast(errText(e)))
  }, [id, iso, toast])

  async function submit(thenNew: boolean) {
    if (!iso) return toast('تاریخ تخلیه را مثل «۱۵ آبان ۱۴۰۵» بنویسید')
    setBusy(true)
    try {
      const r = await residentsApi.moveOut(id, iso)
      const msg = r.status === 'done' ? 'تخلیه ثبت شد · واحد خالی شد و دسترسی اعضا قطع شد' : `تخلیه ثبت شد · دسترسی اعضا در ${formatJalali(iso, false)} قطع می‌شود`
      if (thenNew) navigate(`${sc.newResident}?unit=${id}`, { replace: true })
      else navigate(sc.list, { replace: true, state: { toast: msg } })
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!unit) return <Loading />
  const head = unit.head
  const dayLabel = iso ? formatJalali(iso, false) : '—'
  const checks = blockers
    ? [
        blockers.debt.amount > 0
          ? { icon: CircleAlert, c: 'var(--hm-bad)', t: `بدهی شارژ ${toman(blockers.debt.amount)} تومان`, d: 'تخلیه بدون تسویه ممکن است؛ بدهی در پرونده می‌ماند', act: 'صورتحساب نهایی', on: () => navigate('/admin/finance?tab=charges') }
          : { icon: CircleCheck, c: 'var(--hm-ok)', t: 'بدهی شارژ ندارد', d: '' },
        blockers.parcels > 0
          ? { icon: Package, c: 'var(--hm-warn)', t: `${fa(blockers.parcels)} مرسوله‌ی تحویل‌نشده`, d: 'در نگهبانی', act: 'اطلاع به ساکن', on: () => toast('به ساکن اطلاع داده شد') }
          : { icon: CircleCheck, c: 'var(--hm-ok)', t: 'مرسوله‌ی تحویل‌نشده ندارد', d: '' },
        blockers.reservations > 0
          ? { icon: CalendarRange, c: 'var(--hm-warn)', t: `${fa(blockers.reservations)} رزرو فعال`, d: 'رزروهای بعد از تخلیه لغو می‌شوند' }
          : { icon: CircleCheck, c: 'var(--hm-ok)', t: 'رزرو فعال ندارد', d: '' },
      ]
    : []
  const after = [
    `دسترسی ${fa(count)} عضو در ${dayLabel} قطع می‌شود و به آن‌ها پیامک می‌رود`,
    'سوابق پرداخت، تیکت و سفارش حفظ می‌شود',
    'مالک مطلع می‌شود و واحد «خالی» می‌شود',
  ]

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageHeader title={`تخلیه واحد ${fa(unit.no)}`} sub={head ? `${head.name} · ${RES_LABEL[head.residency]}` : 'بدون ساکن'} back />
      <label className="hm-row">
        <CalendarDays size={22} className="text-[var(--hm-pri)] shrink-0" />
        <span className="flex-1">
          <span className="block text-xs text-[var(--hm-t2)]">تاریخ تخلیه</span>
          <input className="hm-input mt-0.5" value={dateText} onChange={(e) => setDateText(e.target.value)} aria-label="تاریخ تخلیه" />
          {!iso && <span className="block text-xs text-[var(--hm-bad)]">تاریخ را مثل «۱۵ آبان ۱۴۰۵» بنویسید</span>}
        </span>
      </label>
      <p className="text-sm font-bold">پیش از تخلیه</p>
      <div className="hm-card px-4 py-1 hm-divided">
        {checks.map((c) => (
          <div key={c.t} className="flex items-center gap-3 py-3">
            <c.icon size={22} style={{ color: c.c }} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{c.t}</p>
              {c.d && <p className="mt-0.5 text-xs text-[var(--hm-t2)]">{c.d}</p>}
            </div>
            {'act' in c && c.act && (
              <button className="text-xs font-bold text-[var(--hm-pri)]" onClick={c.on}>
                {c.act}
              </button>
            )}
          </div>
        ))}
        {!blockers && <Loading />}
      </div>
      <p className="text-sm font-bold">پس از تخلیه</p>
      <div className="flex flex-col gap-2">
        {after.map((t) => (
          <div key={t} className="flex gap-2">
            <Check size={18} className="text-[var(--hm-t2)] shrink-0" />
            <p className="text-xs leading-6 text-[var(--hm-t2)]">{t}</p>
          </div>
        ))}
      </div>
      <div className="hm-sticky flex gap-2">
        <button className="hm-cta-ghost flex-1" disabled={busy} onClick={() => submit(true)}>
          ثبت ساکن جدید
        </button>
        <button className="hm-cta-danger flex-1" disabled={busy || count === 0} onClick={() => submit(params.get('then') === 'new')}>
          ثبت تخلیه
        </button>
      </div>
      {toastNode}
    </div>
  )
}
