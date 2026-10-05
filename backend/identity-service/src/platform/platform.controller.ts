import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { PlatformInsightsService } from './platform-insights.service'
import { CreateInvoiceDto, GenerateInvoicesDto, InvoiceStatusDto } from './dto/invoice.dto'
import { PlatformService } from './platform.service'
import { CreateBuildingDto } from './dto/create-building.dto'
import { UpdateBuildingDto } from './dto/update-building.dto'
import { Roles } from '../auth/decorators/roles.decorator'

/**
 * Endpointهای پنل سوپرادمین. همه پشت JwtAuthGuard (پیش‌فرض ماژول Auth) هستند و
 * علاوه بر آن RolesGuard فقط نقش super_admin را عبور می‌دهد — یعنی حتی یک
 * admin ساختمان با توکن معتبر هم به لیست کل مشتریان دسترسی ندارد.
 */
@Controller('platform')
@Roles('super_admin')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly insights: PlatformInsightsService,
  ) {}

  /** ماتریس سطوح (ساده/اقتصادی/حرفه‌ای) به‌همراه قابلیت‌های هر سطح */
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
  create(@Body() dto: CreateBuildingDto) {
    return this.platform.createBuilding(dto)
  }

  @Patch('buildings/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBuildingDto) {
    return this.platform.updateBuilding(id, dto)
  }

  /** ثبت تسویه‌ی اشتراک */
  @Patch('buildings/:id/settle')
  settle(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.settleBuilding(id)
  }

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
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.insights.createInvoice(dto)
  }

  /** صدور گروهی فاکتور دوره برای همه‌ی مجتمع‌های فعال */
  @Post('invoices/generate')
  generateInvoices(@Body() dto: GenerateInvoicesDto) {
    return this.insights.generateInvoices(dto.period)
  }

  @Patch('invoices/:id/status')
  invoiceStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoiceStatusDto) {
    return this.insights.setInvoiceStatus(id, dto.status)
  }

  /** خروجی کامل داده‌ی یک ساختمان (JSON) برای پشتیبان‌گیری/انتقال */
  @Get('buildings/:id/export')
  exportBuilding(@Param('id', ParseUUIDPipe) id: string) {
    return this.insights.exportTenant(id)
  }
}
