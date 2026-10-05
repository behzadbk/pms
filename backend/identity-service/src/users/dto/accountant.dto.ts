import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const USERNAME_MSG = 'نام کاربری باید ۳ تا ۳۲ حرف کوچک انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد'

/** حساب «حسابدار» ساختمان — توسط مدیر ساختمان ساخته می‌شود (شارژ و فاکتور از پنل حسابدار انجام می‌شود) */
export class CreateAccountantDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName: string
  @IsString() @Matches(USERNAME_RE, { message: USERNAME_MSG }) username: string
  @IsString() @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' }) @MaxLength(128) password: string
  @IsOptional() @Matches(/^0\d{10}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰ شروع شود' }) phone?: string
  @IsOptional() @IsEmail({}, { message: 'ایمیل نامعتبر است' }) email?: string
  @IsOptional() @IsBoolean() isActive?: boolean
}

export class UpdateAccountantDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string
  @IsOptional() @IsString() @Matches(USERNAME_RE, { message: USERNAME_MSG }) username?: string
  @IsOptional() @IsString() @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' }) @MaxLength(128) password?: string
  @IsOptional() @Matches(/^0\d{10}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰ شروع شود' }) phone?: string | null
  @IsOptional() @IsEmail({}, { message: 'ایمیل نامعتبر است' }) email?: string | null
  @IsOptional() @IsBoolean() isActive?: boolean
}
