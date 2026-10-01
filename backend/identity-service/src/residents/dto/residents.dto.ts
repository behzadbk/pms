import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

/** شناسه‌ی UUID‌شکل (داده‌ی نمونه UUIDهای غیر-v4 دارد؛ IsUUID نسخه را هم چک می‌کند) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** تاریخ‌ها در API به قالب ISO میلادی (YYYY-MM-DD) رد و بدل می‌شوند؛ فرانت شمسی نمایش می‌دهد */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATE_MSG = { message: 'تاریخ باید به قالب YYYY-MM-DD باشد' }

/* ───────────── مدیر ساختمان ───────────── */

export class AddResidentDto {
  @IsString() @MinLength(2, { message: 'نام و شماره موبایل را وارد کنید' }) @MaxLength(120) name: string
  @IsString() @MinLength(8, { message: 'نام و شماره موبایل را وارد کنید' }) @MaxLength(24) phone: string
  @IsOptional() @IsString() @MaxLength(16) national_id?: string
  @IsIn(['owner', 'tenant', 'owner_absent'], { message: 'نوع سکونت نامعتبر است' }) residency: 'owner' | 'tenant' | 'owner_absent'
  @IsOptional() @Matches(ISO_DATE, ISO_DATE_MSG) start_date?: string
  @IsOptional() @Matches(ISO_DATE, ISO_DATE_MSG) end_date?: string
  @IsOptional() @IsBoolean() pays_charge?: boolean
  @IsOptional() @IsBoolean() send_sms?: boolean
  /** با توجه به RESIDENTS.md مدیر می‌تواند نقش را هم مشخص کند؛ پیش‌فرض: اولین نفر سرپرست، بقیه بزرگسال */
  @IsOptional() @IsIn(['head', 'adult', 'senior']) role?: 'head' | 'adult' | 'senior'
}

export class UpdateMembershipDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string
  @IsOptional() @IsString() @MaxLength(24) phone?: string
  @IsOptional() @IsString() @MaxLength(16) national_id?: string
  @IsOptional() @IsIn(['head', 'adult', 'child', 'caregiver', 'senior', 'owner_absent']) role?: string
  @IsOptional() @IsIn(['owner', 'tenant', 'owner_absent']) residency?: string
  @IsOptional() @IsBoolean() pays_charge?: boolean
  @IsOptional() @Matches(ISO_DATE, ISO_DATE_MSG) start_date?: string
  /** null = حذف تاریخ پایان */
  @IsOptional() @Matches(ISO_DATE, ISO_DATE_MSG) end_date?: string | null
  @IsOptional() @IsIn(['active', 'ended']) status?: 'active' | 'ended'
  @IsOptional() @IsString() @MaxLength(40) title?: string
  @IsOptional() @IsObject() settings?: Record<string, unknown>
}

export class InviteDto {
  @IsString() @MinLength(8) @MaxLength(24) phone: string
  @IsOptional() @IsIn(['owner', 'tenant']) residency?: 'owner' | 'tenant'
}

export class MoveOutDto {
  @Matches(ISO_DATE, ISO_DATE_MSG) date: string
  /** false = فقط پیش‌نمایش موارد مانع؛ پیش‌فرض true (ثبت تخلیه) */
  @IsOptional() @IsBoolean() confirm?: boolean
}

export class TransferDto {
  @IsOptional() @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) to_unit_id?: string
}

export class RejectDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string
}

/* ───────────── عمومی: QR لابی و پذیرش دعوت ───────────── */

export class LobbyJoinDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string
  @IsString() @MinLength(8) @MaxLength(24) phone: string
  @IsString() @MinLength(1) @MaxLength(12) unit_no: string
  @IsIn(['owner', 'tenant']) residency: 'owner' | 'tenant'
}

export class AcceptInviteDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string
  @IsString() @MinLength(6, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }) @MaxLength(128) password: string
}

/* ───────────── سوپرادمین ───────────── */

export class MergeDto {
  @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) other_user_id: string
}

/* ───────────── سرپرست خانوار ───────────── */

export class AddMemberDto {
  @IsIn(['adult', 'child', 'caregiver', 'senior'], { message: 'نوع عضو نامعتبر است' }) type: 'adult' | 'child' | 'caregiver' | 'senior'
  @IsString() @MinLength(1) @MaxLength(120) name: string
  @IsOptional() @IsString() @MaxLength(24) phone?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1300) @Max(1500) birth_year?: number
  @IsOptional() @Matches(ISO_DATE, ISO_DATE_MSG) end_date?: string
  @IsOptional() @IsBoolean() has_phone?: boolean
  @IsOptional() @IsBoolean() finance_access?: boolean
  @IsOptional() @IsBoolean() easy_mode?: boolean
  @IsOptional() @IsString() @MaxLength(60) days?: string
  @IsOptional() @IsString() @MaxLength(40) title?: string
}

export class TransferHeadDto {
  @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) membership_id: string
}

class QuietHoursDto {
  @Matches(/^[0-2]\d:[0-5]\d$/) from: string
  @Matches(/^[0-2]\d:[0-5]\d$/) to: string
}

export class ParentControlDto {
  @IsOptional() @IsIn(['u7', 'c12', 't17', 'custom']) preset?: string
  @IsOptional() @IsObject() modules?: Record<string, number>
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000_000) monthly_cap?: number
  /** null = ساعت سکوت خاموش */
  @IsOptional() @ValidateNested() @Type(() => QuietHoursDto) quiet_hours?: QuietHoursDto | null
  @IsOptional() @IsBoolean() weekly_report?: boolean
  @IsOptional() @IsBoolean() exit_lock?: boolean
  @IsOptional() @IsBoolean() lobby_alert?: boolean
  @IsOptional() @Matches(/^\d{4,6}$/, { message: 'رمز والد باید ۴ تا ۶ رقم باشد' }) exit_pin?: string
}

export class DecideChildRequestDto {
  /** تأیید سفارشی که از سقف بیشتر است، سقف ماه را به‌اندازه‌ی لازم بالا می‌برد (مثل فایل طراحی) */
  @IsOptional() @IsBoolean() raise_cap?: boolean
  @IsOptional() @IsString() @MaxLength(200) reason?: string
}

/* ───────────── کودک ───────────── */

export class FamilyCodeLoginDto {
  @IsString() @MinLength(2) @MaxLength(63) tenantSubdomain: string
  @IsOptional() @Matches(/^\d{6}$/, { message: 'کد باید ۶ رقم باشد' }) code?: string
  @IsOptional() @IsString() @MaxLength(64) qr_token?: string
}

export class ChildRequestDto {
  @IsIn(['order', 'amenity', 'guest', 'ticket']) type: 'order' | 'amenity' | 'guest' | 'ticket'
  @IsOptional() @IsObject() payload?: Record<string, unknown>
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000_000) amount?: number
}

export class ExitUnlockDto {
  @Matches(/^\d{4,6}$/) pin: string
}
