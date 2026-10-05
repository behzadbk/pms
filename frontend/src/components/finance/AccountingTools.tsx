import { useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Modal, PrimaryButton, GhostButton, SelectField } from '../ui/Modal'
import { TEMPLATES, parseCharges, parseExpenses, readTable, type ImportKind } from '../../lib/accountingImport'
import { financeApi, type ImportChargeRow, type ImportInvoiceRow, type ImportResult } from '../../lib/api/finance'

const KINDS: { value: ImportKind; label: string }[] = [
  { value: 'charges', label: 'شارژ واحدها (واحد، دوره، مبلغ، وضعیت)' },
  { value: 'expenses', label: 'هزینه‌ها و فاکتورها (تاریخ، شرح، مبلغ)' },
]

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * ورود اطلاعات از فایل حسابداری (اکسل/CSV): فایل در مرورگر خوانده و اعتبارسنجی می‌شود و ردیف‌های سالم
 * به بک‌اند (finance-service) فرستاده و در دیتابیس ثبت می‌شوند. موجودی اولیه‌ی صندوق در «تنظیمات مالی» است.
 */
export function AccountingTools({ onImported }: { onImported?: () => void }) {
  const [impOpen, setImpOpen] = useState(false)
  const [kind, setKind] = useState<ImportKind>('charges')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<{ charges?: ImportChargeRow[]; expenses?: ImportInvoiceRow[]; errors: { line: number; message: string }[] } | null>(null)
  const [fatal, setFatal] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const count = parsed ? (kind === 'charges' ? parsed.charges?.length : parsed.expenses?.length) ?? 0 : 0

  function resetImport() {
    setParsed(null)
    setFileName('')
    setFatal('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(f: File | undefined, k: ImportKind) {
    resetImport()
    if (!f) return
    setFileName(f.name)
    try {
      const table = await readTable(f)
      if (k === 'charges') {
        const r = parseCharges(table)
        setParsed({ charges: r.rows, errors: r.errors })
      } else {
        const r = parseExpenses(table)
        setParsed({ expenses: r.rows, errors: r.errors })
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'خواندن فایل ممکن نشد')
    }
  }

  async function confirmImport() {
    if (!parsed || count === 0 || busy) return
    setBusy(true)
    setFatal('')
    try {
      const res: ImportResult = kind === 'charges' ? await financeApi.importCharges(parsed.charges ?? []) : await financeApi.importInvoices(parsed.expenses ?? [])
      const done = res.created + (res.updated ?? 0)
      const bad = parsed.errors.length + res.errors.length
      setFlash(`${done.toLocaleString('fa-IR')} ردیف ثبت شد${bad ? ` · ${bad.toLocaleString('fa-IR')} ردیف رد شد` : ''}${res.errors[0] ? ` (${res.errors[0].message})` : ''}`)
      setImpOpen(false)
      resetImport()
      onImported?.()
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'ثبت اطلاعات ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="ورود از فایل حسابداری" />
      <div className="px-5 pb-5 space-y-3">
        <p className="text-sm text-muted leading-7">
          اگر قبلاً شارژ و هزینه‌ها را در اکسل نگه می‌داشتید، فایل را بارگذاری کنید تا در سامانه ثبت شود. موجودی اولیه‌ی صندوق را در «تنظیمات مالی» وارد کنید.
        </p>
        {flash && <p className="text-sm font-medium text-ok">{flash}</p>}
        <PrimaryButton
          onClick={() => {
            resetImport()
            setImpOpen(true)
          }}
        >
          <FileUp size={16} /> ورود از فایل حسابداری
        </PrimaryButton>
      </div>

      <Modal
        open={impOpen}
        title="ورود از فایل حسابداری"
        size="lg"
        onClose={() => setImpOpen(false)}
        footer={
          <PrimaryButton disabled={count === 0 || busy} onClick={() => void confirmImport()}>
            {busy ? 'در حال ثبت…' : `وارد کردن ${count ? `${count.toLocaleString('fa-IR')} ردیف` : ''}`}
          </PrimaryButton>
        }
      >
        <div className="space-y-3">
          <SelectField
            label="نوع اطلاعات"
            value={kind}
            options={KINDS}
            onChange={(e) => {
              setKind(e.target.value as ImportKind)
              resetImport()
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <GhostButton onClick={() => download(kind === 'charges' ? 'charges-template.csv' : 'expenses-template.csv', TEMPLATES[kind])}>
              <Download size={16} /> دانلود قالب
            </GhostButton>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv,text/csv"
              aria-label="فایل حسابداری"
              className="text-sm"
              onChange={(e) => void onFile(e.target.files?.[0], kind)}
            />
          </div>
          <p className="text-xs text-muted leading-6">
            ردیف اول عنوان ستون‌هاست. وضعیت شارژ: «پرداخت‌شده»، «در انتظار» یا «معوق». تاریخ‌ها جلالی (۱۴۰۵/۰۷/۱۰) یا میلادی. شماره‌ی واحد باید در ساختمان تعریف شده باشد. شارژ تکراری (همان واحد و دوره) جایگزین می‌شود مگر قبلاً پرداخت شده باشد؛ فاکتور با شماره‌ی تکراری دوباره ثبت نمی‌شود.
          </p>
          {fatal && <p className="text-sm font-medium text-bad">{fatal}</p>}
          {parsed && (
            <div className="rounded-xl border border-line p-3 text-sm space-y-1">
              <p>
                <b>{fileName}</b> — {count.toLocaleString('fa-IR')} ردیف سالم
                {parsed.errors.length > 0 && <span className="text-bad"> · {parsed.errors.length.toLocaleString('fa-IR')} ردیف دارای خطا</span>}
              </p>
              {parsed.errors.slice(0, 6).map((er) => (
                <p key={er.line + er.message} className="text-xs text-bad">
                  ردیف {er.line.toLocaleString('fa-IR')}: {er.message}
                </p>
              ))}
              {parsed.errors.length > 6 && <p className="text-xs text-muted">و {(parsed.errors.length - 6).toLocaleString('fa-IR')} خطای دیگر…</p>}
            </div>
          )}
        </div>
      </Modal>
    </Card>
  )
}
