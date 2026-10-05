import { useEffect, useState } from 'react'
import { CheckCircle2, Megaphone } from 'lucide-react'
import { announcementsApi, type Announcement } from '../../lib/api/announcements'
import { errText, residentsApi } from '../../lib/api/residents'
import { Cta, EmptyState, ErrorBlock, Loading, PageTitle, useLoad, useToast } from '../../components/hm'
import { AnnouncementCard } from '../admin/Announcements'

/**
 * اعلانات و نظرسنجی‌ها از دید ساکن / پرسنل / نگهبانی / حسابداری —
 * سرور فقط مواردی را برمی‌گرداند که مخاطبشان شامل کاربر فعلی است.
 */
export function AnnouncementsFeed() {
  const { data, error, loading, reload } = useLoad<Announcement[]>(() => announcementsApi.feed(), [])
  const { toast, toastNode } = useToast()

  useEffect(() => {
    document.title = 'اعلانات · همین'
    const t = window.setInterval(() => document.visibilityState === 'visible' && void reload(true), 60_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // اعلان‌های همین موارد در صندوق اعلان با باز شدن صفحه خوانده می‌شوند
  useEffect(() => {
    let live = true
    residentsApi
      .inbox()
      .then(async (r) => {
        for (const n of r.items) if (live && !n.read && (n.kind === 'announcement' || n.kind === 'poll')) await residentsApi.readInbox(n.id).catch(() => undefined)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  async function vote(a: Announcement, answers: Record<string, string[]>) {
    try {
      await announcementsApi.vote(a.id, answers)
      toast('رأی شما ثبت شد')
      await reload(true)
    } catch (e) {
      toast(errText(e))
    }
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4 hm-fade-in">
      <PageTitle kicker="تابلو" title="اعلانات و نظرسنجی‌ها" />
      <p className="text-sm text-[var(--hm-t2)] -mt-2 leading-7">اطلاعیه‌های مدیریت ساختمان و نظرسنجی‌هایی که می‌توانید در آن شرکت کنید</p>
      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBlock message={error ?? ''} retry={() => void reload()} />
      ) : data.length === 0 ? (
        <EmptyState icon={Megaphone} title="اعلان یا نظرسنجی‌ای برای شما وجود ندارد" tone="mute" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          {data.map((a) => (
            <AnnouncementCard key={a.id} a={a}>
              {a.kind === 'poll' && a.can_vote && <VoteForm poll={a} onSubmit={(ans) => vote(a, ans)} />}
              {a.kind === 'poll' && a.voted && (
                <p className="text-xs flex items-center gap-1.5 text-[var(--hm-ok)]">
                  <CheckCircle2 size={14} /> رأی شما ثبت شد
                </p>
              )}
              {a.kind === 'poll' && !a.voted && a.closed && <p className="text-xs text-[var(--hm-t2)]">مهلت شرکت تمام شده است.</p>}
            </AnnouncementCard>
          ))}
        </div>
      )}
      {toastNode}
    </div>
  )
}

function VoteForm({ poll, onSubmit }: { poll: Announcement; onSubmit: (answers: Record<string, string[]>) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const complete = poll.questions.every((q) => (answers[q.id] ?? []).length > 0)

  function pick(qid: string, oid: string, multi: boolean) {
    setAnswers((a) => {
      const cur = a[qid] ?? []
      if (!multi) return { ...a, [qid]: [oid] }
      return { ...a, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {poll.questions.map((q, qi) => (
        <fieldset key={q.id}>
          <legend className="text-sm font-bold mb-2">
            {poll.questions.length > 1 && `${qi + 1}. `}
            {q.text}
            {q.multi && <span className="text-xs text-[var(--hm-t2)] font-normal"> (می‌توانید چند گزینه انتخاب کنید)</span>}
          </legend>
          <div className="flex flex-col gap-2">
            {q.options.map((o) => {
              const checked = (answers[q.id] ?? []).includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  role={q.multi ? 'checkbox' : 'radio'}
                  aria-checked={checked}
                  onClick={() => pick(q.id, o.id, q.multi)}
                  className="hm-row min-h-[48px] !py-2.5"
                  style={checked ? { borderColor: 'var(--hm-pri)', background: 'var(--hm-pri-soft)' } : undefined}
                >
                  <span className={`w-5 h-5 shrink-0 border-2 flex items-center justify-center ${q.multi ? 'rounded-md' : 'rounded-full'}`} style={{ borderColor: checked ? 'var(--hm-pri)' : 'var(--hm-t3)' }}>
                    {checked && <span className={`w-2.5 h-2.5 ${q.multi ? 'rounded-sm' : 'rounded-full'}`} style={{ background: 'var(--hm-pri)' }} />}
                  </span>
                  <span className="text-sm font-bold">{o.label}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <Cta
        busy={busy}
        disabled={!complete}
        onClick={async () => {
          setBusy(true)
          try {
            await onSubmit(answers)
          } finally {
            setBusy(false)
          }
        }}
      >
        ثبت رأی
      </Cta>
    </div>
  )
}
