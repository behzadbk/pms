import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DatabaseService } from '../database/database.service'
import { hashKey, parseKey } from './keys'

export type ErpScope = 'read' | 'sync'

export interface ErpCaller {
  keyId: string
  keyName: string
  tenantId: string
  scopes: ErpScope[]
}

export const ERP_SCOPE_KEY = 'erpScope'
/** حداقل scope لازم برای endpoint (پیش‌فرض read) */
export const RequireScope = (scope: ErpScope) => SetMetadata(ERP_SCOPE_KEY, scope)

export const Erp = createParamDecorator((_: unknown, ctx: ExecutionContext): ErpCaller => ctx.switchToHttp().getRequest().erp)

/**
 * احراز هویت ERP با کلید API (هدر X-API-Key یا «Authorization: ApiKey <key>»).
 * این endpointها JWT کاربر را نمی‌پذیرند و برعکس: کلید ERP روی endpointهای پنل کار نمی‌کند.
 */
@Injectable()
export class ErpKeyGuard implements CanActivate {
  /** آخرین زمان ثبت last_used_at برای هر کلید — برای جلوگیری از یک UPDATE در هر درخواست */
  private readonly touched = new Map<string, number>()

  constructor(
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const header = (req.headers['x-api-key'] as string | undefined) ?? ''
    const auth = (req.headers['authorization'] as string | undefined) ?? ''
    const raw = header || (auth.toLowerCase().startsWith('apikey ') ? auth.slice(7) : '')
    if (!raw) throw new UnauthorizedException('کلید API ارسال نشده است (هدر X-API-Key)')

    const parsed = parseKey(raw)
    if (!parsed) throw new UnauthorizedException('قالب کلید API نامعتبر است')
    if (process.env.NODE_ENV === 'production' && parsed.env === 'test') {
      throw new UnauthorizedException('کلید تست در محیط عملیاتی پذیرفته نمی‌شود')
    }

    const hash = hashKey(raw)
    const row = await this.db.withTenant(parsed.tenantId, async (c) =>
      (
        await c.query<{ id: string; name: string; scopes: ErpScope[]; status: string; expires_at: Date | null }>(
          `SELECT id, name, scopes, status, expires_at FROM integration.api_keys WHERE key_hash = $1`,
          [hash],
        )
      ).rows[0],
    )
    if (!row) throw new UnauthorizedException('کلید API نامعتبر است')
    if (row.status !== 'active') throw new UnauthorizedException('این کلید API باطل شده است')
    if (row.expires_at && row.expires_at.getTime() < Date.now()) throw new UnauthorizedException('کلید API منقضی شده است')

    const need = this.reflector.getAllAndOverride<ErpScope>(ERP_SCOPE_KEY, [context.getHandler(), context.getClass()]) ?? 'read'
    if (!row.scopes.includes(need)) throw new ForbiddenException(`این کلید مجوز «${need}» ندارد`)

    req.erp = { keyId: row.id, keyName: row.name, tenantId: parsed.tenantId, scopes: row.scopes } satisfies ErpCaller

    const last = this.touched.get(row.id) ?? 0
    if (Date.now() - last > 60_000) {
      this.touched.set(row.id, Date.now())
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || null
      void this.db
        .withTenant(parsed.tenantId, (c) =>
          c.query(`UPDATE integration.api_keys SET last_used_at = now(), last_used_ip = $2 WHERE id = $1`, [row.id, ip]),
        )
        .catch(() => undefined)
    }
    return true
  }
}
