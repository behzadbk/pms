import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { guestPasses } from '../../lib/mockData'
import { DEMO_DATA } from '../../lib/demoMode'
import { issuePass } from '../../lib/api/guard'
import { ApiError } from '../../lib/api/client'
import { usePermissions } from '../../context/PermissionsContext'

export function ResidentGuestPass() {
  const [name, setName] = useState('')
  const [validity, setValidity] = useState('today')
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { perms } = usePermissions()
  // کدهای صادرشده در همین نشست (سوابق کامل کدها هنوز API فهرست ندارد)
  const [history, setHistory] = useState(DEMO_DATA ? guestPasses : [])

  async function handleIssue() {
    if (!name.trim()) return
    setErr('')
    if (DEMO_DATA) {
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      setIssued({ name, code })
      return
    }
    const unitId = perms?.unit?.id
    if (!unitId) return setErr('حساب شما هنوز به واحدی متصل نیست')
    const until = new Date()
    if (validity === 'week') until.setDate(until.getDate() + 7)
    else until.setHours(23, 59, 0, 0)
    setBusy(true)
    try {
      const p = await issuePass(unitId, name.trim(), until)
      setIssued({ name: p.guest_name, code: p.code })
      setHistory((h) => [
        { id: p.id, guestName: p.guest_name, code: p.code, validUntil: new Date(p.valid_until).toLocaleString('fa-IR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), usesLeft: 1, status: 'active' as const },
        ...h,
      ])
      setName('')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'صدور کد ممکن نشد')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">صدور کد مهمان</h1>
        <p className="text-muted text-sm mt-1">برای مهمانان خود یک کد ورود یک‌بارمصرف صادر کنید</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="دعوت مهمان جدید" />
          <div className="px-5 pb-5 space-y-4">
            <label className="block">
              <span className="text-xs text-muted">نام مهمان</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً آرش محمدی"
                className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">بازه اعتبار</span>
              <select
                value={validity}
                onChange={(e) => setValidity(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-tile/40 focus:border-tile"
              >
                <option value="today">فقط امروز</option>
                <option value="week">تا پایان هفته</option>
              </select>
            </label>
            <button
              onClick={() => void handleIssue()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-tile text-white py-3 rounded-xl text-sm font-medium hover:opacity-90"
            >
              <QrCode size={16} />
              صدور کد ورود
            </button>
            {err && <p className="text-sm text-bad">{err}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="کد صادرشده" />
          <div className="px-5 pb-6 flex flex-col items-center justify-center min-h-[220px]">
            {issued ? (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-white rounded-xl border border-line">
                  <QRCodeSVG value={`guest-pass:${issued.code}`} size={140} fgColor="#16324F" />
                </div>
                <p className="text-sm font-medium">{issued.name}</p>
                <p className="text-xs text-muted">کد عددی: <span className="font-mono text-ink-text">{issued.code}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted text-center">پس از صدور، کد QR و عددی مهمان اینجا نمایش داده می‌شود</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="سوابق کدهای مهمان" />
        <div className="px-5 pb-5 space-y-3">
          {history.length === 0 && <p className="text-sm text-muted">هنوز کدی صادر نشده است</p>}
          {history.map((g) => (
            <div key={g.id} className="flex items-center justify-between p-3 rounded-xl border border-line">
              <div>
                <p className="text-sm font-medium">{g.guestName}</p>
                <p className="text-xs text-muted mt-0.5">کد: {g.code} · اعتبار تا {g.validUntil}</p>
              </div>
              <StatusPill status={g.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
