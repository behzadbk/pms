import { IsEmail, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(6)
  password: string

  // subdomain مجتمع — برای تعیین اینکه کاربر متعلق به کدام tenant است
  // (چند مجتمع می‌توانند کاربری با ایمیل مشابه اما در tenant متفاوت داشته باشند)
  @IsString()
  tenantSubdomain: string
}
