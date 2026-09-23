import { IsString, MaxLength, MinLength } from 'class-validator'

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
}
