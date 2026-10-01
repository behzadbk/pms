import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { IdCard, Lock, Megaphone, Package, QrCode, UtensilsCrossed, Waves, Wrench, type LucideIcon } from 'lucide-react'
import { residentsApi, errText, toman, type Level, type ModuleKey, type ParentControl as PC } from '../../../lib/api/residents'
import { ErrorBlock, Field, FieldCard, Loading, PageHeader, Seg, Toggle, useLoad, useToast } from '../../../components/hm'

const MODS: { k: ModuleKey; icon: LucideIcon; t: string }[] = [
  { k: 'food', icon: UtensilsCrossed, t: 'سفارش غذا و کافه' },
  { k: 'amenity', icon: Waves, t: 'رزرو امکانات (استخر، سالن)' },
  { k: 'guest', icon: IdCard, t: 'کارت ورود مهمان' },
  { k: 'ticket', icon: Wrench, t: 'ثبت درخواست تعمیر' },
  { k: 'parcel', icon: Package, t: 'مرسوله‌ها' },
  { k: 'notice', icon: Megaphone, t: 'اطلاعیه‌های عمومی' },
]
const LEVEL_COLORS: Record<string, string> = { '0': 'var(--hm-t2)', '1': 'var(--hm-warn)', '2': 'var(--hm-ok)' }

