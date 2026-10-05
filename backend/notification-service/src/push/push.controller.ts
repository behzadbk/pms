import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { IsString, IsUrl, MaxLength, ValidateNested, IsOptional } from 'class-validator'
import { Type } from 'class-transformer'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { PushService } from './push.service'

class KeysDto {
  @IsString() @MaxLength(200) p256dh: string
  @IsString() @MaxLength(200) auth: string
}
class SubscribeDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false }) @MaxLength(1000) endpoint: string
  @ValidateNested() @Type(() => KeysDto) keys: KeysDto
  @IsOptional() @IsString() @MaxLength(300) userAgent?: string
}
class EndpointDto {
  @IsString() @MaxLength(1000) endpoint: string
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** کلید عمومی VAPID — مرورگر برای subscribe لازم دارد */
  @Get('key')
  key() {
    return this.push.getPublicKey()
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(@CurrentUser() user: JwtPayload, @Body() dto: SubscribeDto) {
    return this.push.subscribe(user, dto)
  }

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentUser() user: JwtPayload, @Body() dto: EndpointDto) {
    return this.push.unsubscribe(user, dto.endpoint)
  }

  @Get('status')
  status(@CurrentUser() user: JwtPayload, @Query('endpoint') endpoint: string) {
    return this.push.status(user, endpoint ?? '')
  }

  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() user: JwtPayload) {
    return this.push.sendTest(user)
  }
}
