import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorBlock, Loading, PageTitle, Seg, useLoad, useToast } from '../../components/hm'
import { amenitiesApi, type ManageData } from '../../lib/api/amenities'
import { fa } from '../../lib/api/residents'
import { BoardTab } from './amenities/BoardTab'
import { RequestsTab } from './amenities/RequestsTab'
import { SetupTab } from './amenities/SetupTab'

type Tab = 'requests' | 'board' | 'setup'

/**
 * مدیریت مشاعات — مدیر و مسئول مشاعات (دسترسی amenity_desk):
 *  درخواست‌ها (تأیید/رد/لغو با اعلان به ساکن)، برنامه‌ی روز (ثبت دستی)، تعریف مشاع و تایم‌تیبل.
 */
export function AmenityManager() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'requests'
  const { data, error, loading, reload } = useLoad<ManageData>(() => amenitiesApi.manage(), [])
  const { toast, toastNode } = useToast()

  useEffect(() => {
    document.title = 'مشاعات · همین'
  }, [])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBlock message={error ?? ''} retry={() => void reload()} />
  const pending = data.amenities.reduce((s, a) => s + a.pending_count, 0)
  const refresh = () => reload(true)

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="مدیریت" title="مشاعات" />
      <Seg<Tab>
        options={[
          ['requests', pending ? `درخواست‌ها (${fa(pending)})` : 'درخواست‌ها'],
          ['board', 'برنامه‌ی روز'],
          ['setup', 'تعریف و تایم‌تیبل'],
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
      />
      {tab === 'requests' && <RequestsTab amenities={data.amenities.filter((a) => a.is_active)} toast={toast} onChanged={refresh} />}
      {tab === 'board' && <BoardTab toast={toast} onChanged={refresh} />}
      {tab === 'setup' && <SetupTab amenities={data.amenities} closures={data.closures} toast={toast} onChanged={refresh} />}
      {toastNode}
    </div>
  )
}
