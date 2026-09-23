import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { BuildingTier, TIER_IDS } from '../tiers'

/** تعریف ساختمان/برج جدید از پنل سوپرادمین */
export class CreateBuildingDto {
  /** نام پروژه — همان چیزی که در لیست ساختمان‌ها دیده می‌شود */
  @IsString()
  @MaxLength(120)
  name: string

  /** subdomain اختصاصی مجتمع (فقط حروف کوچک انگلیسی، عدد و خط تیره) */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, {
    message: 'subdomain باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد',
  })
  subdomain: string

  @IsIn(TIER_IDS, { message: 'سطح سرویس باید یکی از ساده/اقتصادی/حرفه‌ای باشد' })
  tier: BuildingTier

  @IsInt()
  @Min(1)
  @Max(5000)
  unitCount: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  floorCount?: number

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  managerName?: string

  @IsOptional()
  @IsString()
  @Matches(/^0\d{10}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰ شروع شود' })
  managerPhone?: string

  /** مبلغ اشتراک ماهانه (تومان) — اگر خالی بماند از روی سطح و تعداد واحد محاسبه می‌شود */
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyFee?: number

  /**
   * حساب مدیر اولیه‌ی مجتمع. بدون این، ساختمان تازه تعریف‌شده هیچ کاربری نداشت و
   * مشتری عملاً راهی برای ورود به پنل خودش نداشت. اگر adminEmail ارسال شود، رمز هم الزامی است.
   */
  @IsOptional()
  @IsEmail({}, { message: 'ایمیل مدیر مجتمع نامعتبر است' })
  adminEmail?: string

  @ValidateIf((o: CreateBuildingDto) => !!o.adminEmail)
  @IsString()
  @MinLength(8, { message: 'رمز مدیر مجتمع باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(72)
  adminPassword?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  adminFullName?: string

  /** وضعیت اولیه — پیش‌فرض دوره‌ی آزمایشی */
  @IsOptional()
  @IsIn(['active', 'trial'])
  status?: 'active' | 'trial'
}
