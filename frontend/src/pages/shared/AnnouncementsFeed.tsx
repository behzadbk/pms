import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useRole } from '../../context/RoleContext'
import { useAuth } from '../../context/AuthContext'
import { AnnouncementCard } from '../admin/Announcements'
import { useStore, submitVote, markNotificationsRead, type AnnouncementRec } from '../../lib/store'
import { useViewerAudiences } from '../../lib/access'

/**
 * اعلانات و نظرسنجی‌ها از دید ساکن / پرسنل / نگهبانی / حسابداری —
 * فقط مواردی که مخاطبشان شامل کاربر فعلی است نمایش داده می‌شود.
 */
export function AnnouncementsFeed() {
  const { role } = useRole()
  const { user } = useAuth()
  const { announcements } = useStore()
  const aud = useViewerAudiences()
  const voterKey = user?.id ?? `demo-${role}`
  const mine = announcements
    .filter((a) => a.audience.some((k) => aud.includes(k)))
    .sort((a, b) => Number(b.emergency) - Number(a.emergency))

  const reader = user?.id ?? role
  const audKey = aud.join('|')
  useEffect(() => {
    markNotificationsRead(reader, audKey.split('|'))
  }, [reader, audKey])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">اعلانات و نظرسنجی‌ها</h1>
        <p className="text-muted text-sm mt-1">اطلاعیه‌های مدیریت ساختمان و نظرسنجی‌هایی که می‌توانید در آن شرکت کنید</p>
      </div>
      {mine.length === 0 && (
        <Card>
          <p className="p-10 text-center text-sm text-muted">اعلان یا نظرسنجی‌ای برای شما وجود ندارد</p>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {mine.map((a) => {
          const voted = !!a.voters[voterKey]
          const closed = !!a.closesAt && new Date(a.closesAt) < new Date()
          return (
            <AnnouncementCard key={a.id} a={a} showResults={a.kind === 'poll' && (voted || closed)}>
              {a.kind === 'poll' && !voted && !closed && <VoteForm poll={a} onSubmit={(ans) => submitVote(a.id, voterKey, ans)} />}
              {a.kind === 'poll' && voted && (
                <p className="text-xs text-good flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> رأی شما ثبت شد
                </p>
              )}
            </AnnouncementCard>
          )
        })}
      </div>
    </div>
  )
}

function VoteForm({ poll, onSubmit }: { poll: AnnouncementRec; onSubmit: (answers: Record<string, string[]>) => void }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const complete = poll.questions.every((q) => (answers[q.id] ?? []).length > 0)

  function pick(qid: string, oid: string, multi: boolean) {
    setAnswers((a) => {
      const cur = a[qid] ?? []
      if (!multi) return { ...a, [qid]: [oid] }
      return { ...a, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] }
    })
  }

  return (
    <div className="space-y-4">
      {poll.questions.map((q, qi) => (
        <fieldset key={q.id}>
          <legend className="text-sm font-medium mb-2">
            {poll.questions.length > 1 && `${(qi + 1).toLocaleString('fa-IR')}. `}
            {q.text}
          </legend>
          <div className="space-y-2">
            {q.options.map((o) => {
              const checked = (answers[q.id] ?? []).includes(o.id)
              return (
                <label
                  key={o.id}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm cursor-pointer transition-colors ${
                    checked ? 'border-tile bg-tile-soft' : 'border-line hover:border-ink-soft'
                  }`}
                >
                  <input
                    type={q.multi ? 'checkbox' : 'radio'}
                    name={`${poll.id}-${q.id}`}
                    checked={checked}
                    onChange={() => pick(q.id, o.id, q.multi)}
                    className="accent-[var(--color-tile)]"
                  />
                  {o.label}
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
      <button
        disabled={!complete}
        onClick={() => onSubmit(answers)}
        className="w-full bg-tile text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40"
      >
        ثبت رأی
      </button>
    </div>
  )
}
