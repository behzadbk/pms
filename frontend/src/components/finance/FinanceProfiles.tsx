import { useMemo, useState } from 'react'
import { Link2Off, Search, UserRound, DoorOpen } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Modal } from '../ui/Modal'
import { StatusPill } from '../ui/StatusPill'
import { Loading, ErrorBlock, EmptyState, useLoad } from '../hm'
import { accountingApi, type LedgerRow, type UnitProfile, type StaffFinanceProfile } from '../../lib/api/accounting'
import { dayFa, periodFa, tomanText } from '../../lib/api/finance'
import { departmentLabel } from '../../lib/staff'
import { Callout, TH, TD } from './parts'

const KIND_FA: Record<'unit' | 'staff', Record<LedgerRow['kind'], string>> = {
  unit: { charge: 'شارژ', variable: 'شارژ متغیر', penalty: 'جریمه', payment: 'پرداخت', adjustment: 'تعدیل' },
  staff: { charge: 'حقوق', variable: 'حقوق', penalty: 'جریمه', payment: 'پرداخت', adjustment: 'پاداش / تعدیل' },
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="lg4-card rounded-2xl px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-bold text-sm sm:text-base ${tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : ''}`}>{value}</p>
    </div>
  )
}

/** ریز گردش: تاریخ، نوع، شرح، بدهکار/بستانکار (نمای فقط‌خواندنی) */
function EntriesTable({ rows, who }: { rows: LedgerRow[]; who: 'unit' | 'staff' }) {
  if (!rows.length) return <p className="px-5 pb-6 text-sm text-muted">هنوز ردیفی ثبت نشده است.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>تاریخ</th><th className={TH}>دوره</th><th className={TH}>نوع</th><th className={TH}>شرح</th><th className={TH}>بدهکار</th><th className={TH}>پرداخت</th></tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className={`${TD} whitespace-nowrap text-muted`}>{dayFa(e.date)}</td>
              <td className={`${TD} whitespace-nowrap text-muted`}>{e.period ? periodFa(e.period) : '—'}</td>
              <td className={`${TD} whitespace-nowrap`}>{KIND_FA[who][e.kind]}</td>
              <td className={TD}>{e.title}</td>
              <td className={`${TD} whitespace-nowrap`}>{e.debit ? tomanText(e.debit) : '—'}</td>
              <td className={`${TD} whitespace-nowrap text-good`}>{e.credit ? tomanText(e.credit) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnitProfileView({ p }: { p: UnitProfile }) {
  const s = p.summary
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="مانده‌ی بدهی" value={s.balance > 0 ? tomanText(s.balance) : s.balance < 0 ? `${tomanText(-s.balance)} بستانکار` : 'تسویه'} tone={s.balance > 0 ? 'bad' : 'good'} />
        <Stat label="شارژ ثابت" value={tomanText(s.total_fixed)} />
        <Stat label="شارژ متغیر (مشاعات/کافه)" value={tomanText(s.total_variable)} />
        <Stat label="جریمه‌ی دیرکرد" value={tomanText(s.total_penalty)} />
        <Stat label="جمع پرداختی" value={tomanText(s.total_paid)} tone="good" />
        <Stat label="آخرین پرداخت" value={s.last_payment_at ? dayFa(s.last_payment_at.slice(0, 10)) : '—'} />
      </div>
      <Card>
        <CardHeader title="دوره‌ها" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>دوره</th><th className={TH}>ثابت</th><th className={TH}>متغیر</th><th className={TH}>جریمه</th><th className={TH}>جمع</th><th className={TH}>پرداخت‌شده</th><th className={TH}>وضعیت</th></tr></thead>
            <tbody>
              {p.periods.map((r) => (
                <tr key={r.period} className="border-b border-line last:border-0">
                  <td className={`${TD} font-medium whitespace-nowrap`}>{periodFa(r.period)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{tomanText(r.fixed)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.variable ? tomanText(r.variable) : '—'}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.penalty ? tomanText(r.penalty) : '—'}</td>
                  <td className={`${TD} whitespace-nowrap font-medium`}>{tomanText(r.total)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.paid ? tomanText(r.paid) : '—'}</td>
                  <td className={TD}><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.periods.length && <p className="px-5 pb-6 text-sm text-muted">برای این واحد هنوز شارژی صادر یا وارد نشده است.</p>}
        </div>
      </Card>
      <Card><CardHeader title="گردش حساب" /><EntriesTable rows={p.entries} who="unit" /></Card>
    </div>
  )
}

function StaffProfileView({ p }: { p: StaffFinanceProfile }) {
  if (!p.available) {
    return <EmptyState icon={Link2Off} title="اطلاعات مالی این کارمند از نرم‌افزار حسابداری خوانده نشد" sub="اتصال به نرم‌افزار حسابداری مجموعه برای حقوق هنوز برقرار نیست؛ بعد از اتصال، فیش‌ها، پرداخت‌ها، پاداش و جریمه‌ها همین‌جا نمایش داده می‌شود." tone="warn" />
  }
  const s = p.summary
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="مانده‌ی قابل پرداخت" value={s.balance > 0 ? tomanText(s.balance) : 'تسویه'} tone={s.balance > 0 ? 'bad' : 'good'} />
        <Stat label="جمع خالص حقوق" value={tomanText(s.total_net)} />
        <Stat label="جمع پرداخت‌شده" value={tomanText(s.total_paid)} tone="good" />
        <Stat label="پاداش" value={tomanText(s.total_bonus)} />
        <Stat label="جریمه" value={tomanText(s.total_penalty)} />
        <Stat label="آخرین پرداخت" value={s.last_payment_at ? dayFa(s.last_payment_at) : '—'} />
      </div>
      <Card>
        <CardHeader title="فیش‌های حقوقی" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>دوره</th><th className={TH}>حقوق پایه</th><th className={TH}>اضافه‌کاری</th><th className={TH}>پاداش</th><th className={TH}>کسورات</th><th className={TH}>خالص</th><th className={TH}>وضعیت</th></tr></thead>
            <tbody>
              {p.payslips.map((r) => (
                <tr key={r.period} className="border-b border-line last:border-0">
                  <td className={`${TD} font-medium whitespace-nowrap`}>{periodFa(r.period)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{tomanText(r.base)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.overtime ? tomanText(r.overtime) : '—'}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.bonus ? tomanText(r.bonus) : '—'}</td>
                  <td className={`${TD} whitespace-nowrap`}>{tomanText(r.deductions)}</td>
                  <td className={`${TD} whitespace-nowrap font-medium`}>{tomanText(r.net)}</td>
                  <td className={TD}><StatusPill status={r.paid ? 'paid' : 'pending'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card><CardHeader title="پرداخت‌ها و تعدیل‌ها" /><EntriesTable rows={p.entries} who="staff" /></Card>
    </div>
  )
}

function UnitDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad(() => accountingApi.unitProfile(id), [id])
  if (loading) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? 'خطا'} retry={reload} />
  return <UnitProfileView p={data} />
}
function StaffDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad(() => accountingApi.staffProfile(id), [id])
  if (loading) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? 'خطا'} retry={reload} />
  return <StaffProfileView p={data} />
}

/** لیست واحدها/کارمندان؛ با کلیک روی هر ردیف پروفایل مالی باز می‌شود */
export function FinanceProfiles() {
  const [tab, setTab] = useState<'units' | 'staff'>('units')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<{ kind: 'units' | 'staff'; id: string; title: string } | null>(null)
  const status = useLoad(() => accountingApi.status(), [])
  const units = useLoad(() => accountingApi.units(), [])
  const staff = useLoad(() => accountingApi.staff(), [])

  const needle = q.trim()
  const uRows = useMemo(() => (units.data ?? []).filter((u) => !needle || u.unit_number.includes(needle)), [units.data, needle])
  const sRows = useMemo(() => (staff.data ?? []).filter((s) => !needle || s.full_name.includes(needle) || departmentLabel(s.department).includes(needle)), [staff.data, needle])
  const src = status.data

  return (
    <div className="space-y-5">
      <Callout>
        «همین» نرم‌افزار حسابداری نیست. این پروفایل‌ها فقط نمایشِ اطلاعاتی‌اند که از حسابداری مجموعه خوانده می‌شود و از اینجا چیزی ثبت یا ویرایش نمی‌شود.
        {src && <> منبع فعلی واحدها: {src.units.label}. منبع حقوق: {src.staff.label}.</>}
      </Callout>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-2xl border border-line p-1 text-sm">
          {([['units', 'واحدها', DoorOpen], ['staff', 'کارمندان', UserRound]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium ${tab === k ? 'bg-ink text-white' : 'text-muted'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 border border-line rounded-2xl px-3 py-2 text-sm flex-1 min-w-[12rem] max-w-sm">
          <Search size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'units' ? 'شماره‌ی واحد…' : 'نام یا بخش…'} className="!bg-transparent !border-0 !shadow-none !p-0 outline-none w-full" />
        </label>
      </div>

      {tab === 'units' ? (
        <Card>
          <CardHeader title="واحدها" />
          {units.loading ? <Loading /> : units.error ? <ErrorBlock message={units.error} retry={units.reload} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>واحد</th><th className={TH}>طبقه</th><th className={TH}>مانده</th><th className={TH}>معوق</th><th className={TH}>آخرین پرداخت</th></tr></thead>
                <tbody>
                  {uRows.map((u) => (
                    <tr key={u.unit_id} onClick={() => setOpen({ kind: 'units', id: u.unit_id, title: `پروفایل مالی واحد ${u.unit_number}` })} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer">
                      <td className={`${TD} font-medium`}>واحد {u.unit_number}</td>
                      <td className={`${TD} text-muted`}>{u.floor ?? '—'}</td>
                      <td className={`${TD} whitespace-nowrap ${u.balance > 0 ? 'text-bad font-medium' : 'text-muted'}`}>{u.balance > 0 ? tomanText(u.balance) : u.balance < 0 ? 'بستانکار' : 'تسویه'}</td>
                      <td className={`${TD} ${u.overdue_count ? 'text-warn' : 'text-muted'}`}>{u.overdue_count ? `${u.overdue_count.toLocaleString('fa-IR')} دوره` : '—'}</td>
                      <td className={`${TD} text-muted whitespace-nowrap`}>{u.last_payment_at ? dayFa(String(u.last_payment_at).slice(0, 10)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!uRows.length && <p className="px-5 pb-6 text-sm text-muted">واحدی پیدا نشد.</p>}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="کارمندان" />
          {staff.loading ? <Loading /> : staff.error ? <ErrorBlock message={staff.error} retry={staff.reload} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>نام</th><th className={TH}>بخش</th><th className={TH}>وضعیت</th></tr></thead>
                <tbody>
                  {sRows.map((s) => (
                    <tr key={s.id} onClick={() => setOpen({ kind: 'staff', id: s.id, title: `پروفایل مالی ${s.full_name}` })} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer">
                      <td className={`${TD} font-medium`}>{s.full_name}</td>
                      <td className={`${TD} text-muted`}>{departmentLabel(s.department)}</td>
                      <td className={`${TD} ${s.is_active ? 'text-good' : 'text-muted'}`}>{s.is_active ? 'فعال' : 'غیرفعال'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sRows.length && <p className="px-5 pb-6 text-sm text-muted">کارمندی پیدا نشد.</p>}
            </div>
          )}
        </Card>
      )}

      <Modal open={!!open} title={open?.title ?? ''} onClose={() => setOpen(null)} size="xl">
        {open?.kind === 'units' && <UnitDetail id={open.id} />}
        {open?.kind === 'staff' && <StaffDetail id={open.id} />}
      </Modal>
    </div>
  )
}
