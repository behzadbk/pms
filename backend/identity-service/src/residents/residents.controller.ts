import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UnauthorizedException, UploadedFile, UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { Roles } from '../auth/decorators/roles.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { clientIp } from '../auth/client-ip'
import { LoginThrottleService } from '../auth/login-throttle.service'
import { ReqCtx, RequestCtx, scopeTenant } from './context'
import { ManagerService, UnitFilter } from './manager.service'
import { JoinService } from './join.service'
import { HouseholdService } from './household.service'
import { ChildService } from './child.service'
import { AdminResidentsService } from './admin-residents.service'
import { TowerService } from './tower.service'
import { HousekeepingService } from './housekeeping.service'
import {
  AcceptInviteDto, AddMemberDto, AddResidentDto, BuildingRulesDto, BulkUnitsDto, ChildRequestDto, CreateUnitDto, CreateUnitsDto, UpdateUnitDto, DecideChildRequestDto, ExitUnlockDto, FamilyCodeLoginDto,
  InviteDto, LobbyJoinDto, MergeDto, MoveOutDto, ParentControlDto, RejectDto, TransferDto, TransferHeadDto, UpdateMembershipDto,
} from './dto/residents.dto'

const FILTERS: UnitFilter[] = ['all', 'owner', 'tenant', 'pending', 'vacant']

/* ════════════════ مدیر ساختمان (فقط ساختمان خودش) · سوپرادمین با building_id ════════════════ */

@Controller()
@Roles('admin', 'super_admin')
export class ManagerResidentsController {
  constructor(
    private readonly manager: ManagerService,
    private readonly join: JoinService,
    private readonly hk: HousekeepingService,
    private readonly tower: TowerService,
  ) {}

  @Get('buildings/:id/units')
  async units(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query('filter') filter?: string, @Query('q') q?: string) {
    const tenant = scopeTenant(u, id)
    await this.hk.touch(tenant)
    return this.manager.listUnits(tenant, FILTERS.includes(filter as UnitFilter) ? (filter as UnitFilter) : 'all', q ?? '')
  }

  @Get('units/:id')
  async unit(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    const tenant = scopeTenant(u, b)
    await this.hk.touch(tenant)
    return this.manager.getUnit(tenant, id)
  }

  /* ── ساخت و ویرایش واحدها (ساختمان تازه هیچ واحدی ندارد) ── */

  @Post('buildings/:id/units')
  createUnit(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateUnitDto) {
    return this.tower.createUnit(scopeTenant(ctx.user, id), dto, ctx)
  }

  /** چند شماره‌ی واحد در یک درخواست («101, 102, 103») — از انتخاب‌گر واحد در فرم ساکنین */
  @Post('buildings/:id/units/multi')
  createUnits(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateUnitsDto) {
    return this.manager.createUnits(scopeTenant(ctx.user, id), dto, ctx)
  }

  @Post('buildings/:id/units/bulk')
  @HttpCode(200)
  bulkUnits(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BulkUnitsDto) {
    return this.tower.bulkCreate(scopeTenant(ctx.user, id), dto, ctx)
  }

  @Patch('units/:id')
  updateUnit(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto, @Query('building_id') b?: string) {
    return this.tower.updateUnit(scopeTenant(ctx.user, b), id, dto, ctx)
  }

  @Delete('units/:id')
  deleteUnit(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    return this.tower.deleteUnit(scopeTenant(ctx.user, b), id, ctx)
  }

  /** حذف ساکن = پایان عضویت با ردپا؛ پاسخ پرونده‌ی تازه‌ی واحد است */
  @Delete('memberships/:id')
  async removeMember(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    const tenant = scopeTenant(ctx.user, b)
    const r = await this.tower.removeMember(tenant, id, ctx)
    return this.manager.getUnit(tenant, r.unit_id)
  }

  /* ── قوانین برج: مهلت بدهکاری و محدودیت‌ها ── */

  @Get('buildings/:id/rules')
  rules(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.tower.getRules(scopeTenant(u, id))
  }

  @Put('buildings/:id/rules')
  putRules(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BuildingRulesDto) {
    return this.tower.putRules(scopeTenant(ctx.user, id), dto, ctx)
  }

  @Post('units/:id/residents')
  addResident(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddResidentDto, @Query('building_id') b?: string) {
    return this.manager.addResident(scopeTenant(ctx.user, b), id, dto, ctx)
  }

  @Patch('memberships/:id')
  updateMembership(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMembershipDto, @Query('building_id') b?: string) {
    return this.manager.updateMembership(scopeTenant(ctx.user, b), id, dto, ctx)
  }

  /** رمز ساکن را به شماره‌ی واحد برمی‌گرداند و نام‌کاربری/رمز را به مدیر نشان می‌دهد */
  @Post('memberships/:id/reset-password')
  @HttpCode(200)
  resetPassword(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    return this.manager.resetPassword(scopeTenant(ctx.user, b), id, ctx)
  }

  @Post('units/:id/invite')
  invite(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteDto, @Query('building_id') b?: string) {
    return this.manager.invite(scopeTenant(ctx.user, b), id, dto, ctx)
  }

