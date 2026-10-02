import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, CircleCheckBig, Hourglass, Printer, Sheet as SheetIcon, Upload } from 'lucide-react'
import { residentsApi, downloadWithAuth, errText, ago, fa, type ImportResult, type JoinRequest } from '../../../lib/api/residents'
import { EmptyState, ErrorBlock, Loading, PageHeader, Seg, useLoad, useToast } from '../../../components/hm'
import { useBuildingId } from './Residents'

const IMPORT_KEY = 'hamino.last-import'

type Tab = 'requests' | 'import' | 'qr'

/** A5 — صف درخواست‌های عضویت + نتیجه‌ی ورود از اکسل + QR لابی */
export function AdminJoinRequests() {
  const buildingId = useBuildingId()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'requests'
  const { toast, toastNode } = useToast()
  return (
    <div className="flex flex-col gap-3 hm-fade-in">
      <PageHeader title="درخواست‌های عضویت" back="/admin/residents" />
      <Seg<Tab>
        options={[
          ['requests', 'درخواست‌ها'],
          ['import', 'ورود از اکسل'],
          ['qr', 'QR لابی'],
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'requests' ? {} : { tab: t }, { replace: true })}
      />
      {tab === 'requests' && <Requests buildingId={buildingId} toast={toast} />}
      {tab === 'requests' && <LastImport />}
      {tab === 'import' && <ImportPanel buildingId={buildingId} toast={toast} />}
      {tab === 'qr' && <LobbyQr buildingId={buildingId} />}
      {toastNode}
    </div>
  )
}

