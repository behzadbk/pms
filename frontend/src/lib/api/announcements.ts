import { api } from './client'

/** اعلانات و نظرسنجی‌ها — notification-service (پشت /api/notification) */
const N = '/notification/announcements'

export interface PollOption { id: string; label: string; votes: number | null; weight: number | null }
export interface PollQuestion { id: string; text: string; multi: boolean; my_answers: string[]; options: PollOption[] }

export interface Announcement {
  id: string
  kind: 'announcement' | 'poll'
  title: string
  body: string
  emergency: boolean
  pinned: boolean
  weighted: boolean
  audience: { key: string; label: string }[]
  created_at: string
  closes_at: string | null
  expires_at: string | null
  created_by_name: string | null
  closed: boolean
  voted: boolean
  can_vote: boolean
  participants: number
  total_weight: number
  results_visible: boolean
  questions: PollQuestion[]
}

export interface AudienceGroup { key: string; label: string; group: string }

export interface PublishBody {
  kind: 'announcement' | 'poll'
  title: string
  body?: string
  emergency?: boolean
  pinned?: boolean
  audience: string[]
  units?: string[]
  closes_at?: string
  expires_at?: string
  weighted?: boolean
  questions?: { text: string; multi?: boolean; options: { label: string }[] }[]
}

export const announcementsApi = {
  feed: () => api.get<Announcement[]>(N),
  audiences: () => api.get<{ groups: AudienceGroup[] }>(`${N}/audiences`),
  publish: (b: PublishBody) => api.post<{ id: string; recipients: number }>(N, b),
  remove: (id: string) => api.delete(`${N}/${id}`),
  patch: (id: string, b: { pinned?: boolean; close_now?: boolean }) => api.patch(`${N}/${id}`, b),
  vote: (id: string, answers: Record<string, string[]>) => api.post(`${N}/${id}/vote`, { answers }),
}
