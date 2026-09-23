import { useState } from 'react'
import { QrCode, CheckCircle2, XCircle, Search, Car, Zap } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'

type Tab = 'code' | 'plate'
type Result = null | { ok: true; guest: string; unit: string } | { ok: false }

const validCodes: Record<string, { guest: string; unit: string }> = {
  '481926': { guest: 'آرش محمدی', unit: 'واحد ۱۲' },
}

const knownPlates: Record<string, { unit: string; owner: string }> = {
  '12ایران445ب77': { unit: 'واحد ۴', owner: 'خانم احمدی' },
}

export function GuardGuestCheck() {
  const [tab, setTab] = useState<Tab>('code')
  const [code, setCode] = useState('')
  const [plate, setPlate] = useState('')
  const [result, setResult] = useState<Result>(null)
  const [plateResult, setPlateResult] = useState<null | { found: boolean; unit?: string; owner?: string }>(null)
  const [checkedIn, setCheckedIn] = useState(false)

  function verifyCode() {
    const match = validCodes[code.trim()]
    setResult(match ? { ok: true, ...match } : { ok: false })
    setCheckedIn(false)
  }

  function searchPlate() {
    const normalized = plate.replace(/\s/g, '')
    const match = knownPlates[normalized]
    setPlateResult(match ? { found: true, ...match } : { found: false })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">پنل فوق‌ساده نگهبانی</h1>
        <p className="text-muted text-sm mt-1">تایید ورود مهمان با یک کلیک — با کد QR یا جستجوی پلاک</p>
      </div>

      <div className="flex gap-1.5 bg-canvas rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('code')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${tab === 'code' ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}
        >
          <QrCode size={15} /> کد مهمان
        </button>
        <button
          onClick={() => setTab('plate')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${tab === 'plate' ? 'bg-card shadow-sm text-ink-text' : 'text-muted'}`}
        >
          <Car size={15} /> جستجوی پلاک
        </button>
      </div>

      {tab === 'code' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader title="اسکن یا ورود دستی کد" />
            <div className="px-5 pb-5 space-y-4">
              <div className="border-2 border-dashed border-line rounded-xl flex flex-col items-center justify-center py-10 text-muted gap-2">
                <QrCode size={36} />
                <p className="text-xs">دوربین برای اسکن QR آماده است (نمای دمو)</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="کد ۶ رقمی را وارد کنید"
                  className="flex-1 rounded-xl border border-line px-3.5 py-2.5 text-sm font-mono"
                />
                <button onClick={verifyCode} className="bg-tile text-white px-5 rounded-xl text-sm font-medium hover:opacity-90">
                  بررسی
                </button>
              </div>
              <p className="text-xs text-muted">برای تست: کد <span className="font-mono">۴۸۱۹۲۶</span> را وارد کنید</p>
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
                  <p className="text-sm">{result.guest} — مهمان {result.unit}</p>
                  <button
                    onClick={() => setCheckedIn(true)}
                    className="mt-2 bg-good text-white px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90"
                  >
                    ثبت ورود با یک کلیک
                  </button>
                </div>
              )}
              {result?.ok && checkedIn && (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-good-soft text-good rounded-full p-3">
                    <Zap size={26} />
                  </div>
                  <p className="font-semibold text-good text-sm">ورود ثبت شد و به ساکن اطلاع داده شد</p>
                  <p className="text-xs text-muted">{result.guest} — {result.unit} · اکنون</p>
                </div>
              )}
              {result && !result.ok && (
                <div className="flex flex-col items-center gap-3">
                  <XCircle size={44} className="text-bad" />
                  <p className="font-semibold text-bad">کد نامعتبر یا منقضی‌شده است</p>
                  <p className="text-sm text-muted">می‌توانید با ساکن واحد تماس بگیرید یا تیکت ثبت کنید</p>
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
            <div className="flex gap-2">
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="مثلاً 12ایران445ب77"
                className="flex-1 rounded-xl border border-line px-3.5 py-2.5 text-sm font-mono"
              />
              <button onClick={searchPlate} className="flex items-center gap-1.5 bg-tile text-white px-5 rounded-xl text-sm font-medium hover:opacity-90">
                <Search size={15} /> جستجو
              </button>
            </div>
            <p className="text-xs text-muted">برای تست: <span className="font-mono">12ایران445ب77</span> را وارد کنید</p>

            {plateResult?.found && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-good-soft text-good">
                <CheckCircle2 size={22} />
                <div className="text-sm">
                  <p className="font-medium">پلاک شناسایی شد — {plateResult.unit}</p>
                  <p className="text-xs opacity-80 mt-0.5">مالک: {plateResult.owner}</p>
                </div>
              </div>
            )}
            {plateResult && !plateResult.found && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-warn-soft text-warn">
                <XCircle size={22} />
                <p className="text-sm">این پلاک در سامانه ثبت نشده — می‌توانید به‌صورت مهمان ثبت تردد کنید</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
