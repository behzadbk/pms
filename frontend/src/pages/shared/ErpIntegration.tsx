import { useState } from 'react'
import { BookOpen, Copy, DatabaseZap, History, KeyRound, Pause, Play, Plug, Plus, RefreshCw, Send, Trash2, TriangleAlert } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusPill } from '../../components/ui/StatusPill'
import { Modal, TextField, PrimaryButton, GhostButton } from '../../components/ui/Modal'
import { Callout, useBusy, TH, TD } from '../../components/finance/parts'
import { Loading, ErrorBlock, useLoad, useToast } from '../../components/hm'
import { errText } from '../../lib/api/residents'
import { faDateTime } from '../../lib/jalali'
import {
  ENTITY_FA, ERP_DOCS_URL, integrationApi,
  type Connector, type Delivery, type ErpEntity,
} from '../../lib/api/integration'

const ALL_ENTITIES = Object.keys(ENTITY_FA) as ErpEntity[]
const fa = (n: number) => n.toLocaleString('fa-IR')

/**
 * «اتصال ERP» — مدیر ساختمان و حسابدار.
 * Livo نرم‌افزار حسابداری نیست: شارژها، پرداخت‌ها، فاکتورهای هزینه، شارژ متغیر و اطلاعات پایه به ERP مجموعه فرستاده می‌شود
 * و سند حسابداری در خود ERP ثبت می‌شود. دو روش: ERP با کلید API می‌خواند، یا Livo خودکار به آدرس ERP ارسال می‌کند.
 */
