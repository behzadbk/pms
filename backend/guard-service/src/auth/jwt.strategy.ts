import { Injectable, UnauthorizedException } from '@nestjs/common'
import { jwtSecret } from './jwt-secret'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtPayload } from './decorators/current-user.decorator'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // در Production از RS256 + کلید عمومی (توزیع‌شده بین همه سرویس‌ها از طریق ConfigMap)
      // استفاده می‌شود تا سرویس‌های دیگر بدون تماس gRPC به identity-svc بتوانند توکن را
      // خودشان اعتبارسنجی کنند (بخش ۲ سند ARCHITECTURE-SAAS.md — کاهش تماس‌های داخلی).
      secretOrKey: jwtSecret(),
    })
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // این متد فقط payload معتبرِ امضاشده را برمی‌گرداند؛
    // خود Passport پیش از این متد صحت امضا و انقضا را تأیید کرده است.
    // refreshToken (عمر ۳۰ روزه) نباید به‌عنوان accessToken روی Endpointها پذیرفته شود
    if (payload.typ === 'refresh') {
      throw new UnauthorizedException('از refreshToken نمی‌توان برای دسترسی استفاده کرد')
    }
    return payload
  }
}
