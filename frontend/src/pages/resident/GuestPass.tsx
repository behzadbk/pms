import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatusPill } from '../../components/ui/StatusPill'
import { guestPasses } from '../../lib/mockData'

export function ResidentGuestPass() {
  const [name, setName] = useState('')
  const [validity, setValidity] = useState('today')
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null)

  function handleIssue() {
    if (!name.trim()) return
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    setIssued({ name, code })
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
                <option value="custom">بازه دلخواه</option>
              </select>
            </label>
            <button
              onClick={handleIssue}
              className="w-full flex items-center justify-center gap-2 bg-tile text-white py-3 rounded-xl text-sm font-medium hover:opacity-90"
            >
              <QrCode size={16} />
              صدور کد ورود
            </button>
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
          {guestPasses.map((g) => (
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