function Requests({ buildingId, toast }: { buildingId: string; toast: (m: string) => void }) {
  const { data, setData, error, loading, reload } = useLoad<JoinRequest[]>(() => residentsApi.joinRequests(buildingId), [buildingId])
  const [busy, setBusy] = useState<string | null>(null)

  async function run(r: JoinRequest, action: 'approve' | 'reject' | 'transfer' | 'remind') {
    setBusy(r.id + action)
    try {
      if (action === 'remind') {
        const x = await residentsApi.remindHead(r.id)
        toast(`یادآوری برای ${x.head_name} ارسال شد`)
      } else if (action === 'reject') {
        const x = await residentsApi.reject(r.id)
        setData(x.requests)
        toast('درخواست رد شد و به متقاضی اطلاع داده شد')
      } else if (action === 'transfer') {
        const x = await residentsApi.transfer(r.id)
        setData(x.requests)
        toast(`${r.name} از ${fa(x.from_units.join('، ') || '—')} به ${fa(r.unit_no)} منتقل شد`)
      } else {
        const x = await residentsApi.approve(r.id)
        setData(x.requests)
        toast(x.status === 'pending_head' ? `${r.name} تأیید شد · منتظر تأیید سرپرست واحد` : `${r.name} تأیید شد`)
      }
    } catch (e) {
      toast(errText(e))
      void reload(true)
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) return <Loading />
  if (error) return <ErrorBlock message={error} retry={() => reload()} />
  if (!data?.length) return <EmptyState icon={CircleCheckBig} title="درخواستی در انتظار نیست" />
  return (
    <div className="flex flex-col gap-3">
      {data.map((r) => (
        <div key={r.id} className="hm-card p-4 flex flex-col gap-2" style={{ borderRadius: 24 }}>
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-bold">
              {r.name} · واحد {fa(r.unit_no)}
            </p>
            <span className="text-xs text-[var(--hm-t2)]" dir="ltr">
              {r.phone}
            </span>
          </div>
          <p className="text-xs text-[var(--hm-t2)]">
            {r.channel === 'qr_lobby' ? 'QR لابی' : 'لینک دعوت'} · {ago(r.created_at)}
            {r.residency === 'tenant' ? ' · مستأجر' : ''}
          </p>
          {r.note && (
            <div className={`hm-note hm-tone-${r.kind === 'move' ? 'warn' : 'pri'}`}>
              {r.kind === 'move' ? <AlertTriangle size={18} className="shrink-0" /> : <Hourglass size={18} className="shrink-0" />}
              <span className="font-bold">{r.note}</span>
            </div>
          )}
          <div className="flex gap-2">
            {r.kind !== 'head' && (
              <button className="hm-cta-ghost flex-1 !min-h-[44px]" disabled={!!busy} onClick={() => run(r, 'reject')}>
                رد
              </button>
            )}
            <button
              className="lg4-capsule flex-[2] min-h-[44px] text-sm font-bold"
              disabled={!!busy}
              onClick={() => run(r, r.kind === 'head' ? 'remind' : r.kind === 'move' ? 'transfer' : 'approve')}
            >
              {r.kind === 'head' ? 'یادآوری به سرپرست' : r.kind === 'move' ? `انتقال به ${fa(r.unit_no)}` : 'تأیید'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** نتیجه‌ی آخرین ورود گروهی (روی همین دستگاه) */
function LastImport() {
  const [r] = useState<ImportResult | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(IMPORT_KEY) ?? 'null')
    } catch {
      return null
    }
  })
  if (!r) return null
  return <ImportCard r={r} />
}

function ImportCard({ r }: { r: ImportResult }) {
  function downloadErrors() {
    const csv = '﻿ردیف,خطا\n' + r.errors.map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'import-errors.csv'
    a.click()
  }
  return (
    <div className="hm-card px-4 py-3" style={{ borderRadius: 24 }}>
      <div className="flex items-center gap-2">
        <SheetIcon size={22} className="text-[var(--hm-ok)]" />
        <p className="flex-1 text-sm font-bold" dir="ltr" style={{ textAlign: 'right' }}>
          {r.file}
        </p>
        <span className="text-xs font-bold text-[var(--hm-ok)]">
          {fa(r.created)} از {fa(r.total)} ثبت شد
        </span>
      </div>
      {r.errors.length > 0 && (
        <>
          <div className="flex flex-col gap-1 my-2">
            {r.errors.map((e) => (
              <p key={e.row + e.reason} className="text-xs text-[var(--hm-bad)]">
                {e.text}
              </p>
            ))}
          </div>
          <button className="text-xs font-bold text-[var(--hm-pri)]" onClick={downloadErrors}>
            دانلود ردیف‌های خطادار برای اصلاح
          </button>
        </>
      )}
    </div>
  )
}

function ImportPanel({ buildingId, toast }: { buildingId: string; toast: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const r = await residentsApi.importFile(buildingId, file)
      setResult(r)
      try {
        localStorage.setItem(IMPORT_KEY, JSON.stringify(r))
      } catch {
        /* ignore */
      }
      toast(`${fa(r.created)} از ${fa(r.total)} ثبت شد`)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="hm-card p-4 flex flex-col gap-2" style={{ borderRadius: 24 }}>
        <p className="text-sm font-bold">ورود گروهی از اکسل</p>
        <p className="text-xs leading-6 text-[var(--hm-t2)]">
          برای راه‌اندازی اولیه؛ قالب آماده دارد. هر ردیف جداگانه بررسی می‌شود و ردیف‌های خطادار با دلیل برمی‌گردند. برای هر ساکن پیامک دعوت ارسال می‌شود.
        </p>
        <div className="flex gap-2 mt-1">
          <button
            className="hm-cta-ghost flex-1 !min-h-[44px]"
            onClick={() => downloadWithAuth(residentsApi.templatePath(buildingId), 'residents-template.xlsx').catch((e) => toast(errText(e)))}
          >
            دانلود قالب
          </button>
          <button className="lg4-capsule flex-1 min-h-[44px] text-sm font-bold inline-flex items-center justify-center gap-2" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={18} />
            {busy ? 'در حال بررسی…' : 'انتخاب فایل'}
          </button>
        </div>
        <input ref={input} type="file" accept=".xlsx,.csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {result && <ImportCard r={result} />}
    </div>
  )
}

function LobbyQr({ buildingId }: { buildingId: string }) {
  const { data, error, loading } = useLoad(() => residentsApi.lobbyQr(buildingId), [buildingId])
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  if (loading) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? ''} />
  const url = data.url.startsWith('http') ? data.url : origin + data.url
  return (
    <div className="flex flex-col items-center gap-4 text-center" id="lobby-qr">
      <div className="p-5 rounded-3xl bg-card" style={{ boxShadow: 'var(--lg4-shadow)' }}>
        <QRCodeSVG value={url} size={220} level="M" />
      </div>
      <div>
        <p className="text-base font-bold">کد QR ساختمان {data.building}</p>
        <p className="mt-1 text-xs leading-6 text-[var(--hm-t2)]">در لابی نصب می‌شود؛ ثبت‌نام با تأیید مدیر.</p>
        <p className="mt-1 text-xs text-[var(--hm-t3)]" dir="ltr">
          {url}
        </p>
      </div>
      <button className="hm-cta-ghost px-6" onClick={() => window.print()}>
        <Printer size={18} />
        چاپ برای لابی
      </button>
    </div>
  )
}
