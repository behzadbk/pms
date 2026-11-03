import { IsDateString, IsIn, IsOptional } from 'class-validator'
import { STAFF_PERMISSIONS } from '../staff.constants'

/** دسترسی موقت: tenant، کاربر و granted_by هرگز از بدنه نمی‌آیند (از JWT/مسیر گرفته می‌شوند) */
export class CreateGrantDto {
  @IsIn(STAFF_PERMISSIONS as unknown as string[], { message: 'دسترسی نامعتبر است' })
  permission: string

  /** پیش‌فرض: همین الان */
  @IsOptional()
  @IsDateString({}, { message: 'تاریخ شروع نامعتبر است' })
  startsAt?: string

  @IsDateString({}, { message: 'تاریخ پایان نامعتبر است' })
  expiresAt: string
}
