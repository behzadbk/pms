import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { PLATFORM_ROLES, PlatformAdminRole } from '../../auth/platform-roles'

export class LifecycleDto {
  /** برای تعلیق/لغو الزامی است؛ برای فعال‌سازی مجدد اختیاری */
  @IsOptional() @IsString() @MaxLength(300) reason?: string
}

export class NoteDto {
  @IsIn(['note', 'call', 'visit', 'sales']) kind: 'note' | 'call' | 'visit' | 'sales'
  @IsString() @MinLength(1) @MaxLength(2000) body: string
}

export class CreateAdminDto {
  @IsString() @Matches(/^[a-z0-9._-]{3,32}$/i, { message: 'نام کاربری ۳ تا ۳۲ نویسه (حروف انگلیسی، عدد، نقطه، خط تیره) باشد' }) username: string
  @IsString() @MinLength(2) @MaxLength(120) fullName: string
  @IsIn(PLATFORM_ROLES) role: PlatformAdminRole
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) password?: string
}

export class UpdateAdminDto {
  @IsOptional() @IsIn(PLATFORM_ROLES) role?: PlatformAdminRole
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string
}

export class TotpCodeDto {
  @IsString() @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'کد باید ۶ رقم باشد' }) code: string
}

export class TotpDisableDto extends TotpCodeDto {
  @IsString() @MinLength(1) @MaxLength(128) password: string
}

export class PricePerUnitDto {
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) simple?: number
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) economic?: number
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) professional?: number
}

export class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(365) graceDays?: number
  @IsOptional() @IsBoolean() autoSuspend?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number
  @IsOptional() @IsBoolean() autoSuspendTrial?: boolean
  @IsOptional() @IsObject() @ValidateNested() @Type(() => PricePerUnitDto) pricePerUnit?: PricePerUnitDto
}
