import { Card } from '../../components/ui/Card'
import { unitsDirectory as units } from '../../lib/mockData'

export function AdminUnits() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">مدیریت واحدها</h1>
        <p className="text-muted text-sm mt-1">پروفایل واحدها، مالکین، مستأجرین و متراژ</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted border-b border-line">
                <th className="font-medium px-5 py-3">واحد</th>
                <th className="font-medium px-5 py-3">مالک / مستأجر</th>
                <th className="font-medium px-5 py-3">متراژ</th>
                <th className="font-medium px-5 py-3">تعداد نفرات</th>
                <th className="font-medium px-5 py-3">وضعیت سکونت</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.unit} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{u.unit}</td>
                  <td className="px-5 py-3">{u.owner}</td>
                  <td className="px-5 py-3 text-muted">{u.area} متر</td>
                  <td className="px-5 py-3 text-muted">{u.occupants} نفر</td>
                  <td className="px-5 py-3 text-muted">{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
