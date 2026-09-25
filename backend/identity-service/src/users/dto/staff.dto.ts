import { Type } from 'class-transformer'
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { STAFF_DEPARTMENTS, STAFF_PERMISSIONS } from '../staff.constants'

/** اطلاعات شخصی تکمیلی — در ستون jsonb ذخیره می‌شود */
export class StaffProfileDto {
  @IsOptional() @IsString() @MaxLength(20) birthDate?: string
  @IsOptional() @IsString() @MaxLength(300) address?: string
  @IsOptional() @IsString() @MaxLength(120) emergencyName?: string
  @IsOptional() @IsString() @MaxLength(20) emergencyPhone?: string
  @IsOptional() @IsString() @MaxLength(20) hireDate?: string
  @IsOptional() @IsIn(['morning', 'evening', 'night', 'rotating']) shift?: string
  @IsOptional() @IsString() @MaxLength(500) notes?: string
}

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{2,31}$/, {
    message: 'نام کاربری باید ۳ تا ۳۲ حرف کوچک انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد',
  })
  username: string

  @IsString()
  @MinLength(6, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  @MaxLength(128)
  password: string

  @IsIn(STAFF_DEPARTMENTS as unknown as string[], { message: 'بخش نامعتبر است' })
  department: string

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_PERMISSIONS as unknown as string[], { each: true, message: 'دسترسی نامعتبر است' })
  permissions?: string[]

  @IsOptional()
  @Matches(/^0\d{10}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰ شروع شود' })
  phone?: string

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalId?: string

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل نامعتبر است' })
  email?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => StaffProfileDto)
  profile?: StaffProfileDto

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

/** ویرایش — همه‌ی فیلدها اختیاری؛ رمز فقط اگر بخواهند عوض شود */
export class UpdateStaffDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{2,31}$/, {
    message: 'نام کاربری باید ۳ تا ۳۲ حرف کوچک انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد',
  })
  username?: string

  @IsOptional() @IsString() @MinLength(6, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }) @MaxLength(128) password?: string

  @IsOptional() @IsIn(STAFF_DEPARTMENTS as unknown as string[], { message: 'بخش نامعتبر است' }) department?: string

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_PERMISSIONS as unknown as string[], { each: true, message: 'دسترسی نامعتبر است' })
  permissions?: string[]

  @IsOptional() @Matches(/^0\d{10}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰ شروع شود' }) phone?: string | null
  @IsOptional() @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' }) nationalId?: string | null
  @IsOptional() @IsEmail({}, { message: 'ایمیل نامعتبر است' }) email?: string | null

  @IsOptional() @ValidateNested() @Type(() => StaffProfileDto) profile?: StaffProfileDto

  @IsOptional() @IsBoolean() isActive?: boolean
}
