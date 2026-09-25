import { Link } from 'react-router-dom'
import { FileText, Wallet } from 'lucide-react'
import { FinanceOverview } from '../../components/finance/FinanceOverview'

export function AccountantDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">داشبورد حسابداری</h1>
          <p className="text-muted text-sm mt-1">صندوق ساختمان، وصول شارژ و فاکتورهای هزینه</p>
        </div>
        <div className="flex gap-2">
          <Link to="/accountant/charges" className="flex items-center gap-2 border border-line px-4 py-2.5 rounded-xl text-sm font-medium hover:border-ink-soft">
            <Wallet size={16} /> شارژ و مطالبات
          </Link>
          <Link to="/accountant/invoices" className="flex items-center gap-2 bg-ink text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
            <FileText size={16} /> فاکتورها
          </Link>
        </div>
      </div>
      <FinanceOverview />
    </div>
  )
}
