import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { OrdersService, PlaceOrderDto } from './orders.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { OrderStatus } from './order-status'

const STATUSES = ['accepted', 'rejected', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled']

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles('resident', 'child')
  @Post('orders')
  place(@CurrentUser() user: JwtPayload, @Body() dto: PlaceOrderDto) {
    return this.orders.place(user, dto)
  }

  /** سفارش‌های واحد من */
  @Roles('resident', 'child')
  @Get('me/orders')
  mine(@CurrentUser() user: JwtPayload) {
    return this.orders.listMine(user)
  }

  @Get('orders/:id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(user, id)
  }

  @Roles('resident', 'child')
  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() body: { reason?: string }) {
    return this.orders.changeStatus(user, id, 'cancelled', body?.reason, true)
  }

  @Roles('admin', 'staff')
  @Patch('orders/:id/status')
  changeStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: OrderStatus; reason?: string },
  ) {
    if (!STATUSES.includes(body?.status)) throw new BadRequestException('وضعیت نامعتبر است')
    return this.orders.changeStatus(user, id, body.status, body.reason)
  }

  /** صف زنده آشپزخانه (?kind=restaurant|cafe &venue_id=) */
  @Roles('admin', 'staff')
  @Get('kitchen/queue')
  kitchenQueue(@CurrentUser() user: JwtPayload, @Query('kind') kind?: string, @Query('venue_id') venueId?: string) {
    return this.orders.kitchenQueue(user, kind, venueId)
  }
}
