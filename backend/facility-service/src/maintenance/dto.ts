import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'

export const KINDS = ['fault', 'criticism', 'suggestion', 'direct'] as const
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export const STATUSES = ['open', 'in_progress', 'resolved'] as const
export const ASSET_CATEGORIES = ['elevator', 'lighting', 'plumbing', 'hvac', 'fire', 'electrical', 'door', 'other'] as const
export const SERVICE_TYPES = ['repair', 'replace', 'service', 'inspection'] as const

export class CreateTicketDto {
  @IsIn(KINDS as unknown as string[]) kind: (typeof KINDS)[number]
  @IsString() @MinLength(2) @MaxLength(160) subject: string
  @IsOptional() @IsString() @MaxLength(4000) body?: string
  @IsOptional() @IsString() @MaxLength(200) location?: string
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: (typeof PRIORITIES)[number]
  /** فقط مدیر/پرسنل: ثبت تیکت از طرف یک واحد */
  @IsOptional() @IsUUID() unitId?: string
  @IsOptional() @IsUUID() assetId?: string
}

export class UpdateTicketDto {
  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: (typeof STATUSES)[number]
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: (typeof PRIORITIES)[number]
  @IsOptional() @IsUUID() assetId?: string | null
  @IsOptional() @IsUUID() assignedTo?: string | null
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string | null
  @IsOptional() @IsString() @MaxLength(1000) note?: string
}

export class NoteDto {
  @IsString() @MinLength(1) @MaxLength(1000) text: string
}

export class AssetDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string
  @IsIn(ASSET_CATEGORIES as unknown as string[]) category: (typeof ASSET_CATEGORIES)[number]
  @IsOptional() @IsString() @MaxLength(200) location?: string
  @IsOptional() @IsInt() @Min(1) @Max(3650) serviceIntervalDays?: number
}

export class UpdateAssetDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string
  @IsOptional() @IsIn(ASSET_CATEGORIES as unknown as string[]) category?: (typeof ASSET_CATEGORIES)[number]
  @IsOptional() @IsString() @MaxLength(200) location?: string
  @IsOptional() @IsInt() @Min(1) @Max(3650) serviceIntervalDays?: number | null
  @IsOptional() @IsBoolean() isActive?: boolean
}

export class ServiceRecordDto {
  @IsUUID() assetId: string
  @IsOptional() @IsUUID() ticketId?: string
  @IsIn(SERVICE_TYPES as unknown as string[]) type: (typeof SERVICE_TYPES)[number]
  @IsString() @MinLength(2) @MaxLength(1000) description: string
  @IsString() @MinLength(2) @MaxLength(120) performer: string
  @IsOptional() @IsNumber() @Min(0) @Max(1e11) cost?: number
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string
  /** true = تیکت مرتبط حل‌شده شود؛ false = «در حال رسیدگی» */
  @IsOptional() @IsBoolean() closeTicket?: boolean
}
