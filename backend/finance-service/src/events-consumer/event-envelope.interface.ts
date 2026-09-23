export interface EventEnvelope<T = Record<string, unknown>> {
  event_id: string
  event_type: string
  tenant_id: string | null
  occurred_at: string
  payload: T
  trace_id: string
}
