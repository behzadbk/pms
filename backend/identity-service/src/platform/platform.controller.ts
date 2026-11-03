import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { PlatformInsightsService } from './platform-insights.service'
import { CreateInvoiceDto, GenerateInvoicesDto, InvoiceStatusDto } from './dto/invoice.dto'
import { CreateAdminDto, LifecycleDto, NoteDto, TotpCodeDto, TotpDisableDto, UpdateAdminDto, UpdateSettingsDto } from './dto/ops.dto'
import { PlatformService } from './platform.service'
import { CreateBuildingDto } from './dto/create-building.dto'
import { UpdateBuildingDto } from './dto/update-building.dto'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { AuthService } from '../auth/auth.service'
import { clientIp } from '../auth/client-ip'
import { PlatformRoles, PlatformRolesGuard } from './platform-roles.guard'
import { PlatformAuditService, actorOf } from './platform-audit.service'
import { PlatformSettingsService } from './platform-settings.service'
import { PlatformLifecycleService } from './platform-lifecycle.service'
import { PlatformHealthService } from './platform-health.service'
import { PlatformNotesService } from './platform-notes.service'
import { PlatformAdminsService } from './platform-admins.service'

/**
 * Endpointهای پنل سوپرادمین. همه پشت JwtAuthGuard (پیش‌فرض ماژول Auth) هستند و
 * علاوه بر آن RolesGuard فقط نقش super_admin را عبور می‌دهد — یعنی حتی یک
 * admin ساختمان با توکن معتبر هم به لیست کل مشتریان دسترسی ندارد.
 *
 * داخل تیم پلتفرم هم سه نقش داریم (PlatformRolesGuard):
 *   owner   — همه‌چیز (مالی، تنظیمات، اعضای تیم، خروجی داده، لغو ساختمان)
 *   support — خواندن همه، تعلیق/فعال‌سازی، ورود به‌جای مدیر، یادداشت
 *   sales   — خواندن، تعریف/ویرایش ساختمان (بدون فیلدهای مالی و وضعیت)، یادداشت
 * هر کار تغییردهنده در identity.platform_audit_log ثبت می‌شود.
 */
