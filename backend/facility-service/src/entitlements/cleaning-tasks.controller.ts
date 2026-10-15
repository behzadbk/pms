import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { isCleaner } from './cleaning.service'
import { isSupervisor, CleaningTasksService } from './cleaning-tasks.service'
import { SLOTS, TASK_KINDS, type Slot, type TaskKind } from './cleaning-tasks'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class ResidentRequestDto {
  @IsOptional() @Matches(DATE_RE, { message: 'تاریخ نامعتبر است' }) wantDate?: string
  @IsOptional() @IsIn(SLOTS as unknown as string[], { message: 'بازه‌ی ساعت نامعتبر است' }) wantSlot?: string
  @IsOptional() @IsString() @MaxLength(500) note?: string
}
export class CreateTaskDto {
  @IsIn(TASK_KINDS as unknown as string[], { message: 'نوع کار نامعتبر است' }) kind: TaskKind
  @IsOptional() @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) unitId?: string
  @IsOptional() @IsString() @MaxLength(120) title?: string
  @IsOptional() @IsString() @MaxLength(500) details?: string
  @IsOptional() @Matches(DATE_RE, { message: 'تاریخ نامعتبر است' }) wantDate?: string
  @IsOptional() @IsIn(SLOTS as unknown as string[]) wantSlot?: Slot
  @IsOptional() @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) assigneeId?: string
}
export class AssignDto {
  @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) assigneeId: string
  @IsOptional() @Matches(DATE_RE, { message: 'تاریخ نامعتبر است' }) wantDate?: string
  @IsOptional() @IsIn(SLOTS as unknown as string[]) wantSlot?: Slot
}
export class CancelTaskDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string
}
export class TaskNoteDto {
  @IsOptional() @IsString() @MaxLength(200) note?: string
}
export class TaskManualDto {
  @IsISO8601() startedAt: string
  @IsISO8601() endedAt: string
  @IsOptional() @IsString() @MaxLength(120) note?: string
}

const needSupervisor = (u: JwtPayload) => {
  if (!isSupervisor(u)) throw new ForbiddenException('فقط مسئول نظافت و مدیر')
}
const needCleaner = (u: JwtPayload) => {
  if (!isCleaner(u)) throw new ForbiddenException('فقط کادر نظافت و مدیر')
}

/**
 * کارهای نظافت — درخواست ساکن ← مسئول نظافت ← واگذاری به کادر
 *   ساکن         : GET me/requests · POST me/requests · POST me/requests/:id/cancel
 *   مسئول/مدیر   : GET tasks/board · tasks/units?q= · POST tasks · tasks/:id/assign · tasks/:id/cancel
 *   نظافتچی      : GET tasks/mine · POST tasks/:id/start · tasks/:id/finish · tasks/:id/undo · tasks/:id/manual
 */
@Controller('entitlements/cleaning')
export class CleaningTasksController {
  constructor(
    private readonly db: DatabaseService,
    private readonly svc: CleaningTasksService,
  ) {}

  // ── ساکن
  @Roles('resident')
  @Get('me/requests')
  myRequests(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.myRequests(c, user))
  }

  @Roles('resident')
  @Post('me/requests')
  request(@Body() body: ResidentRequestDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.request(c, user, body))
  }

  @Roles('resident')
  @HttpCode(200)
  @Post('me/requests/:id/cancel')
  cancelRequest(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.cancelRequest(c, user, id))
  }

  // ── مسئول نظافت / مدیر
  @Roles('admin', 'staff')
  @Get('tasks/board')
  board(@CurrentUser() user: JwtPayload) {
    needSupervisor(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.board(c))
  }

  @Roles('admin', 'staff')
  @Get('tasks/units')
  units(@Query('q') q: string | undefined, @CurrentUser() user: JwtPayload) {
    needSupervisor(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.searchUnits(c, q ?? ''))
  }

  @Roles('admin', 'staff')
  @Post('tasks')
  create(@Body() body: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    needSupervisor(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.create(c, user, body))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('tasks/:id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() body: AssignDto, @CurrentUser() user: JwtPayload) {
    needSupervisor(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.assign(c, user, id, body))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('tasks/:id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelTaskDto, @CurrentUser() user: JwtPayload) {
    needSupervisor(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.cancel(c, user, id, body.reason))
  }

  // ── نظافتچی
  @Roles('admin', 'staff')
  @Get('tasks/mine')
  mine(@CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.mine(c, user))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('tasks/:id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.start(c, user, id))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('tasks/:id/finish')
  finish(@Param('id', ParseUUIDPipe) id: string, @Body() body: TaskNoteDto, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.finish(c, user, id, body.note))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('tasks/:id/undo')
  undo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.undoStart(c, user, id))
  }

  @Roles('admin', 'staff')
  @Post('tasks/:id/manual')
  manual(@Param('id', ParseUUIDPipe) id: string, @Body() body: TaskManualDto, @CurrentUser() user: JwtPayload) {
    needCleaner(user)
    if (Number.isNaN(Date.parse(body.startedAt)) || Number.isNaN(Date.parse(body.endedAt))) throw new BadRequestException('ساعت نامعتبر است')
    return this.db.withTenant(user.tenant_id!, (c) => this.svc.manual(c, user, id, { startedAt: new Date(body.startedAt), endedAt: new Date(body.endedAt), note: body.note }))
  }
}
