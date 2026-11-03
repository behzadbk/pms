import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

/**
 * ورود سوپرادمین (سطح پلتفرم) — برخلاف LoginDto نه ایمیل دارد و نه tenantSubdomain،
 * چون این کاربر به هیچ مجتمعی تعلق ندارد و کل پلتفرم را مدیریت می‌کند.
 */
export class PlatformLoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username: string

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password: string

  /** کد ۶ رقمی برنامه‌ی احراز هویت — فقط وقتی ۲FA برای این حساب روشن است */
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'کد دومرحله‌ای باید ۶ رقم باشد' })
  otp?: string
}
