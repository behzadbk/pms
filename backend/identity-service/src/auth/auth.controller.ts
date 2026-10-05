import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { ChangePasswordDto } from './dto/change-password.dto'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { PlatformLoginDto } from './dto/platform-login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { Public } from './decorators/public.decorator'
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator'

/** IP کلاینت (پشت gateway: اولین مقدار X-Forwarded-For) — فقط برای کلید محدودسازی ورود */
export function clientIp(req: any): string {
  const xff = String(req?.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim()
  return xff || req?.ip || req?.socket?.remoteAddress || ''
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, clientIp(req))
  }

  /** ورود سوپرادمین — نام کاربری/رمز، بدون subdomain (کاربر سطح پلتفرم است) */
  @Public()
  @Post('platform-login')
  platformLogin(@Body() dto: PlatformLoginDto, @Req() req: any) {
    return this.authService.platformLogin(dto, clientIp(req))
  }

  // بدون @Public نیست چون accessToken منقضی‌شده اعتبارسنجی نمی‌شود — خود refreshToken
  // در body ارسال و اینجا جدا verify می‌شود (نه از طریق JwtAuthGuard/هدر Authorization)
  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken)
  }

  // پشت JwtAuthGuard (پیش‌فرض) — فرانت‌اند بعد از رفرش صفحه با accessToken ذخیره‌شده
  // نشست را از همین Endpoint بازیابی می‌کند
  /** تغییر رمز توسط خود کاربر؛ برای حساب‌های دارای رمز موقت اجباری است */
  @Post('change-password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto, @Req() req: any) {
    return this.authService.changePassword(user, dto.currentPassword, dto.newPassword, clientIp(req))
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user)
  }
}

