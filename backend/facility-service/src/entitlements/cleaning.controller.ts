import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { CleaningService, isCleaner } from './cleaning.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_MSG = 'شناسه نامعتبر است'

export class CleaningStartDto {
  @Matches(UUID_RE, { message: UUID_MSG }) unitId: string
}
export class CleaningFinishDto {
  /** فقط وقتی نظافتچی فراموش کرده پایان را بزند و ساعت درست را وارد می‌کند؛ پیش‌فرض: همین الان */
  @IsOptional() @IsISO8601() endedAt?: string
  @IsOptional() @IsString() @MaxLength(120) note?: string
}
export class CleaningManualDto {
  @Matches(UUID_RE, { message: UUID_MSG }) unitId: string
  @IsISO8601() startedAt: string
  @IsISO8601() endedAt: string
  @IsOptional() @IsString() @MaxLength(120) note?: string
}
export class CleaningPreviewDto {
  @Matches(UUID_RE, { message: UUID_MSG }) unitId: string
  @IsISO8601() startedAt: string
  @IsOptional() @IsISO8601() endedAt?: string
}

function needCleaner(user: JwtPayload) {
  if (!isCleaner(user)) throw new ForbiddenException('فقط تیم نظافت منازل و مدیر')
}

/**
 * پنل «نظافت منازل» (کارمند با دسترسی housekeeping یا مدیر)
 *   GET  home · units?q= · units/:id · mine
 *   POST preview · start · :id/finish · :id/cancel · :id/void · manual
 * مصرف در موتور آفرها (خدمت «خانه‌داری») ثبت می‌شود؛ مازاد در صدور شارژ ماه بعد به شارژ واحد اضافه می‌شود.
 */
@Controller('entitlements/cleaning')
export class CleaningController {
  constructor(
    private readonly db: DatabaseService,
    private readonly svc: CleaningService,
  ) {}

  @Roles('admin', 'staff')
  @Get('home')
  home(@CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.home(client, user))
  }

  @Roles('admin', 'staff')
  @Get('units')
  units(@Query('q') q: string | undefined, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.units(client, q ?? ''))
  }

  @Roles('admin', 'staff')
  @Get('units/:id')
  unit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    if (!UUID_RE.test(id)) throw new BadRequestException(UUID_MSG)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.unitInfo(client, id))
  }

  @Roles('admin', 'staff')
  @Get('mine')
  mine(@Query('limit') limit: string | undefined, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.mine(client, user, Number(limit) || 30))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('preview')
  preview(@Body() body: CleaningPreviewDto, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) =>
      this.svc.preview(client, { unitId: body.unitId, startedAt: new Date(body.startedAt), endedAt: body.endedAt ? new Date(body.endedAt) : undefined }))
  }

  @Roles('admin', 'staff')
  @Post('start')
  start(@Body() body: CleaningStartDto, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.start(client, user, body.unitId))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post(':id/finish')
  finish(@Param('id', ParseUUIDPipe) id: string, @Body() body: CleaningFinishDto, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) =>
      this.svc.finish(client, user, id, { endedAt: body.endedAt ? new Date(body.endedAt) : undefined, note: body.note }))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.cancel(client, user, id))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post(':id/void')
  voidSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.voidSession(client, user, id))
  }

  @Roles('admin', 'staff')
  @Post('manual')
  manual(@Body() body: CleaningManualDto, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (client) =>
      this.svc.manual(client, user, { unitId: body.unitId, startedAt: new Date(body.startedAt), endedAt: new Date(body.endedAt), note: body.note }))
  }
}
