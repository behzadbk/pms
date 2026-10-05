import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { ErrorBlock, Loading } from '../../components/hm'
import { guardApi, type UnitOption, type Vehicle, type VehicleLog } from '../../lib/api/guard'
import { errText, fa } from '../../lib/api/residents'
import { UnitPicker, fmtTime } from './shared'

export function GuardTraffic() {
  const [logs, setLogs] = useState<VehicleLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plate, setPlate] = useState('')
  const [unit, setUnit] = useState<UnitOption | null>(null)
  const [known, setKnown] = useState<Vehicle | null>(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = useCallback(async () => {
    try {
      setLogs(await guardApi.logsToday())
      setError(null)
    } catch (e) {
      setError(errText(e, 'دریافت گزارش تردد ناموفق بود'))
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  // پلاک ثبت‌شده‌ی ساکنین → واحد خودکار پر می‌شود
  useEffect(() => {
    setKnown(null)
    if (plate.trim().length < 5) return
    const t = setTimeout(() => {
      guardApi.lookupPlate(plate).then((r) => setKnown(r.vehicle)).catch(() => undefined)
    }, 350)
    return () => clearTimeout(t)
  }, [plate])

  async function record(direction: 'in' | 'out') {
    if (!plate.trim()) return
    setBusy(true)
    setFormErr('')
    try {
      await guardApi.logVehicle({ plate: plate.trim(), direction, unitId: known ? undefined : unit?.id })
      setPlate('')
      setUnit(null)
      await load()
    } catch (e) {
      setFormErr(errText(e, 'ثبت تردد ممکن نشد'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !logs) return <ErrorBlock message={error} retry={load} />
  if (!logs) return <Loading />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تردد خودرو و پارکینگ</h1>
        <p className="text-muted text-sm mt-1">ثبت ورود و خروج خودروها</p>
      </div>

      <Card>
        <CardHeader title="ثبت تردد جدید" />
        <div className="px-5 pb-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <input value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={30} placeholder="شماره پلاک (مثلاً 12ایران445ب77)" className="rounded-xl border border-line px-3.5 py-2.5 text-sm sm:col-span-2 min-h-[46px] bg-card" />
            {known ? (
              <div className="rounded-xl bg-good-soft text-good px-3.5 py-2.5 text-sm flex items-center min-h-[46px]">واحد {fa(known.unit_number ?? '—')}{known.owner_name ? ` · ${known.owner_name}` : ''}</div>
            ) : (
              <UnitPicker value={unit} onChange={setUnit} placeholder="واحد مقصد مهمان (اختیاری)" />
            )}
            <div className="flex gap-2">
              <button disabled={busy || !plate.trim()} onClick={() => record('in')} className="flex-1 flex items-center justify-center gap-1.5 bg-good text-white rounded-xl text-sm font-medium hover:opacity-90 min-h-[46px] disabled:opacity-50">
                <ArrowDownLeft size={15} /> ورود
              </button>
              <button disabled={busy || !plate.trim()} onClick={() => record('out')} className="flex-1 flex items-center justify-center gap-1.5 bg-brass text-white rounded-xl text-sm font-medium hover:opacity-90 min-h-[46px] disabled:opacity-50">
                <ArrowUpRight size={15} /> خروج
              </button>
            </div>
          </div>
          {formErr && <p className="text-sm text-bad">{formErr}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title={`گزارش تردد امروز (${fa(logs.length)})`} />
        <div className="px-5 pb-5 space-y-3">
          {logs.length === 0 && <p className="text-sm text-muted text-center py-6">امروز ترددی ثبت نشده</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line">
              <div className="flex items-center gap-3 min-w-0">
                {l.direction === 'in' ? <ArrowDownLeft size={16} className="text-good shrink-0" /> : <ArrowUpRight size={16} className="text-brass shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium font-mono truncate">{l.plate}</p>
                  <p className="text-xs text-muted mt-0.5">{l.unit_number ? `واحد ${fa(l.unit_number)}` : '—'}{l.is_guest ? ' · مهمان' : ''}{l.note ? ` · ${l.note}` : ''}</p>
                </div>
              </div>
              <span className="text-xs text-muted shrink-0">{fmtTime(l.recorded_at)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