  @Post('invites/:id/cancel')
  @HttpCode(200)
  cancelInvite(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    return this.manager.cancelInvite(scopeTenant(ctx.user, b), id, ctx)
  }

  @Get('units/:id/move-out')
  moveOutPreview(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query('date') date?: string, @Query('building_id') b?: string) {
    return this.manager.moveOutPreview(scopeTenant(u, b), id, date ?? new Date().toISOString().slice(0, 10))
  }

  @Post('units/:id/move-out')
  @HttpCode(200)
  moveOut(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveOutDto, @Query('building_id') b?: string) {
    return this.manager.moveOut(scopeTenant(ctx.user, b), id, dto.date, dto.confirm !== false, ctx)
  }

  @Get('buildings/:id/join-requests')
  async joinRequests(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const tenant = scopeTenant(u, id)
    await this.hk.touch(tenant)
    return this.join.list(tenant)
  }

  @Post('join-requests/:id/approve')
  @HttpCode(200)
  approve(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    return this.join.approve(scopeTenant(ctx.user, b), id, ctx)
  }

  @Post('join-requests/:id/reject')
  @HttpCode(200)
  reject(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @Query('building_id') b?: string) {
    return this.join.reject(scopeTenant(ctx.user, b), id, dto.reason, ctx)
  }

  @Post('join-requests/:id/transfer')
  @HttpCode(200)
  transfer(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto, @Query('building_id') b?: string) {
    return this.join.transfer(scopeTenant(ctx.user, b), id, dto.to_unit_id, ctx)
  }

  @Post('join-requests/:id/remind-head')
  @HttpCode(200)
  remindHead(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Query('building_id') b?: string) {
    return this.join.remindHead(scopeTenant(ctx.user, b), id, ctx)
  }

  @Post('buildings/:id/residents/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }) {
    return this.join.import(scopeTenant(ctx.user, id), file, ctx)
  }

  @Get('buildings/:id/residents/import/template')
  async template(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    scopeTenant(u, id)
    const buf = await this.join.template()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="residents-template.xlsx"')
    res.send(buf)
  }

  @Get('buildings/:id/lobby-qr')
  lobbyQr(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.join.lobbyQr(scopeTenant(u, id))
  }
}

/* ════════════════ سوپرادمین ════════════════ */

@Controller('admin')
@Roles('super_admin')
export class AdminResidentsController {
  constructor(private readonly admin: AdminResidentsService) {}

  @Get('residents')
  residents(@Query('building_id') b?: string, @Query('q') q?: string) {
    return this.admin.residents(b || undefined, q)
  }

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.user(id)
  }

  @Post('users/:id/logout-all')
  @HttpCode(200)
  logoutAll(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.logoutAll(id, ctx)
  }

  @Post('users/:id/block')
  @HttpCode(200)
  block(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.block(id, true, ctx)
  }

  @Post('users/:id/unblock')
  @HttpCode(200)
  unblock(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.block(id, false, ctx)
  }

  @Post('users/:id/merge')
  @HttpCode(200)
  merge(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.admin.merge(id, dto.other_user_id, ctx)
  }
}

/* ════════════════ سرپرست خانوار و والدین ════════════════ */

@Controller()
@Roles('resident')
export class HouseholdController {
  constructor(
    private readonly household: HouseholdService,
    private readonly hk: HousekeepingService,
  ) {}

  @Get('me/household')
  async get(@CurrentUser() u: JwtPayload, @Query('unit_id') unitId?: string) {
    await this.hk.touch(u.tenant_id)
    return this.household.household(u, unitId)
  }

  @Post('me/household/members')
  add(@ReqCtx() ctx: RequestCtx, @Body() dto: AddMemberDto) {
    return this.household.addMember(ctx.user, dto, ctx)
  }

  @Post('me/household/members/:id/resend-invite')
  @HttpCode(200)
  resend(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.household.resendInvite(ctx.user, id, ctx)
  }

  @Delete('me/household/members/:id')
  remove(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.household.removeMember(ctx.user, id, ctx)
  }

  @Post('me/household/transfer-head')
  @HttpCode(200)
  transferHead(@ReqCtx() ctx: RequestCtx, @Body() dto: TransferHeadDto) {
    return this.household.transferHead(ctx.user, dto.membership_id, ctx)
  }

  @Get('me/household/members/:id/parent-control')
  getControl(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.household.getParentControl(u, id)
  }

  @Put('me/household/members/:id/parent-control')
  putControl(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ParentControlDto) {
    return this.household.putParentControl(ctx.user, id, dto, ctx)
  }

  @Post('me/household/members/:id/login-code')
  loginCode(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.household.loginCode(ctx.user, id, ctx)
  }

  @Post('me/household/join-requests/:id/approve')
  @HttpCode(200)
  approveJoin(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.household.decideJoin(ctx.user, id, true, undefined, ctx)
  }

  @Post('me/household/join-requests/:id/reject')
  @HttpCode(200)
  rejectJoin(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) {
    return this.household.decideJoin(ctx.user, id, false, dto.reason, ctx)
  }