@Controller('platform')
@Roles('super_admin')
@UseGuards(PlatformRolesGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly insights: PlatformInsightsService,
    private readonly audit: PlatformAuditService,
    private readonly settings: PlatformSettingsService,
    private readonly lifecycle: PlatformLifecycleService,
    private readonly health: PlatformHealthService,
    private readonly notes: PlatformNotesService,
    private readonly admins: PlatformAdminsService,
    private readonly auth: AuthService,
  ) {}

  /* ───────────── ساختمان‌ها ───────────── */

  /** ماتریس سطوح (ساده/اقتصادی/حرفه‌ای) با قیمت مؤثر هر واحد (تنظیمات پلتفرم) */
  @Get('tiers')
  tiers() {
    return this.platform.listTiers()
  }

  /** لیست ساختمان‌ها/برج‌های تحت همکاری + خلاصه‌ی وضعیت مالی */
  @Get('buildings')
  list() {
    return this.platform.listBuildings()
  }

  @Get('buildings/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getBuilding(id)
  }

  /** تعریف برج یا ساختمان جدید با توجه به سطح آن */
  @Post('buildings')
  @PlatformRoles('owner', 'sales')
  async create(@Body() dto: CreateBuildingDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const b = await this.platform.createBuilding(dto)
    await this.audit.log(actorOf(user, clientIp(req)), 'building.create', { buildingId: b.id, target: b.name, detail: { tier: b.tier, units: b.unitCount, status: b.status } })
    return b
  }

  @Patch('buildings/:id')
  @PlatformRoles('owner', 'sales')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBuildingDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    // تعلیق/لغو/فعال‌سازی مجدد فقط از مسیر چرخه‌ی عمر (دلیل + ابطال نشست‌ها + لاگ)
    if (dto.status === 'suspended' || dto.status === 'cancelled') {
      throw new BadRequestException('برای تعلیق یا لغو از عملیات «تعلیق/لغو» استفاده کنید')
    }
    if (dto.status) {
      const cur = await this.platform.getBuilding(id)
      if (cur.status === 'suspended' || cur.status === 'cancelled') throw new BadRequestException('برای فعال‌سازی ساختمان تعلیق/لغوشده از «فعال‌سازی مجدد» استفاده کنید')
    }
    // فیلدهای مالی فقط owner
    if (user.prole !== 'owner' && (dto.monthlyFee !== undefined || dto.outstandingAmount !== undefined || dto.billingStatus !== undefined)) {
      throw new ForbiddenException('ویرایش فیلدهای مالی فقط برای مالک (owner) مجاز است')
    }
    const b = await this.platform.updateBuilding(id, dto)
    await this.audit.log(actorOf(user, clientIp(req)), 'building.update', { buildingId: id, target: b.name, detail: { fields: Object.keys(dto) } })
    return b
  }

  /** ثبت تسویه‌ی اشتراک */
  @Patch('buildings/:id/settle')
  @PlatformRoles('owner')
  async settle(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const b = await this.platform.settleBuilding(id)
    await this.audit.log(actorOf(user, clientIp(req)), 'billing.settle', { buildingId: id, target: b.name })
    return b
  }

  /** تعلیق: ورود و تمدید کاربران آن ساختمان رد می‌شود، داده‌ها دست‌نخورده می‌ماند */
  @Post('buildings/:id/suspend')
  @PlatformRoles('owner', 'support')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    return this.lifecycle.apply(id, 'suspend', dto.reason, actorOf(user, clientIp(req)))
  }

  @Post('buildings/:id/reactivate')
  @PlatformRoles('owner', 'support')
  reactivate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    return this.lifecycle.apply(id, 'reactivate', dto.reason, actorOf(user, clientIp(req)))
  }

  /** لغو قرارداد (قابل برگشت با «فعال‌سازی مجدد»؛ داده پاک نمی‌شود) */
  @Post('buildings/:id/cancel')
  @PlatformRoles('owner')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LifecycleDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    return this.lifecycle.apply(id, 'cancel', dto.reason, actorOf(user, clientIp(req)))
  }

  /**
   * «ورود به‌جای مدیر» برای پشتیبانی. توکن ۳۰ دقیقه‌ای بدون refresh؛ ثبت لاگ بعد از اعتبارسنجی و *قبل* از صدور
   * توکن (اگر لاگ نشد، توکنی صادر نمی‌شود).
   */
  @Post('buildings/:id/impersonate')
  @PlatformRoles('owner', 'support')
  async impersonate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    // لاگ فقط برای ورودی ثبت می‌شود که واقعاً توکن صادر می‌کند (ساختمان تعلیق/بدون مدیر → ۴۰۰ بدون لاگ)
    return this.auth.impersonateTenantAdmin(id, user.email, (name) =>
      this.audit.logStrict(actorOf(user, clientIp(req)), 'building.impersonate', { buildingId: id, target: name }),
    )
  }

  /** خروجی کامل داده‌ی یک ساختمان (JSON) برای پشتیبان‌گیری/انتقال */
  @Get('buildings/:id/export')
  @PlatformRoles('owner')
  async exportBuilding(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    // داده‌ی کامل مشتری است: اول لاگ، بعد خروجی
    await this.audit.logStrict(actorOf(user, clientIp(req)), 'building.export', { buildingId: id })
    return this.insights.exportTenant(id)
  }

  /* ───────────── یادداشت‌های ساختمان ───────────── */

  @Get('buildings/:id/notes')
  listNotes(@Param('id', ParseUUIDPipe) id: string) {
    return this.notes.list(id)
  }

  @Post('buildings/:id/notes')
  async addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto, @CurrentUser() user: JwtPayload) {
    return this.notes.create(id, user.email, dto.kind, dto.body)
  }

  @Delete('buildings/:id/notes/:noteId')
  @PlatformRoles('owner')
  async removeNote(@Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    if (!(await this.notes.remove(id, noteId))) throw new NotFoundException('یادداشت یافت نشد')
    await this.audit.log(actorOf(user, clientIp(req)), 'note.delete', { buildingId: id })
    return { ok: true }
  }

  /* ───────────── داشبورد، مجتمع‌ها، فاکتورها ───────────── */

  /** KPIهای داشبورد پلتفرم (همه از DB) */
  @Get('summary')
  summary() {
    return this.insights.summary()
  }

  /** مجتمع‌ها با شمارش واقعی واحد/ساکن و سقف قراردادی */
  @Get('tenants')
  tenants() {
    return this.insights.listTenants()
  }

  /** فاکتورهای اشتراک ماهانه */
  @Get('invoices')
  invoices(@Query('tenantId') tenantId?: string, @Query('status') status?: string, @Query('period') period?: string) {
    return this.insights.listInvoices({ tenantId, status, period })
  }

  @Post('invoices')
  @PlatformRoles('owner')
  async createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const inv = await this.insights.createInvoice(dto)
    await this.audit.log(actorOf(user, clientIp(req)), 'invoice.create', { buildingId: dto.tenantId, detail: { period: inv?.period, amount: inv?.amount } })
    return inv
  }

  /** صدور گروهی فاکتور دوره برای همه‌ی مجتمع‌های فعال */
  @Post('invoices/generate')
  @PlatformRoles('owner')
  async generateInvoices(@Body() dto: GenerateInvoicesDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.insights.generateInvoices(dto.period)
    await this.audit.log(actorOf(user, clientIp(req)), 'invoice.generate', { detail: { period: r.period, created: r.created } })
    return r
  }

  @Patch('invoices/:id/status')
  @PlatformRoles('owner')
  async invoiceStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoiceStatusDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.insights.setInvoiceStatus(id, dto.status)
    await this.audit.log(actorOf(user, clientIp(req)), 'invoice.status', { target: id, detail: { status: dto.status } })
    return r
  }

  /* ───────────── لاگ فعالیت، سلامت، تنظیمات ───────────── */

  @Get('audit')
  @PlatformRoles('owner', 'support')
  auditLog(@Query('buildingId') buildingId?: string, @Query('admin') admin?: string, @Query('action') action?: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.audit.list({ buildingId, admin, action, limit: limit ? Number(limit) : undefined, before: before ? Number(before) : undefined })
  }

  @Get('health')
  healthReport() {
    return this.health.report()
  }

  @Get('settings')
  getSettings() {
    return this.settings.get()
  }

  @Put('settings')
  @PlatformRoles('owner')
  async putSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const { settings, changes } = await this.settings.update(dto as never, user.email)
    if (Object.keys(changes).length) await this.audit.log(actorOf(user, clientIp(req)), 'settings.update', { detail: changes })
    return settings
  }

  /** اجرای دستی زمان‌بند ساعتی (معوقات/تعلیق خودکار) */
  @Post('scheduler/run')
  @PlatformRoles('owner')
  async runScheduler(@CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.lifecycle.tick()
    await this.audit.log(actorOf(user, clientIp(req)), 'scheduler.run', { detail: { ...r } })
    return r
  }

  /* ───────────── تیم پلتفرم و ۲FA ───────────── */

  @Get('admins')
  @PlatformRoles('owner')
  listAdmins() {
    return this.admins.list()
  }

  @Post('admins')
  @PlatformRoles('owner')
  async createAdmin(@Body() dto: CreateAdminDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const a = await this.admins.create(dto)
    await this.audit.log(actorOf(user, clientIp(req)), 'admin.create', { target: a.username, detail: { role: a.role } })
    return a
  }

  @Patch('admins/:id')
  @PlatformRoles('owner')
  async updateAdmin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const a = await this.admins.update(id, user.sub, dto)
    await this.audit.log(actorOf(user, clientIp(req)), 'admin.update', { target: a.username, detail: { ...dto } })
    return a
  }

  @Post('admins/:id/reset-password')
  @PlatformRoles('owner')
  async resetAdminPassword(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.admins.resetPassword(id)
    await this.audit.log(actorOf(user, clientIp(req)), 'admin.reset_password', { target: r.username })
    return r
  }

  @Post('admins/:id/reset-2fa')
  @PlatformRoles('owner')
  async resetAdmin2fa(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.admins.resetTotp(id)
    await this.audit.log(actorOf(user, clientIp(req)), 'admin.reset_2fa', { target: id })
    return r
  }

  @Post('me/2fa/setup')
  setup2fa(@CurrentUser() user: JwtPayload) {
    return this.admins.setupTotp(user.sub)
  }

  @Post('me/2fa/enable')
  async enable2fa(@Body() dto: TotpCodeDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.admins.enableTotp(user.sub, dto.code)
    await this.audit.log(actorOf(user, clientIp(req)), 'admin.2fa_enable')
    return r
  }

  @Post('me/2fa/disable')
  async disable2fa(@Body() dto: TotpDisableDto, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const r = await this.admins.disableTotp(user.sub, dto.password, dto.code, clientIp(req))
    await this.audit.log(actorOf(user, clientIp(req)), 'admin.2fa_disable')
    return r
  }
}
