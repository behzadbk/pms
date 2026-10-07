import { useState } from 'react'
import { QrCode, CheckCircle2, XCircle, Search, Car, Zap, Camera, Plus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { guardApi, type UnitOption, type Vehicle, type VerifyResult } from '../../lib/api/guard'
import { errText, fa } from '../../lib/api/residents'
import { UnitPicker } from './shared'
import { useQrScanner } from '../../lib/useQrScanner'

type Tab = 'code' | 'plate'

export function GuardGuestCheck() {
  const [tab, setTab] = useState<Tab>('code')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [checkedIn, setCheckedIn] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [plate, setPlate] = useState('')
  const [plateResult, setPlateResult] = useState<{ found: boolean; vehicle: Vehicle | null } | null>(null)
  const [regUnit, setRegUnit] = useState<UnitOption | null>(null)
  const [regOwner, setRegOwner] = useState('')

  async function verify(raw = code) {
    const c = raw.trim()
    if (!c) return
    setBusy(true)
    setErr('')
    setCheckedIn(null)
    try {
      setResult(await guardApi.verify(c))
    } catch (e) {
      setResult(null)
      setErr(errText(e, 'بررسی کد ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }
  const scanner = useQrScanner((v) => {
    setCode(v.replace(/^guest-pass:/, ''))
    void verify(v)
  })

  async function checkIn() {
    if (!result?.ok) return
    setBusy(true)
    setErr('')
    try {
      await guardApi.checkIn(result.passId)
      setCheckedIn('اکنون')
    } catch (e) {
      setErr(errText(e, 'ثبت ورود ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  async function searchPlate() {
    if (!plate.trim()) return
    setErr('')
    try {
      setPlateResult(await guardApi.lookupPlate(plate))
    } catch (e) {
      setPlateResult(null)
      setErr(errText(e, 'جست‌وجوی پلاک ممکن نشد'))
    }
  }

  async function registerPlate() {
    if (!regUnit) return
    try {
      const v = await guardApi.addVehicle({ unitId: regUnit.id, plate: plate.trim(), ownerName: regOwner.trim() || undefined })
      setPlateResult({ found: true, vehicle: v })
      setRegUnit(null)
      setRegOwner('')
    } catch (e) {
      setErr(errText(e, 'ثبت پلاک ممکن نشد'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">پنل فوق‌ساده نگهبانی</h1>
      </div>

      <div className="flex gap-1.5 bg-canvas rounded-xl p-1 w-fit max-w-full">
        <button onClick={() => setTab('code')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${tab === 'code' ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}>
          <QrCode size={15} /> کد مهمان
        </button>
        <button onClick={() => setTab('plate')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${tab === 'plate' ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}>
          <Car size={15} /> جستجوی پلاک
        </button>
      </div>

      {err && <p className="text-sm text-bad">{err}</p>}

      {tab === 'code' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader title="اسکن یا ورود دستی کد" />
            <div className="px-5 pb-5 space-y-4">
              {scanner.active ? (
                <div className="rounded-xl overflow-hidden bg-black relative">
                  <video ref={scanner.videoRef} muted playsInline className="w-full max-h-64 object-cover" />
                  <button onClick={() => scanner.setActive(false)} className="absolute top-2 left-2 bg-white/90 text-xs px-3 py-1.5 rounded-lg">بستن دوربین</button>
                </div>
              ) : scanner.supported ? (
                <button onClick={() => { scanner.setActive(true) }} className="w-full border-2 border-dashed border-line rounded-xl flex flex-col items-center justify-center py-8 text-muted gap-2 hover:border-tile hover:text-tile min-h-[120px]">
                  <Camera size={30} />
                  <span className="text-xs">اسکن QR مهمان با دوربین</span>
                  {scanner.cameraErr && <span className="text-xs text-bad">{scanner.cameraErr}</span>}
                </button>
              ) : (
                <div className="border-2 border-dashed border-line rounded-xl flex flex-col items-center justify-center py-8 text-muted gap-2">
                  <QrCode size={32} />
                  <p className="text-xs text-center px-4">اسکن با دوربین در این مرورگر پشتیبانی نمی‌شود؛ کد ۶ رقمی را وارد کنید.</p>
                </div>
              )}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void verify() }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="کد ۶ رقمی را وارد کنید"
                  inputMode="numeric"
                  maxLength={20}
                  className="flex-1 min-w-0 rounded-xl border border-line px-3.5 py-2.5 text-sm font-mono min-h-[46px] bg-card"
                />
                <button type="submit" disabled={busy || !code.trim()} className="bg-tile text-white px-5 rounded-xl text-sm font-medium hover:opacity-90 min-h-[46px] disabled:opacity-50">بررسی</button>
              </form>
            </div>
          </Card>

          <Card>
            <CardHeader title="نتیجه" />
            <div className="px-5 pb-6 flex flex-col items-center justify-center min-h-[220px] text-center">
              {result === null && <p className="text-sm text-muted">پس از بررسی، نتیجه اینجا نمایش داده می‌شود</p>}
              {result?.ok && !checkedIn && (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 size={44} className="text-good" />
                  <p className="font-semibold text-good">کد معتبر است</p>
                  <p className="text-sm">{result.guestName} — مهمان واحد {fa(result.unitNumber ?? '—')}</p>
                  <button onClick={checkIn} disabled={busy} className="mt-2 bg-good text-white px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 min-h-[48px] disabled:opacity-60">
                    ثبت ورود با یک کلیک
                  </button>
                </div>
              )}
              {result?.ok && checkedIn && (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-good-soft text-good rounded-full p-3"><Zap size={26} /></div>
                  <p className="font-semibold text-good text-sm">ورود ثبت شد و به ساکن اطلاع داده شد</p>
                  <p className="text-xs text-muted">{result.guestName} — واحد {fa(result.unitNumber ?? '—')} · {checkedIn}</p>
                </div>
              )}
              {result && !result.ok && (
                <div className="flex flex-col items-center gap-3">
                  <XCircle size={44} className="text-bad" />
                  <p className="font-semibold text-bad">{result.reason}</p>
                  <p className="text-sm text-muted">می‌توانید با ساکن واحد تماس بگیرید</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'plate' && (
        <Card>
          <CardHeader title="جستجوی سریع پلاک خودرو" />
          <div className="px-5 pb-5 space-y-4">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void searchPlate() }}>
              <input value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={30} placeholder="مثلاً 12ایران445ب77" className="flex-1 min-w-0 rounded-xl border border-line px-3.5 py-2.5 text-sm font-mono min-h-[46px] bg-card" />
              <button type="submit" className="flex items-center gap-1.5 bg-tile text-white px-5 rounded-xl text-sm font-medium hover:opacity-90 min-h-[46px]">
                <Search size={15} /> جستجو
              </button>
            </form>

            {plateResult?.found && plateResult.vehicle && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-good-soft text-good">
                <CheckCircle2 size={22} className="shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">پلاک شناسایی شد — واحد {fa(plateResult.vehicle.unit_number ?? '—')}</p>
                  {plateResult.vehicle.owner_name && <p className="text-xs opacity-80 mt-0.5">مالک: {plateResult.vehicle.owner_name}</p>}
                </div>
              </div>
            )}
            {plateResult && !plateResult.found && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-warn-soft text-warn">
                  <XCircle size={22} className="shrink-0" />
                  <p className="text-sm">این پلاک در سامانه ثبت نشده — می‌توانید در «تردد خودرو» به‌صورت مهمان ثبت کنید یا آن را برای یک واحد ثبت کنید.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <UnitPicker value={regUnit} onChange={setRegUnit} placeholder="واحد صاحب خودرو" />
                  <input value={regOwner} onChange={(e) => setRegOwner(e.target.value)} maxLength={80} placeholder="نام مالک (اختیاری)" className="rounded-xl border border-line px-3.5 py-2.5 text-sm min-h-[46px] bg-card" />
                  <button onClick={registerPlate} disabled={!regUnit} className="flex items-center justify-center gap-1.5 border border-tile text-tile rounded-xl text-sm font-medium min-h-[46px] disabled:opacity-50">
                    <Plus size={15} /> ثبت پلاک برای واحد
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
