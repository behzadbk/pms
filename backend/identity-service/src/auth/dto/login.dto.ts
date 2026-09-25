import { IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  /**
   * ایمیل یا نام کاربری. نام فیلد برای سازگاری با کلاینت‌های قبلی «email» مانده است؛
   * کارکنانی که مدیر برایشان حساب ساخته فقط نام کاربری دارند.
   */
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  email: string

  @IsString()
  @MinLength(6)
  password: string

  // subdomain مجتمع — برای تعیین اینکه کاربر متعلق به کدام tenant است
  // (چند مجتمع می‌توانند کاربری با ایمیل مشابه اما در tenant متفاوت داشته باشند)
  @IsString()
  tenantSubdomain: string
}
