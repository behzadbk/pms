import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { COMMENT_MAX } from './cleaning-feedback'
import { CleaningFeedbackService, isCleaningReviewer } from './cleaning-feedback.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class FeedbackDto {
  @IsInt({ message: 'نمره باید ۱ تا ۵ ستاره باشد' }) @Min(1, { message: 'نمره باید ۱ تا ۵ ستاره باشد' }) @Max(5, { message: 'نمره باید ۱ تا ۵ ستاره باشد' }) rating: number
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) reasons?: string[]
  @IsOptional() @IsString() @MaxLength(COMMENT_MAX) comment?: string
}

/**
 * بازخورد ساکن از نظافت منزل
 *   ساکن            : GET me/pending · POST me/:sessionId/feedback
 *   مدیر/مسئول نظافت: GET feedback?cleanerId=&low=1&limit=
 */
@Controller('entitlements/cleaning')
export class CleaningFeedbackController {
  constructor(
    private readonly db: DatabaseService,
    private readonly svc: CleaningFeedbackService,
  ) {}

  @Roles('resident')
  @Get('me/pending')
  pending(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.pending(client, user))
  }

  @Roles('resident')
  @HttpCode(201)
  @Post('me/:sessionId/feedback')
  submit(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() body: FeedbackDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.submit(client, user, sessionId, body))
  }

  @Roles('admin', 'staff')
  @Get('feedback')
  list(@Query('cleanerId') cleanerId: string | undefined, @Query('low') low: string | undefined, @Query('limit') limit: string | undefined, @CurrentUser() user: JwtPayload) {
    if (!isCleaningReviewer(user)) throw new ForbiddenException('فقط مدیر و مسئول نظافت')
    if (cleanerId && !UUID_RE.test(cleanerId)) throw new BadRequestException('شناسه نامعتبر است')
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.list(client, { cleanerId, lowOnly: low === '1', limit: Number(limit) || 50 }))
  }
}
