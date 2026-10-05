import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Max, Min } from 'class-validator'

export class CreateInvoiceDto {
  @IsUUID() tenantId: string
  /** ماه شمسی، مثل 1405-07 — پیش‌فرض ماه جاری */
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'دوره باید به‌صورت 1405-07 باشد' }) period?: string
  /** پیش‌فرض: اشتراک ماهانه‌ی قرارداد */
  @IsOptional() @IsInt() @Min(0) amount?: number
  @IsOptional() @IsInt() @Min(0) @Max(120) dueInDays?: number
  @IsOptional() @IsString() @MaxLength(300) note?: string
}

export class GenerateInvoicesDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'دوره باید به‌صورت 1405-07 باشد' }) period?: string
}

export class InvoiceStatusDto {
  @IsIn(['pending', 'paid', 'failed', 'void']) status: 'pending' | 'paid' | 'failed' | 'void'
}
