import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { PlatformLoginDto } from './dto/platform-login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { Public } from './decorators/public.decorator'
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  /** ورود سوپرادمین — نام کاربری/رمز، بدون subdomain (کاربر سطح پلتفرم است) */
  @Public()
  @Post('platform-login')
  platformLogin(@Body() dto: PlatformLoginDto) {
    return this.authService.platformLogin(dto)
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
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user)
  }
}
