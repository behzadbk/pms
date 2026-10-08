import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JWT_ALGORITHMS, jwtSecret } from './jwt-secret'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtPayload } from './decorators/current-user.decorator'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly db: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // در Production از RS256 + کلید عمومی (توزیع‌شده بین همه سرویس‌ها از طریق ConfigMap)
      // استفاده می‌شود تا سرویس‌های دیگر بدون تماس gRPC به identity-svc بتوانند توکن را
      // خودشان اعتبارسنجی کنند (بخش ۲ سند ARCHITECTURE-SAAS.md — کاهش تماس‌های داخلی).
      secretOrKey: jwtSecret(),
      algorithms: JWT_ALGORITHMS,
    })
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // این متد فقط payload معتبرِ امضاشده را برمی‌گرداند؛
    // خود Passport پیش از این متد صحت امضا و انقضا را تأیید کرده است.
    // refreshToken (عمر ۳۰ روزه) نباید به‌عنوان accessToken روی Endpointها پذیرفته شود
    if (payload.typ === 'refresh') {
      throw new UnauthorizedException('از refreshToken نمی‌توان برای دسترسی استفاده کرد')
    }
    // «خروج از همه‌ی دستگاه‌ها»، مسدودسازی، تخلیه و حذف عضو: در identity-svc فوراً اعمال می‌شود
    // (سرویس‌های دیگر حداکثر تا انقضای ۱۵ دقیقه‌ای accessToken؛ تمدید هم رد می‌شود).
    if (payload.tenant_id && payload.role !== 'super_admin') {
      const revoked = await this.db.withTenant(payload.tenant_id, async (c) => {
        const r = payload.kind === 'family'
          ? await c.query<{ ok: boolean }>(
            `SELECT (p.status = 'active' AND m.status = 'active'
                     AND to_timestamp($3) >= p.sessions_valid_after - interval '1 second') AS ok
               FROM residency.users p JOIN residency.memberships m ON m.user_id = p.id AND m.id = $2
              WHERE p.id = $1`, [payload.sub, payload.mid ?? null, payload.iat ?? 0])
          : await c.query<{ ok: boolean }>(
            `SELECT (u.is_active
                     AND COALESCE(p.status, 'active') = 'active'
                     AND to_timestamp($2) >= GREATEST(u.sessions_valid_after, COALESCE(p.sessions_valid_after, '-infinity')) - interval '1 second') AS ok
               FROM identity.users u LEFT JOIN residency.users p ON p.id = u.person_id
              WHERE u.id = $1`, [payload.sub, payload.iat ?? 0])
        return !r.rows[0]?.ok
      })
      if (revoked) throw new UnauthorizedException('نشست شما باطل شده است؛ دوباره وارد شوید')
    } else if (payload.role === 'super_admin') {
      // سوپرادمین: غیرفعال‌شدن یا تغییر رمز باید accessToken جاری را هم (نه فقط تمدید را) فوراً از کار بیندازد
      const ok = await this.db.withPlatformAccess(async (c) => {
        const r = await c.query<{ ok: boolean }>(
          `SELECT (is_active AND to_timestamp($2) >= sessions_valid_after - interval '1 second') AS ok
             FROM identity.platform_admins WHERE id = $1`, [payload.sub, payload.iat ?? 0])
        return !!r.rows[0]?.ok
      })
      if (!ok) throw new UnauthorizedException('نشست شما باطل شده است؛ دوباره وارد شوید')
    }
    return payload
  }
}
