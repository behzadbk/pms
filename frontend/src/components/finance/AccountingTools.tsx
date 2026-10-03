import { useRef, useState } from 'react'
import { Download, FileUp, Wallet } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Modal, PrimaryButton, GhostButton, SelectField, TextField } from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { importCharges, importInvoices, setOpeningBalance, useStore } from '../../lib/store'
import { TEMPLATES, normDigits, parseAmount, parseCharges, parseExpenses, readTable, type ImportKind } from '../../lib/accountingImport'
import { toman } from '../../lib/mockData'
import type { ChargeRec, InvoiceRec } from '../../lib/store'

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
 * ساختمان تازه حسابداری خام (همه‌چیز ۰) دارد؛ این بخش سه راه ورود اطلاعات می‌دهد:
 * موجودی اولیه‌ی صندوق (دستی)، ورود از فایل حسابداری (اکسل/CSV)، و ثبت دستی در صفحه‌های شارژ و فاکتور.
 */
export function AccountingTools() {
  const { openingBalance, charges, invoices } = useStore()
  const { user } = useAuth()
  const [balOpen, setBalOpen] = useState(false)
  const [bal, setBal] = useState('')
  const [impOpen, setImpOpen] = useState(false)
  const [kind, setKind] = useState<ImportKind>('charges')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<{ charges?: Omit<ChargeRec, 'id'>[]; expenses?: Omit<InvoiceRec, 'id'>[]; errors: { line: number; message: string }[] } | null>(null)
  const [fatal, setFatal] = useState('')
  const [flash, setFlash] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const empty = charges.length === 0 && invoices.length === 0 && openingBalance === 0
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
        const r = parseExpenses(table, user?.fullName ?? 'ورود از فایل')
        setParsed({ expenses: r.rows, errors: r.errors })
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'خواندن فایل ممکن نشد')
    }
  }

  function confirmImport() {
    if (!parsed || count === 0) return
    if (kind === 'charges' && parsed.charges) importCharges(parsed.charges)
    if (kind === 'expenses' && parsed.expenses) importInvoices(parsed.expenses)
    setFlash(`${count.toLocaleString('fa-IR')} ردیف وارد شد${parsed.errors.length ? ` · ${parsed.errors.length.toLocaleString('fa-IR')} ردیف نادیده گرفته شد` : ''}`)
    setImpOpen(false)
    resetImport()
  }

  const balNum = parseAmount(normDigits(bal))

  return (
    <Card>
      <CardHeader title="اطلاعات حسابداری" />
      <div className="px-5 pb-5 space-y-3">
        {empty && (
          <p className="text-sm text-muted leading-7">
            این ساختمان هنوز اطلاعات مالی ندارد و همه‌ی مبالغ ۰ است. موجودی اولیه را وارد کنید، فایل حسابداری (اکسل/CSV) را بارگذاری کنید یا شارژ و فاکتورها را دستی ثبت کنید.
          </p>
        )}
        {flash && <p className="text-sm font-medium text-ok">{flash}</p>}
        <div className="flex flex-wrap gap-2">
          <GhostButton
            onClick={() => {
              setBal(openingBalance ? String(openingBalance) : '')
              setBalOpen(true)
            }}
          >
            <Wallet size={16} /> موجودی اولیه صندوق: {toman(openingBalance)}
          </GhostButton>
          <PrimaryButton
            onClick={() => {
              resetImport()
              setImpOpen(true)
            }}
          >
            <FileUp size={16} /> ورود از فایل حسابداری
          </PrimaryButton>
        </div>
      </div>

      <Modal
        open={balOpen}
        title="موجودی اولیه‌ی صندوق"
        onClose={() => setBalOpen(false)}
        footer={
          <PrimaryButton
            disabled={balNum === null || balNum < 0}
            onClick={() => {
              setOpeningBalance(balNum ?? 0)
              setBalOpen(false)
            }}
          >
            ذخیره
          </PrimaryButton>
        }
      >
        <TextField label="مبلغ (تومان)" inputMode="numeric" value={bal} onChange={(e) => setBal(e.target.value)} hint="موجودی صندوق در لحظه‌ی شروع استفاده از سامانه؛ ۰ یعنی صندوق خالی." />
      </Modal>

      <Modal
        open={impOpen}
        title="ورود از فایل حسابداری"
        size="lg"
        onClose={() => setImpOpen(false)}
        footer={
          <PrimaryButton disabled={count === 0} onClick={confirmImport}>
            وارد کردن {count ? `${count.toLocaleString('fa-IR')} ردیف` : ''}
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
            ردیف اول عنوان ستون‌هاست. وضعیت شارژ: «پرداخت‌شده»، «در انتظار» یا «معوق». تاریخ‌ها جلالی (۱۴۰۵/۰۷/۱۰) یا میلادی. شارژ تکراری (همان واحد و دوره) جایگزین می‌شود.
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