  @Get('me/child-requests')
  async childRequests(@CurrentUser() u: JwtPayload, @Query('status') status?: string) {
    await this.hk.touch(u.tenant_id)
    return this.household.childRequests(u, ['pending', 'approved', 'rejected', 'expired', 'all'].includes(status ?? '') ? status : 'pending')
  }

  @Post('child-requests/:id/approve')
  @HttpCode(200)
  approveChild(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideChildRequestDto) {
    return this.household.decideChildRequest(ctx.user, id, true, dto, ctx)
  }

  @Post('child-requests/:id/reject')
  @HttpCode(200)
  rejectChild(@ReqCtx() ctx: RequestCtx, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideChildRequestDto) {
    return this.household.decideChildRequest(ctx.user, id, false, dto, ctx)
  }
}

/* ════════════════ کودک، دسترسی‌ها، اعلان‌ها، تماس اضطراری ════════════════ */

@Controller()
export class MeController {
  constructor(
    private readonly child: ChildService,
    private readonly hk: HousekeepingService,
    private readonly throttle: LoginThrottleService,
  ) {}

  /**
   * ورود کودک با کد ۶ رقمی (فقط ۱٬۰۰۰٬۰۰۰ حالت) — بدون محدودیت، حدس‌زدن کد زنده‌ی یک خانواده ممکن بود. شمارنده‌ی خطا
   * بر اساس IP کلاینت است (نه ساختمان/کد)، تا مهاجم نتواند ورود عادی بقیه‌ی خانواده‌ها را قفل کند؛ ۵ خطا آزاد و بعد
   * قفل نمایی تا ۱۵ دقیقه (همان سازوکار ورود).
   */
  @Public()
  @Post('auth/family-code')
  @HttpCode(200)
  async familyCode(@Body() dto: FamilyCodeLoginDto, @Req() req: any) {
    const ip = clientIp(req) || 'unknown'
    await this.throttle.assertAllowed('family-code', ip, ip)
    try {
      // موفقیت شمارنده را صفر نمی‌کند: وگرنه کسی که کد معتبر خودش را دارد می‌توانست بین حدس‌ها وارد شود و قفل را بشکند
      return await this.child.familyCodeLogin(dto)
    } catch (e) {
      if (e instanceof UnauthorizedException) await this.throttle.recordFailure('family-code', ip, ip)
      throw e
    }
  }

  /** نقشه‌ی دسترسی ماژول‌ها برای شِل اپ (تب‌ها، کاشی‌ها و لینک‌های پنهان حذف می‌شوند) */
  @Get('me/permissions')
  async permissions(@CurrentUser() u: JwtPayload, @Query('unit_id') unitId?: string) {
    await this.hk.touch(u.tenant_id)
    return this.child.permissions(u, unitId)
  }

  @Roles('child', 'resident')
  @Post('me/child/requests')
  childRequest(@ReqCtx() ctx: RequestCtx, @Body() dto: ChildRequestDto) {
    return this.child.createRequest(ctx.user, dto, ctx)
  }

  @Roles('child', 'resident')
  @Get('me/child/requests')
  myRequests(@CurrentUser() u: JwtPayload) {
    return this.child.myRequests(u)
  }

  @Roles('child', 'resident')
  @Post('me/exit-unlock')
  @HttpCode(200)
  exitUnlock(@CurrentUser() u: JwtPayload, @Body() dto: ExitUnlockDto) {
    return this.child.exitUnlock(u, dto.pin)
  }

  /** قاعده ۱۱: هیچ نقش، ساعت سکوت یا تنظیمی جلوی تماس اضطراری را نمی‌گیرد */
  @Post('me/emergency')
  @HttpCode(200)
  emergency(@ReqCtx() ctx: RequestCtx) {
    return this.child.emergency(ctx.user, ctx)
  }

  @Get('me/notifications')
  notifications(@CurrentUser() u: JwtPayload) {
    return this.child.notifications(u)
  }

  @Post('me/notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentUser() u: JwtPayload) {
    return this.child.markRead(u, 'all')
  }

  @Post('me/notifications/:id/read')
  @HttpCode(200)
  read(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.child.markRead(u, id)
  }
}

/* ════════════════ عمومی: QR لابی و لینک دعوت ════════════════ */

@Controller()
export class PublicResidentsController {
  constructor(private readonly join: JoinService) {}

  @Public()
  @Get('join/:token')
  lobbyInfo(@Param('token') token: string) {
    return this.join.lobbyInfo(token)
  }

  @Public()
  @Post('join/:token')
  lobbyJoin(@Param('token') token: string, @Body() dto: LobbyJoinDto) {
    return this.join.lobbyJoin(token, dto)
  }

  @Public()
  @Get('invites/:token')
  inviteInfo(@Param('token') token: string) {
    return this.join.inviteInfo(token)
  }

  @Public()
  @Post('invites/:token/accept')
  @HttpCode(200)
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.join.acceptInvite(token, dto.password, dto.name)
  }
}