export function ErpIntegration() {
  const overview = useLoad(() => integrationApi.overview(), [])
  const keys = useLoad(() => integrationApi.keys(), [])
  const issues = useLoad(() => integrationApi.syncIssues(), [])
  const { toast, toastNode } = useToast()
  const { busy, run } = useBusy()
  const [keyOpen, setKeyOpen] = useState(false)
  const [conOpen, setConOpen] = useState(false)
  const [secret, setSecret] = useState<{ title: string; value: string; note: string } | null>(null)
  const [history, setHistory] = useState<Connector | null>(null)

  const refresh = () => { void overview.reload(true); void keys.reload(true); void issues.reload(true) }
  const o = overview.data
  const failed = o?.sync.filter((s) => s.status === 'failed').reduce((a, s) => a + s.count, 0) ?? 0
  const synced = o?.sync.filter((s) => s.status === 'synced').reduce((a, s) => a + s.count, 0) ?? 0

  const act = (fn: () => Promise<unknown>, ok: string) =>
    run(async () => {
      try {
        await fn()
        toast(ok)
        refresh()
      } catch (e) {
        toast(errText(e))
      }
    })

  async function testCon(c: Connector) {
    await run(async () => {
      try {
        const r = await integrationApi.testConnector(c.id)
        toast(r.ok ? `اتصال برقرار است ✅ (${fa(r.durationMs)} میلی‌ثانیه)` : `ارسال ناموفق: ${r.error ?? r.statusCode}`)
      } catch (e) {
        toast(errText(e))
      }
    })
  }

  async function runCon(c: Connector) {
    await run(async () => {
      try {
        const r = await integrationApi.runConnector(c.id)
        toast(r.result ? (r.result.ok ? `${fa(r.sent ?? 0)} رویداد ارسال شد` : `ارسال ناموفق: ${r.result.error}`) : (r.message ?? 'چیزی برای ارسال نبود'))
        refresh()
      } catch (e) {
        toast(errText(e))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">اتصال ERP / نرم‌افزار حسابداری</h1>
          <p className="text-sm text-muted mt-1">شارژها، پرداخت‌ها، فاکتورهای هزینه و شارژ متغیر به‌صورت خودکار به نرم‌افزار حسابداری مجموعه می‌رود.</p>
        </div>
        <a href={ERP_DOCS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-line px-4 py-2.5 rounded-xl text-sm font-medium hover:border-ink-soft">
          <BookOpen size={16} /> مستندات API برای تیم ERP
        </a>
      </div>

      {overview.loading ? <Loading /> : overview.error ? <ErrorBlock message={overview.error} retry={overview.reload} /> : o && (
        <div className="lg5-grid">
          <StatCard label="کلیدهای فعال" value={fa(o.activeKeys)} sub={o.lastPullAt ? `آخرین خواندن ERP: ${faDateTime(o.lastPullAt)}` : 'ERP هنوز وصل نشده'} icon={KeyRound} tone="ink" />
          <StatCard label="مقصدهای ارسال خودکار" value={fa(o.connectors.length)} sub={`${fa(o.connectors.reduce((a, c) => a + c.pending, 0))} رویداد در صف`} icon={Send} tone="tile" />
          <StatCard label="ثبت‌شده در ERP" value={fa(synced)} sub="با شماره سند گزارش‌شده" icon={DatabaseZap} tone="brass" />
          <StatCard label="خطای ثبت در ERP" value={fa(failed)} sub={failed ? 'پایین صفحه را ببینید' : 'بدون خطا'} icon={TriangleAlert} tone="bad" />
        </div>
      )}

      <Callout>
        <b>دو روش اتصال:</b> (۱) ERP شما با «کلید API» داده‌ها را می‌خواند — مناسب نرم‌افزارهای نصب‌شده داخل شبکه‌ی مجموعه؛
        (۲) Livo هر تغییر را خودکار به «آدرس ERP» می‌فرستد — مناسب ERP آنلاین. می‌توانید هر دو را با هم داشته باشید.
        Livo فقط داده می‌فرستد و هیچ‌وقت در حسابداری شما چیزی را ویرایش نمی‌کند.
      </Callout>

      {/* ---------------- کلیدها ---------------- */}
      <Card>
        <CardHeader title="کلیدهای API (ERP داده را می‌خواند)" action={<PrimaryButton onClick={() => setKeyOpen(true)}><Plus size={16} /> ساخت کلید</PrimaryButton>} />
        {keys.loading ? <Loading /> : keys.error ? <div className="px-5 pb-5"><ErrorBlock message={keys.error} retry={keys.reload} /></div> : !keys.data?.length ? (
          <p className="px-5 pb-6 text-sm text-muted">هنوز کلیدی ساخته نشده. برای اتصال ERP یک کلید بسازید و همراه لینک مستندات به تیم ERP بدهید.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>نام</th><th className={TH}>کلید</th><th className={TH}>دسترسی</th><th className={TH}>آخرین استفاده</th><th className={TH}>وضعیت</th><th className={TH}></th></tr></thead>
              <tbody>
                {keys.data.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className={`${TD} font-medium`}>{k.name}<span className="block text-xs text-muted font-normal">{k.created_by_name ?? ''} · {faDateTime(k.created_at)}</span></td>
                    <td className={`${TD} font-mono text-xs text-muted`} dir="ltr">{k.key_prefix}…</td>
                    <td className={`${TD} text-muted`}>{k.scopes.map((s) => (s === 'read' ? 'خواندن' : 'گزارش سند')).join('، ')}</td>
                    <td className={`${TD} text-muted whitespace-nowrap`}>{faDateTime(k.last_used_at)}</td>
                    <td className={TD}><StatusPill status={k.status === 'active' ? 'active' : 'cancelled'} /></td>
                    <td className={TD}>
                      {k.status === 'active' && (
                        <button disabled={busy} className="text-xs font-medium text-bad hover:underline" onClick={() => {
                          if (window.confirm(`کلید «${k.name}» باطل شود؟ ERP دیگر با آن وصل نمی‌شود.`)) void act(() => integrationApi.revokeKey(k.id), 'کلید باطل شد')
                        }}>ابطال</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- مقصدهای ارسال ---------------- */}
      <Card>
        <CardHeader title="ارسال خودکار به ERP" action={<PrimaryButton onClick={() => setConOpen(true)}><Plus size={16} /> افزودن مقصد</PrimaryButton>} />
        {!o?.connectors.length ? (
          <p className="px-5 pb-6 text-sm text-muted">مقصدی تعریف نشده. اگر ERP شما آدرس اینترنتی برای دریافت داده دارد، اینجا ثبت کنید.</p>
        ) : (
          <div className="divide-y divide-line">
            {o.connectors.map((c) => (
              <div key={c.id} className="px-5 py-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium flex items-center gap-2"><Plug size={16} className="text-tile" /> {c.name} <StatusPill status={c.status === 'active' ? (c.failureCount ? 'failed' : 'active') : 'cancelled'} /></div>
                    <div className="text-xs text-muted font-mono mt-1" dir="ltr">{c.url}</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <GhostButton disabled={busy} onClick={() => void testCon(c)}><Send size={14} /> تست</GhostButton>
                    <GhostButton disabled={busy} onClick={() => void runCon(c)}><RefreshCw size={14} /> ارسال الان</GhostButton>
                    <GhostButton onClick={() => setHistory(c)}><History size={14} /> گزارش</GhostButton>
                    <GhostButton disabled={busy} onClick={() => void act(() => integrationApi.updateConnector(c.id, { status: c.status === 'active' ? 'paused' : 'active' }), c.status === 'active' ? 'ارسال متوقف شد' : 'ارسال از سر گرفته شد')}>
                      {c.status === 'active' ? <><Pause size={14} /> توقف</> : <><Play size={14} /> ادامه</>}
                    </GhostButton>
                    <GhostButton disabled={busy} className="text-bad" onClick={() => {
                      if (window.confirm(`مقصد «${c.name}» حذف شود؟`)) void act(() => integrationApi.deleteConnector(c.id), 'مقصد حذف شد')
                    }}><Trash2 size={14} /></GhostButton>
                  </div>
                </div>
                <div className="text-xs text-muted flex gap-x-5 gap-y-1 flex-wrap">
                  <span>داده‌ها: {c.entities.includes('*') ? 'همه' : c.entities.map((e) => ENTITY_FA[e as ErpEntity] ?? e).join('، ')}</span>
                  <span>در صف: {fa(c.pending)}</span>
                  <span>آخرین ارسال موفق: {faDateTime(c.lastSuccessAt)}</span>
                  {c.nextAttemptAt && <span>تلاش بعدی: {faDateTime(c.nextAttemptAt)}</span>}
                </div>
                {c.lastError && <Callout tone="warn">آخرین خطا: <span dir="ltr">{c.lastError}</span></Callout>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- همگام‌سازی اولیه ---------------- */}
      <Card>
        <CardHeader title="همگام‌سازی اولیه" />
        <div className="px-5 pb-5 space-y-3">
          <p className="text-sm text-muted leading-7">
            اتصال فقط تغییرات از این به بعد را می‌فرستد. برای اینکه داده‌های فعلی (واحدها، اشخاص، شارژها و پرداخت‌های قبلی و …) هم یک‌بار به ERP برود
            این دکمه را بزنید. ERP باید رکورد تکراری را با شناسه تشخیص دهد.
          </p>
          <PrimaryButton disabled={busy} onClick={() => {
            if (window.confirm('همه‌ی داده‌های فعلی برای ارسال به ERP در صف قرار بگیرد؟')) {
              void run(async () => {
                try {
                  const r = await integrationApi.backfill()
                  const total = Object.values(r.queued).reduce((a, b) => a + b, 0)
                  toast(`${fa(total)} رکورد در صف ارسال قرار گرفت`)
                  refresh()
                } catch (e) {
                  toast(errText(e))
                }
              })
            }
          }}><DatabaseZap size={16} /> ارسال همه‌ی داده‌های فعلی</PrimaryButton>
        </div>
      </Card>

      {/* ---------------- خطاهای ثبت ---------------- */}
      <Card>
        <CardHeader title="مواردی که ERP ثبت نکرده" />
        {issues.loading ? <Loading /> : issues.error ? <div className="px-5 pb-5"><ErrorBlock message={issues.error} retry={issues.reload} /></div> : !issues.data?.length ? (
          <p className="px-5 pb-6 text-sm text-muted">خطایی از سمت ERP گزارش نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>نوع</th><th className={TH}>شناسه</th><th className={TH}>پیام ERP</th><th className={TH}>زمان</th></tr></thead>
              <tbody>
                {issues.data.map((s) => (
                  <tr key={`${s.entity}:${s.id}`} className="border-b border-line last:border-0">
                    <td className={TD}>{ENTITY_FA[s.entity] ?? s.entity}</td>
                    <td className={`${TD} font-mono text-xs text-muted`} dir="ltr">{s.id.slice(0, 8)}</td>
                    <td className={`${TD} text-bad`}>{s.message ?? '—'}</td>
                    <td className={`${TD} text-muted whitespace-nowrap`}>{faDateTime(s.synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- داده‌هایی که فرستاده می‌شود ---------------- */}
      {o && (
        <Card>
          <CardHeader title="داده‌هایی که به ERP داده می‌شود" />
          <div className="px-5 pb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {o.entities.map((e) => {
              const ch = o.changesLast30Days.find((x) => x.entity === e.name)
              return (
                <div key={e.name} className="rounded-xl border border-line px-3.5 py-2.5">
                  <div className="text-sm font-medium">{ENTITY_FA[e.name]}</div>
                  <div className="text-xs text-muted mt-0.5"><span dir="ltr" className="font-mono">GET {e.path}</span> · {fa(ch?.count ?? 0)} تغییر در ۳۰ روز</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <NewKeyModal open={keyOpen} onClose={() => setKeyOpen(false)} onCreated={(k) => { setKeyOpen(false); setSecret({ title: 'کلید API ساخته شد', value: k, note: 'این کلید فقط همین یک بار نمایش داده می‌شود. آن را در تنظیمات ERP (هدر X-API-Key) وارد کنید و همراه لینک مستندات به تیم ERP بدهید.' }); refresh() }} />
      <NewConnectorModal open={conOpen} onClose={() => setConOpen(false)} onCreated={(s) => { setConOpen(false); setSecret({ title: 'مقصد ارسال اضافه شد', value: s, note: 'این «کلید امضا» فقط همین یک بار نمایش داده می‌شود. ERP با آن امضای هدر X-Livo-Signature را بررسی می‌کند تا مطمئن شود داده واقعاً از همین آمده است.' }); refresh() }} />
      <SecretModal secret={secret} onClose={() => setSecret(null)} onCopied={() => toast('کپی شد')} />
      <HistoryModal connector={history} onClose={() => setHistory(null)} />
      {toastNode}
    </div>
  )
}

function NewKeyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (key: string) => void }) {
  const [name, setName] = useState('')
  const [sync, setSync] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const { busy, run } = useBusy()
  const submit = () =>
    run(async () => {
      setErr(null)
      try {
        const r = await integrationApi.createKey({ name: name.trim(), scopes: sync ? ['read', 'sync'] : ['read'] })
        setName('')
        onCreated(r.key)
      } catch (e) {
        setErr(errText(e))
      }
    })
  return (
    <Modal open={open} onClose={onClose} title="ساخت کلید API" footer={<><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={busy || !name.trim()} onClick={() => void submit()}>ساخت کلید</PrimaryButton></>}>
      <div className="space-y-4">
        <TextField label="نام" placeholder="مثلاً: اتصال سپیدار دفتر مرکزی" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} /> ERP بتواند شماره سند ثبت‌شده را به Livo گزارش دهد</label>
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}

function NewConnectorModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (secret: string) => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [all, setAll] = useState(true)
  const [picked, setPicked] = useState<ErpEntity[]>(['charge', 'payment', 'expense'])
  const [fromStart, setFromStart] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { busy, run } = useBusy()
  const submit = () =>
    run(async () => {
      setErr(null)
      try {
        const r = await integrationApi.createConnector({ name: name.trim(), url: url.trim(), entities: all ? ['*'] : picked, startFrom: fromStart ? 'beginning' : 'now' })
        setName('')
        setUrl('')
        onCreated(r.secret)
      } catch (e) {
        setErr(errText(e))
      }
    })
  return (
    <Modal open={open} onClose={onClose} title="افزودن مقصد ارسال خودکار" size="lg" footer={<><GhostButton onClick={onClose}>انصراف</GhostButton><PrimaryButton disabled={busy || !name.trim() || !url.trim() || (!all && !picked.length)} onClick={() => void submit()}>افزودن</PrimaryButton></>}>
      <div className="space-y-4">
        <TextField label="نام" placeholder="مثلاً: ERP آنلاین شرکت" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="آدرس دریافت ERP" dir="ltr" placeholder="https://erp.example.com/livo/inbox" value={url} onChange={(e) => setUrl(e.target.value)} hint="باید https و قابل دسترس از اینترنت باشد. ERP داخل شبکه‌ی مجموعه؟ به‌جای این، کلید API بسازید." />
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> همه‌ی داده‌ها</label>
          {!all && (
            <div className="grid sm:grid-cols-2 gap-1.5">
              {ALL_ENTITIES.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked.includes(e)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, e] : picked.filter((x) => x !== e))} />
                  {ENTITY_FA[e]}
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fromStart} onChange={(e) => setFromStart(e.target.checked)} /> تغییرات قبلی هم ارسال شود (از ابتدای فید تغییرات)</label>
        {err && <Callout tone="warn">{err}</Callout>}
      </div>
    </Modal>
  )
}

function SecretModal({ secret, onClose, onCopied }: { secret: { title: string; value: string; note: string } | null; onClose: () => void; onCopied: () => void }) {
  return (
    <Modal open={!!secret} onClose={onClose} title={secret?.title ?? ''} footer={<PrimaryButton onClick={onClose}>ذخیره کردم</PrimaryButton>}>
      {secret && (
        <div className="space-y-3">
          <Callout tone="warn">{secret.note}</Callout>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-canvas border border-line rounded-xl px-3 py-2.5 break-all" dir="ltr">{secret.value}</code>
            <GhostButton onClick={() => { void navigator.clipboard?.writeText(secret.value).then(onCopied) }}><Copy size={14} /></GhostButton>
          </div>
        </div>
      )}
    </Modal>
  )
}

function HistoryModal({ connector, onClose }: { connector: Connector | null; onClose: () => void }) {
  const list = useLoad<Delivery[]>(() => (connector ? integrationApi.deliveries(connector.id) : Promise.resolve([])), [connector?.id])
  return (
    <Modal open={!!connector} onClose={onClose} title={`گزارش ارسال — ${connector?.name ?? ''}`} size="lg">
      {list.loading ? <Loading /> : list.error ? <ErrorBlock message={list.error} retry={list.reload} /> : !list.data?.length ? (
        <p className="text-sm text-muted">هنوز ارسالی انجام نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted border-y border-line"><th className={TH}>زمان</th><th className={TH}>رویدادها</th><th className={TH}>نتیجه</th><th className={TH}>مدت</th></tr></thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className={`${TD} text-muted whitespace-nowrap`}>{faDateTime(d.created_at)}</td>
                  <td className={TD}>{fa(d.event_count)} <span className="text-xs text-muted" dir="ltr">#{d.from_seq}–{d.to_seq}</span></td>
                  <td className={TD}>{d.success ? <StatusPill status="done" /> : <span className="text-bad text-xs" dir="ltr">{d.error ?? d.status_code}</span>}</td>
                  <td className={`${TD} text-muted`}>{d.duration_ms !== null ? `${fa(d.duration_ms)}ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
