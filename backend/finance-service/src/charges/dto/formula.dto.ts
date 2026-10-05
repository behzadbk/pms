import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

/**
 * فرمول شارژ = مبلغ پایه + (مبلغ هر متر × متراژ واحد).
 * فقط همین دو پارامتر در صدور شارژ استفاده می‌شوند (calc_type همیشه hybrid ذخیره می‌شود).
 */
export class CreateFormulaDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string
  @IsNumber() @Min(0) @Max(1_000_000_000) baseAmount: number
  @IsNumber() @Min(0) @Max(100_000_000) amountPerSqm: number
}

export class UpdateFormulaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) baseAmount?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100_000_000) amountPerSqm?: number
  @IsOptional() @IsBoolean() isActive?: boolean
}