/** C3 — حالت والدین: پیش‌تنظیم سنی، سطح هر بخش، سقف ماهانه، ساعت سکوت و قفل خروج. هر تغییر فوراً ذخیره می‌شود. */
export function ResidentParentControl() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: pc, setData, error, loading, reload } = useLoad<PC>(() => residentsApi.parentControl(id), [id])
  const [cap, setCap] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const { toast, toastNode } = useToast()
  const capTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const t = (location.state as { toast?: string } | null)?.toast
    if (t) {
      toast(t)
      window.history.replaceState({}, '')
    }
  }, [location.state, toast])
  useEffect(() => {
    if (pc) setCap(pc.monthly_cap)
  }, [pc])

  async function save(body: Record<string, unknown>, optimistic?: Partial<PC>) {
    if (pc && optimistic) setData({ ...pc, ...optimistic })
    try {
      setData(await residentsApi.saveParentControl(id, body))
    } catch (e) {
      toast(errText(e))
      void reload(true)
    }
  }

  if (loading && !pc) return <Loading />
  if (error || !pc) return <ErrorBlock message={error ?? ''} retry={() => reload()} />
  const foodOff = pc.modules.food === 0
  const capValue = cap ?? pc.monthly_cap
  const toggles: { k: string; t: string; d: string; on: boolean; set: (v: boolean) => void }[] = [
    { k: 'quiet', t: 'ساعت سکوت ۲۲ تا ۷', d: 'سفارش و رزرو بسته؛ تماس اضطراری باز', on: !!pc.quiet_hours, set: (v) => save({ quiet_hours: v ? { from: '22:00', to: '07:00' } : null }, { quiet_hours: v ? { from: '22:00', to: '07:00' } : null }) },
    { k: 'report', t: 'گزارش هفتگی برای من', d: 'سفارش‌ها، رزروها و ورود و خروج‌ها', on: pc.weekly_report, set: (v) => save({ weekly_report: v }, { weekly_report: v }) },
    { k: 'lock', t: 'قفل خروج از حساب', d: 'خروج یا حذف اپ با رمز والد', on: pc.exit_lock, set: (v) => save({ exit_lock: v }, { exit_lock: v }) },
    { k: 'geo', t: 'خبر ورود و خروج از لابی', d: `وقتی نگهبان ورود ${pc.name} را ثبت کند`, on: pc.lobby_alert, set: (v) => save({ lobby_alert: v }, { lobby_alert: v }) },
  ]

  return (
    <div className="flex flex-col gap-4 hm-fade-in">
      <PageHeader title={`حالت والدین · ${pc.name}`} sub={`تغییرات فوراً روی گوشی ${pc.name} اعمال می‌شود`} back="/resident/family" />
      <Seg<PC['preset']>
        options={[
          ['u7', 'زیر ۷'],
          ['c12', '۷ تا ۱۲'],
          ['t17', '۱۳ تا ۱۷'],
          ['custom', 'سفارشی'],
        ]}
        value={pc.preset}
        onChange={(k) => k !== 'custom' && save({ preset: k })}
      />
      <div className="hm-row">
        <Lock size={22} className="text-[var(--hm-t2)] shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold">همیشه پنهان</p>
          <p className="mt-0.5 text-xs leading-6 text-[var(--hm-t2)]">شارژ و صورتحساب، پرداخت، بدهی واحد، رأی‌گیری مجمع</p>
        </div>
      </div>
      <div className="hm-card px-4 py-1 hm-divided">
        {MODS.map((m) => (
          <div key={m.k} className="py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <m.icon size={20} className="text-[var(--hm-pri)]" />
              <p className="flex-1 text-sm font-bold">{m.t}</p>
            </div>
            <Seg<string>
              small
              options={[
                ['0', 'پنهان'],
                ['1', 'با تأیید من'],
                ['2', 'آزاد'],
              ]}
              colors={LEVEL_COLORS}
              value={String(pc.modules[m.k])}
              onChange={(v) => save({ modules: { [m.k]: Number(v) } }, { modules: { ...pc.modules, [m.k]: Number(v) as Level }, preset: 'custom' })}
            />
          </div>
        ))}
      </div>
      <div className="hm-card p-4 flex flex-col gap-3">
        <div className="flex items-center">
          <p className="flex-1 text-sm font-bold">سقف خرید ماهانه</p>
          <p className="text-sm font-bold text-[var(--hm-pri)]">{foodOff ? 'غیرفعال' : `${toman(capValue)} تومان`}</p>
        </div>
        <input
          type="range"
          min={0}
          max={2_000_000}
          step={50_000}
          value={capValue}
          disabled={foodOff}
          aria-label="سقف خرید ماهانه"
          onChange={(e) => {
            const v = Number(e.target.value)
            setCap(v)
            window.clearTimeout(capTimer.current)
            capTimer.current = window.setTimeout(() => save({ monthly_cap: v }), 450)
          }}
          className="w-full accent-[var(--hm-pri)]"
          dir="ltr"
        />
        <p className="text-xs text-[var(--hm-t2)]">
          از شارژ واحد کم می‌شود · سفارش بالای سقف نیاز به تأیید شما دارد
          {!foodOff && ` · این ماه ${toman(pc.credit.spent)} خرج شده`}
        </p>
      </div>
      <div className="hm-card px-4 py-1 hm-divided">
        {toggles.map((x) => (
          <div key={x.k} className="flex items-center gap-3 py-3">
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-bold">{x.t}</span>
              <span className="text-xs text-[var(--hm-t2)]">{x.d}</span>
            </span>
            <Toggle on={x.on} onChange={x.set} label={x.t} />
          </div>
        ))}
      </div>
      {pc.exit_lock && (
        <FieldCard>
          <Field label={pc.has_exit_pin ? 'رمز والد (تنظیم شده · برای تغییر وارد کنید)' : 'رمز والد برای خروج (۴ تا ۶ رقم)'} value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" placeholder="••••" />
          {pin.length >= 4 && (
            <button
              className="w-full py-3 text-sm font-bold text-[var(--hm-pri)]"
              onClick={async () => {
                await save({ exit_pin: pin })
                setPin('')
                toast('رمز والد ذخیره شد')
              }}
            >
              ذخیره رمز
            </button>
          )}
        </FieldCard>
      )}
      <button className="hm-row" onClick={() => navigate(`/resident/family/${id}/login`)}>
        <QrCode size={22} className="text-[var(--hm-pri)]" />
        <span className="flex-1 text-sm font-bold text-right">ورود {pc.name} روی گوشی یا تبلت خودش</span>
      </button>
      <p className="text-xs leading-6 text-[var(--hm-t2)] text-center">در ۱۸ سالگی به شما پیشنهاد می‌شود حساب {pc.name} به بزرگسال تبدیل شود.</p>
      {toastNode}
    </div>
  )
}
