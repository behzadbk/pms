/** باید دقیقاً با envelope تعریف‌شده در docs/ARCHITECTURE-SAAS.md بخش ۲ یکسان باشد. */
export interface EventEnvelope<T = Record<string, unknown>> {
  event_id: string
  event_type: string
  tenant_id: string | null
  occurred_at: string
  payload: T
  trace_id: string
}
