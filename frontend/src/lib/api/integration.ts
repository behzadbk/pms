import { api } from './client'

/**
 * اتصال ERP / نرم‌افزار حسابداری — integration-service (پشت /api/integration).
 * فقط مدیر ساختمان و حسابدار. جهت داده: همین → ERP.
 */
const I = '/integration/admin'

/** آدرس مستندات Swagger برای تیم ERP (نسبی به همان دامنه‌ی اپ) */
export const ERP_DOCS_URL = '/api/integration/docs'

export type ErpEntity = 'building' | 'unit' | 'party' | 'staff' | 'charge' | 'payment' | 'expense' | 'fnb_order' | 'service_usage'

export const ENTITY_FA: Record<ErpEntity, string> = {
  building: 'ساختمان',
  unit: 'واحدها',
  party: 'اشخاص (مالک/مستأجر)',
  staff: 'کارکنان',
  charge: 'شارژهای صادرشده',
  payment: 'پرداخت‌ها',
  expense: 'فاکتورهای هزینه',
  fnb_order: 'سفارش کافه/رستوران',
  service_usage: 'مصرف خدمات و مازاد آفر',
}

export interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  status: 'active' | 'revoked'
  expires_at: string | null
  last_used_at: string | null
  last_used_ip: string | null
  created_by_name: string | null
  created_at: string
  revoked_at: string | null
}

export interface Connector {
  id: string
  name: string
  type: string
  url: string
  entities: string[]
  status: 'active' | 'paused'
  batchSize: number
  cursorSeq: number
  pending: number
  failureCount: number
  nextAttemptAt: string | null
  lastStatus: string | null
  lastError: string | null
  lastSuccessAt: string | null
  createdAt: string
}

export interface Overview {
  latestSeq: number
  activeKeys: number
  lastPullAt: string | null
  connectors: Connector[]
  sync: { entity: string; status: 'synced' | 'failed' | 'skipped'; count: number }[]
  changesLast30Days: { entity: string; count: number; lastAt: string }[]
  entities: { name: ErpEntity; title: string; path: string }[]
  adapters: { type: string; label: string }[]
}

export interface Delivery {
  id: string
  from_seq: number
  to_seq: number
  event_count: number
  attempt: number
  success: boolean
  status_code: number | null
  error: string | null
  duration_ms: number | null
  created_at: string
}

export interface SyncIssue {
  entity: ErpEntity
  id: string
  status: string
  erp_ref: string | null
  message: string | null
  synced_at: string
}

export const integrationApi = {
  overview: () => api.get<Overview>(`${I}/overview`),
  keys: () => api.get<ApiKey[]>(`${I}/keys`),
  createKey: (body: { name: string; scopes?: string[]; expiresInDays?: number }) =>
    api.post<ApiKey & { key: string; warning: string }>(`${I}/keys`, body),
  revokeKey: (id: string) => api.post<{ id: string }>(`${I}/keys/${id}/revoke`),
  connectors: () => api.get<Connector[]>(`${I}/connectors`),
  createConnector: (body: { name: string; url: string; entities?: string[]; startFrom?: 'now' | 'beginning' }) =>
    api.post<Connector & { secret: string }>(`${I}/connectors`, body),
  updateConnector: (id: string, body: Partial<{ name: string; url: string; status: 'active' | 'paused'; entities: string[]; rotateSecret: boolean }>) =>
    api.patch<Connector & { secret?: string }>(`${I}/connectors/${id}`, body),
  deleteConnector: (id: string) => api.delete<{ id: string }>(`${I}/connectors/${id}`),
  testConnector: (id: string) => api.post<{ ok: boolean; statusCode?: number; error?: string; durationMs: number }>(`${I}/connectors/${id}/test`),
  runConnector: (id: string) =>
    api.post<{ sent?: number; message?: string; result?: { ok: boolean; error?: string } | null }>(`${I}/connectors/${id}/run`),
  deliveries: (id: string) => api.get<Delivery[]>(`${I}/connectors/${id}/deliveries?limit=50`),
  backfill: (entities?: ErpEntity[]) => api.post<{ queued: Record<string, number> }>(`${I}/backfill`, { entities }),
  syncIssues: () => api.get<SyncIssue[]>(`${I}/sync-issues`),
}
