import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Baby, CircleCheck, Circle, HandHeart, User, Armchair, type LucideIcon } from 'lucide-react'
import { residentsApi, errText, fa } from '../../../lib/api/residents'
import { parseDateInput } from '../../../lib/jalali'
import { Cta, Field, FieldCard, PageHeader, Seg, StickyCta, Toggle, useToast } from '../../../components/hm'

type MemberType = 'adult' | 'child' | 'caregiver' | 'senior'
const TYPES: { k: MemberType; icon: LucideIcon; t: string; d: string; cta: string }[] = [
  { k: 'adult', icon: User, t: 'بزرگسال خانواده', d: 'همسر، فرزند بالای ۱۸؛ دسترسی کامل یا بدون امور مالی', cta: 'ارسال دعوت پیامکی' },
  { k: 'child', icon: Baby, t: 'کودک و نوجوان', d: 'با حالت والدین؛ بخش مالی همیشه پنهان', cta: 'ادامه · تنظیم حالت والدین' },
  { k: 'caregiver', icon: HandHeart, t: 'پرستار یا کمک‌کار', d: 'موقت؛ فقط ورود، مرسوله و تماس با نگهبانی', cta: 'ارسال دعوت موقت' },
  { k: 'senior', icon: Armchair, t: 'سالمند', d: 'حالت ساده با متن بزرگ و دکمه‌ی تماس سریع', cta: 'ارسال دعوت' },
]

const jalaliYearNow = () => Number(new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date()).replace(/\D/g, ''))
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

/** C2 — افزودن عضو (۴ نوع) */
export function ResidentHouseholdAdd() {
  const navigate = useNavigate()
  const [type, setType] = useState<MemberType>('child')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [birth, setBirth] = useState('')
  const [end, setEnd] = useState('')
  const [days, setDays] = useState('')
  const [finance, setFinance] = useState(true)
  const [easy, setEasy] = useState(true)
  const [login, setLogin] = useState<'code' | 'sms'>('code')
  const [busy, setBusy] = useState(false)
  const { toast, toastNode } = useToast()
  const cur = TYPES.find((t) => t.k === type)!

  const presetHint = useMemo(() => {
    const y = Number(latin(birth))
    if (!y || y < 1300) return 'مثلاً ۱۳۹۴'
    const age = jalaliYearNow() - y
    if (age >= 18) return 'بالای ۱۸ سال؛ «بزرگسال خانواده» را انتخاب کنید'
    return `${fa(age)} ساله · پیش‌تنظیم ${age < 7 ? 'زیر ۷' : age <= 12 ? '۷ تا ۱۲' : '۱۳ تا ۱۷'} سال`
  }, [birth])

  async function submit() {
    if (!name.trim()) return toast('نام را وارد کنید')
    const body: Record<string, unknown> = { type, name: name.trim() }
    if (type === 'child') {
      const y = Number(latin(birth))
      if (y) body.birth_year = y
      body.has_phone = login === 'sms'
      if (login === 'sms') body.phone = phone
    } else {
      if (!phone.trim()) return toast('شماره موبایل لازم است')
      body.phone = phone
    }
    if (type === 'adult') body.finance_access = finance
    if (type === 'senior') body.easy_mode = easy
    if (type === 'caregiver') {
      const iso = parseDateInput(end)
      if (!iso) return toast('پایان دسترسی اجباری است؛ مثل «۳۰ آبان ۱۴۰۵»')
      body.end_date = iso
      if (days.trim()) body.days = days.trim()
    }
    setBusy(true)
    try {
      const r = await residentsApi.addMember(body)
      if (type === 'child') navigate(`/resident/family/${r.membership_id}/parent`, { replace: true, state: { toast: `${name.trim()} اضافه شد · دسترسی‌ها را تنظیم کنید` } })
      else navigate('/resident/family', { replace: true, state: { toast: `دعوت برای ${name.trim()} ارسال شد` } })
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageHeader title="افزودن عضو" back close />
      <div className="flex flex-col gap-2" role="radiogroup">
        {TYPES.map((t) => {
          const on = t.k === type
          return (
            <button
              key={t.k}
              role="radio"
              aria-checked={on}
              className="hm-row !items-start"
              style={on ? { borderColor: 'var(--hm-pri)', background: 'color-mix(in srgb, var(--lg4-card) 60%, white)' } : undefined}
              onClick={() => setType(t.k)}
            >
              <span className="hm-icon-tile">
                <t.icon size={24} />
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-sm font-bold">{t.t}</span>
                <span className="text-xs leading-6 text-[var(--hm-t2)]">{t.d}</span>
              </span>
              {on ? <CircleCheck size={22} className="text-[var(--hm-pri)]" /> : <Circle size={22} className="text-[var(--hm-t3)]" />}
            </button>
          )
        })}
      </div>

      <FieldCard>
        <Field label="نام" value={name} onChange={setName} placeholder={type === 'child' ? 'سارا' : 'نام و نام خانوادگی'} />
        {type === 'child' && <Field label="سال تولد" value={birth} onChange={setBirth} placeholder="۱۳۹۴" inputMode="numeric" />}
        {type === 'child' && birth && <p className="px-4 py-2 text-xs text-[var(--hm-pri)] font-bold">{presetHint}</p>}
        {type === 'child' && (
          <div className="px-4 py-2">
            <p className="text-xs text-[var(--hm-t2)] mb-2">ورود</p>
            <Seg<'code' | 'sms'>
              small
              options={[
                ['code', 'با کد خانواده (بدون سیم‌کارت)'],
                ['sms', 'با پیامک روی شماره‌ی خودش'],
              ]}
              value={login}
              onChange={setLogin}
            />
          </div>
        )}
        {(type !== 'child' || login === 'sms') && (
          <Field label="شماره موبایل" value={phone} onChange={setPhone} placeholder={type === 'caregiver' ? '۰۹۳۵ ۰۰۰ ۰۰۰۰' : '۰۹۱۲ ۰۰۰ ۰۰۰۰'} inputMode="tel" dir="ltr" />
        )}
        {type === 'adult' && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1">
              <span className="block text-xs text-[var(--hm-t2)]">دسترسی مالی</span>
              <span className="block mt-0.5 text-sm font-bold">{finance ? 'دارد' : 'ندارد'}</span>
            </span>
            <Toggle on={finance} onChange={setFinance} label="دسترسی مالی" />
          </div>
        )}
        {type === 'caregiver' && <Field label="پایان دسترسی (اجباری)" value={end} onChange={setEnd} placeholder="۳۰ آبان ۱۴۰۵" />}
        {type === 'caregiver' && <Field label="روزهای حضور" value={days} onChange={setDays} placeholder="شنبه تا چهارشنبه" />}
        {type === 'senior' && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1">
              <span className="block text-xs text-[var(--hm-t2)]">حالت ساده</span>
              <span className="block mt-0.5 text-sm font-bold">{easy ? 'روشن' : 'خاموش'}</span>
            </span>
            <Toggle on={easy} onChange={setEasy} label="حالت ساده" />
          </div>
        )}
      </FieldCard>

      <StickyCta>
        <Cta onClick={submit} busy={busy}>
          {cur.cta}
        </Cta>
      </StickyCta>
      {toastNode}
    </div>
  )
}
