import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { OrdersService, PlaceOrderDto } from './orders.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { OrderStatus } from './order-status'

@Controller('fnb')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders')
  place(@CurrentUser() user: JwtPayload, @Body() dto: PlaceOrderDto) {
    // نکته Production: هدر Idempotency-Key باید اینجا بررسی شود تا دابل‌تپ موبایل
    // دو سفارش نسازد (همان الگوی استفاده‌شده در finance-svc برای پرداخت).
    return this.orders.place(user.tenant_id!, user.sub, dto)
  }

  @Get('orders/:id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.orders.findOne(user.tenant_id!, id)
  }

  @Get('units/:unitId/orders')
  listByUnit(@CurrentUser() user: JwtPayload, @Param('unitId') unitId: string) {
    return this.orders.listByUnit(user.tenant_id!, unitId)
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.orders.changeStatus(user.tenant_id!, id, 'cancelled', user.sub, body?.reason, !['admin', 'staff'].includes(user.role))
  }

  @Roles('admin', 'staff')
  @Patch('orders/:id/status')
  changeStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: OrderStatus; reason?: string },
  ) {
    return this.orders.changeStatus(user.tenant_id!, id, body.status, user.sub, body.reason)
  }

  @Roles('admin', 'staff')
  @Get('kitchen/queue')
  kitchenQueue(@CurrentUser() user: JwtPayload) {
    return this.orders.kitchenQueue(user.tenant_id!)
  }
}
