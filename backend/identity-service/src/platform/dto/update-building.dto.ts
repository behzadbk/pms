import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { BuildingTier, TIER_IDS } from '../tiers'

/** ویرایش یک ساختمان موجود (تغییر سطح، وضعیت، یا اطلاعات مالی اشتراک) */
export class UpdateBuildingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsIn(TIER_IDS)
  tier?: BuildingTier

  @IsOptional()
  @IsInt()
  @Min(1)
  unitCount?: number

  @IsOptional()
  @IsIn(['active', 'trial', 'suspended', 'cancelled'])
  status?: 'active' | 'trial' | 'suspended' | 'cancelled'

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyFee?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  outstandingAmount?: number

  @IsOptional()
  @IsIn(['settled', 'due', 'overdue'])
  billingStatus?: 'settled' | 'due' | 'overdue'

  @IsOptional()
  @IsString()
  @MaxLength(120)
  managerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  managerPhone?: string
}
