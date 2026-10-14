import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

/** UUID‌شکل (داده‌ی نمونه UUID غیر-v4 دارد؛ اعتبارسنج نسخه را هم چک می‌کند) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2, { message: 'نام دپارتمان را بنویسید' })
  @MaxLength(60)
  name: string

  @IsOptional() @IsString() @MaxLength(40) icon?: string
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @MinLength(2, { message: 'نام دپارتمان را بنویسید' }) @MaxLength(60) name?: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string
  @IsOptional() @IsBoolean() isActive?: boolean

  /** شناسه‌ی کارمند (همان دپارتمان) یا null برای برداشتن مدیر — IsOptional مقدار null را هم می‌پذیرد */
  @IsOptional() @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) managerUserId?: string | null
}
