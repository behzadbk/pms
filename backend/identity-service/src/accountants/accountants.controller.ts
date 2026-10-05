import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { AccountantsService } from './accountants.service'

class CreateAccountantDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName: string
  @IsEmail({}, { message: 'ایمیل نامعتبر است' }) email: string
  @IsOptional() @IsString() @MaxLength(11) phone?: string
  @IsOptional() @IsString() @MaxLength(72) password?: string
}

class UpdateAccountantDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string
  @IsOptional() @IsString() @MaxLength(11) phone?: string
  @IsOptional() @IsBoolean() isActive?: boolean
}

/** مدیریت حساب حسابدار توسط مدیر ساختمان: GET/POST /accountants، PATCH /accountants/:id (غیرفعال‌سازی با isActive=false) */
@Controller('accountants')
@Roles('admin')
export class AccountantsController {
  constructor(private readonly svc: AccountantsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.svc.list(user.tenant_id!)
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAccountantDto) {
    return this.svc.create(user.tenant_id!, user.sub, dto)
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountantDto) {
    return this.svc.update(user.tenant_id!, id, user.sub, dto)
  }
}
