import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
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
  constructor(private readonly platform: PlatformService) {}

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
}
