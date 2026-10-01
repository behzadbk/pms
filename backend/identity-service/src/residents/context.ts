import { createParamDecorator, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

/** زمینه‌ی درخواست برای ممیزی: چه کسی، از کدام نشست، کدام مسیر */
export interface RequestCtx {
  user: JwtPayload
  sessionId: string
  traceId: string
  method: string
  path: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ReqCtx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestCtx => {
  const req = ctx.switchToHttp().getRequest()
  const sid = String(req.headers['x-session-id'] ?? '')
  const tid = String(req.headers['x-trace-id'] ?? '')
  return {
    user: req.user,
    sessionId: UUID_RE.test(sid) ? sid : randomUUID(),
    traceId: UUID_RE.test(tid) ? tid : randomUUID(),
    method: req.method,
    path: req.originalUrl ?? req.url,
  }
})

/**
 * «مدیر فقط ساختمان خودش؛ سوپرادمین هر ساختمان (با building_id)».
 * ساختمان در این API همان tenant است.
 */
export function scopeTenant(user: JwtPayload, buildingId?: string | null): string {
  if (user.role === 'super_admin') {
    if (!buildingId) throw new BadRequestException('برای سوپرادمین building_id لازم است')
    if (!UUID_RE.test(buildingId)) throw new BadRequestException('building_id نامعتبر است')
    return buildingId
  }
  if (!user.tenant_id) throw new ForbiddenException('ساختمانی به حساب شما وصل نیست')
  if (buildingId && buildingId !== user.tenant_id) {
    throw new ForbiddenException('فقط به ساختمان خودتان دسترسی دارید')
  }
  return user.tenant_id
}

/** ثبت در audit.event_logs داخل همان تراکنش — تغییر بدون ردپا ممکن نیست */
export async function writeAudit(
  client: PoolClient,
  tenantId: string,
  ctx: RequestCtx | null,
  action: string,
  body: Record<string, unknown>,
  statusCode = 200,
) {
  await client.query(
    `INSERT INTO audit.event_logs
       (tenant_id, session_id, trace_id, user_id, actor_role, source, level, action,
        http_method, http_path, status_code, request_body)
     VALUES ($1, $2, $3, $4, $5, 'identity-svc', 'info', $6, $7, $8, $9, $10)`,
    [
      tenantId,
      ctx?.sessionId ?? randomUUID(),
      ctx?.traceId ?? null,
      ctx?.user && UUID_RE.test(ctx.user.sub) ? ctx.user.sub : null,
      ctx?.user?.role ?? 'system',
      action,
      ctx?.method ?? null,
      ctx?.path ?? null,
      statusCode,
      JSON.stringify(body),
    ],
  )
}

export interface Recipient {
  person?: string | null
  login?: string | null
  role?: string | null
}

/** صندوق اعلان داخل برنامه (notification.inbox) — در همان تراکنش */
export async function notify(
  client: PoolClient,
  tenantId: string,
  to: Recipient | Recipient[],
  n: { kind: string; title: string; body?: string | null; link?: string | null; ref?: string | null },
) {
  for (const r of Array.isArray(to) ? to : [to]) {
    if (!r.person && !r.login && !r.role) continue
    await client.query(
      `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_login, recipient_role, kind, title, body, link, ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, r.person ?? null, r.login ?? null, r.role ?? null, n.kind, n.title, n.body ?? null, n.link ?? null, n.ref ?? null],
    )
  }
}
