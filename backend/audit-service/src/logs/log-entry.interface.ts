export interface DeviceMeta {
  os?: string
  os_version?: string
  browser?: string
  browser_version?: string
  model?: string
  viewport?: string
  is_pwa?: boolean
}

export interface LogEntry {
  tenant_id: string
  occurred_at?: string
  session_id: string
  trace_id?: string
  user_id?: string
  actor_role?: string
  source: string
  level: 'debug' | 'info' | 'warn' | 'error'
  action: string
  http_method?: string
  http_path?: string
  status_code?: number
  duration_ms?: number
  device?: DeviceMeta
  request_body?: unknown
  response_body?: unknown
  error_stack?: string
}
