import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { ENTITY_NAMES } from './entities'

// ---------------------------------------------------------------------------
// پاسخ‌های مشترک
// ---------------------------------------------------------------------------

export class PageMeta {
  @ApiProperty({ example: 1 }) page!: number
  @ApiProperty({ example: 100 }) pageSize!: number
  @ApiProperty({ example: 57 }) total!: number
  @ApiProperty({ example: false, description: 'true یعنی صفحه‌ی بعد وجود دارد' }) hasMore!: boolean
}

export class RefDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiPropertyOptional({ example: '1203' }) unitNumber?: string
}

export class NamedRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: 'بلوک A' }) name!: string
}

// ---------------------------------------------------------------------------
// موجودیت‌ها (شکل خروجی API برای ERP)
// ---------------------------------------------------------------------------

export class BuildingDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: 'برج آفتاب - بلوک A' }) name!: string
  @ApiPropertyOptional({ nullable: true }) address!: string | null
  @ApiPropertyOptional({ nullable: true, example: 120 }) totalUnits!: number | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class UnitDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: '1203', description: 'شماره واحد — معمولاً کد طرف حساب واحد در ERP' }) unitNumber!: string
  @ApiPropertyOptional({ nullable: true, example: 12 }) floor!: number | null
  @ApiPropertyOptional({ nullable: true, example: 145.5, description: 'متراژ (مترمربع)' }) areaSqm!: number | null
  @ApiPropertyOptional({ nullable: true, enum: ['vacant', 'owner', 'tenant'] }) occupancy!: string | null
  @ApiPropertyOptional({ nullable: true }) ownershipStatus!: string | null
  @ApiPropertyOptional({ nullable: true, example: 2 }) parkingCount!: number | null
  @ApiPropertyOptional({ nullable: true, example: 'S-12' }) storageNo!: string | null
  @ApiPropertyOptional({ type: NamedRefDto , description: 'ممکن است null باشد' }) building!: NamedRefDto | null
  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'شخصی که شارژ این واحد را می‌پردازد (party.id)' })
  payerPartyId!: string | null
  @ApiProperty({ example: 3, description: 'تعداد ساکنین فعال' }) residents!: number
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class PartyDto {
  @ApiProperty({ format: 'uuid', description: 'شناسه‌ی عضویت این شخص در این واحد (برای ERP: طرف حساب)' }) id!: string
  @ApiProperty({ format: 'uuid', description: 'شناسه‌ی سراسری شخص — یک شخص می‌تواند در چند واحد عضو باشد' }) personId!: string
  @ApiProperty({ example: 'مریم صادقی' }) name!: string
  @ApiPropertyOptional({ nullable: true, example: '09121234567' }) phone!: string | null
  @ApiPropertyOptional({ nullable: true, example: '0012345678' }) nationalId!: string | null
  @ApiPropertyOptional({ type: RefDto , description: 'ممکن است null باشد' }) unit!: RefDto | null
  @ApiProperty({ enum: ['owner', 'tenant', 'owner_absent'], description: 'مالک ساکن / مستأجر / مالک غیرساکن' }) residency!: string
  @ApiProperty({ enum: ['head', 'adult', 'senior', 'owner_absent'], description: 'نقش در خانوار (کودکان ارسال نمی‌شوند)' }) role!: string
  @ApiProperty({ description: 'آیا شارژ واحد را این شخص می‌پردازد' }) paysCharge!: boolean
  @ApiProperty({ enum: ['invited', 'pending_approval', 'pending_head', 'active', 'ended'] }) status!: string
  @ApiPropertyOptional({ nullable: true, format: 'date' }) startDate!: string | null
  @ApiPropertyOptional({ nullable: true, format: 'date' }) endDate!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
}

export class StaffDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: 'رضا کریمی' }) fullName!: string
  @ApiPropertyOptional({ nullable: true }) username!: string | null
  @ApiPropertyOptional({ nullable: true }) email!: string | null
  @ApiPropertyOptional({ nullable: true }) phone!: string | null
  @ApiPropertyOptional({ nullable: true }) nationalId!: string | null
  @ApiProperty({ enum: ['admin', 'staff', 'guard', 'accountant'] }) role!: string
  @ApiPropertyOptional({ nullable: true, enum: ['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'cleaning'] })
  department!: string | null
  @ApiProperty() isActive!: boolean
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) updatedAt!: string | null
}

export class ChargeLineDto {
  @ApiProperty({ enum: ['fixed', 'variable', 'late_fee', 'adjustment'], description: 'برای نگاشت به حساب درآمد در ERP' }) type!: string
  @ApiProperty({ example: 'area', description: 'base | area | residents | fixed_item | service_overage | fnb | late_fee | rounding | charge' })
  code!: string
  @ApiProperty({ example: 'شارژ بر اساس متراژ' }) title!: string
  @ApiProperty({ example: 2_400_000, description: 'مبلغ (تومان)' }) amount!: number
  @ApiPropertyOptional({ example: 120 }) quantity?: number
}

export class ChargeDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: 'CHG-1405-07-1203', description: 'شماره‌ی خوانا (دوره + واحد)' }) number!: string
  @ApiProperty({ type: RefDto }) unit!: RefDto
  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'طرف حساب بدهکار (party.id)' }) payerPartyId!: string | null
  @ApiProperty({ example: '1405-07', description: 'دوره (ماه شمسی)' }) period!: string
  @ApiProperty({ format: 'date-time' }) issueDate!: string
  @ApiPropertyOptional({ nullable: true, format: 'date' }) dueDate!: string | null
  @ApiProperty({ enum: ['pending', 'paid', 'overdue'] }) status!: string
  @ApiProperty({ example: 3_150_000 }) baseAmount!: number
  @ApiProperty({ example: 0 }) lateFeeAmount!: number
  @ApiProperty({ example: 3_150_000, description: 'مبلغ کل = جمع lines' }) totalAmount!: number
  @ApiProperty({ example: 1_000_000 }) paidAmount!: number
  @ApiProperty({ example: 2_150_000 }) balance!: number
  @ApiProperty({ type: [ChargeLineDto], description: 'ردیف‌های فاکتور: شارژ ثابت، شارژ متغیر (کافه/رستوران و مازاد خدمات)، جریمه' })
  lines!: ChargeLineDto[]
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) paidAt!: string | null
  @ApiPropertyOptional({ nullable: true }) payMethod!: string | null
  @ApiProperty() lateFeeWaived!: boolean
  @ApiPropertyOptional({ nullable: true, description: 'engine | import | …' }) source!: string | null
  @ApiPropertyOptional({ nullable: true }) note!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid', description: 'شارژی که این پرداخت تسویه می‌کند' }) chargeId!: string
  @ApiPropertyOptional({ nullable: true, example: '1405-07' }) period!: string | null
  @ApiPropertyOptional({ type: RefDto , description: 'ممکن است null باشد' }) unit!: RefDto | null
  @ApiProperty({ example: 1_000_000 }) amount!: number
  @ApiPropertyOptional({ nullable: true, enum: ['online', 'cash', 'card_to_card', 'bank_transfer', 'cheque'] }) method!: string | null
  @ApiPropertyOptional({ nullable: true }) gateway!: string | null
  @ApiPropertyOptional({ nullable: true }) gatewayRef!: string | null
  @ApiPropertyOptional({ nullable: true, description: 'شماره پیگیری / رسید' }) reference!: string | null
  @ApiProperty({ example: 'success', description: 'فقط success به معنی دریافت قطعی است' }) status!: string
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) paidAt!: string | null
  @ApiPropertyOptional({ nullable: true }) note!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class ExpenseItemDto {
  @ApiProperty({ example: 'لوله ۲ اینچ' }) title!: string
  @ApiProperty({ example: 4 }) quantity!: number
  @ApiProperty({ example: 350_000 }) unitPrice!: number
  @ApiProperty({ example: 1_400_000 }) amount!: number
}

export class AttachmentRefDto {
  @ApiProperty({ example: 'factor.pdf' }) name!: string
  @ApiProperty({ example: 'v1/expenses/{id}/attachment', description: 'مسیر نسبی دانلود فایل پیوست' }) url!: string
}

export class ExpenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: 'EXP-0042' }) number!: string
  @ApiProperty({ example: 'تأسیسات پارس' }) vendor!: string
  @ApiProperty({ example: 'تعمیرات' }) category!: string
  @ApiProperty() description!: string
  @ApiProperty({ type: [ExpenseItemDto] }) items!: ExpenseItemDto[]
  @ApiProperty({ example: 1_400_000 }) amount!: number
  @ApiProperty({ format: 'date' }) invoiceDate!: string
  @ApiProperty({ enum: ['pending', 'paid'] }) status!: string
  @ApiPropertyOptional({ nullable: true, format: 'date' }) paidOn!: string | null
  @ApiPropertyOptional({ nullable: true }) payMethod!: string | null
  @ApiPropertyOptional({ type: AttachmentRefDto , description: 'ممکن است null باشد' }) attachment!: AttachmentRefDto | null
  @ApiPropertyOptional({ nullable: true }) registeredBy!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
}

export class OrderItemDto {
  @ApiProperty({ example: 'کاپوچینو' }) name!: string
  @ApiProperty({ example: 2 }) quantity!: number
  @ApiProperty({ example: 120_000 }) unitPrice!: number
  @ApiProperty({ example: 240_000 }) amount!: number
}

export class OrderBillingDto {
  @ApiProperty({ description: 'true = روی شارژ متغیر واحد می‌نشیند' }) chargeable!: boolean
  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'شارژی که این سفارش در آن صورت‌حساب شده' })
  billedChargeId!: string | null
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) billedAt!: string | null
}

export class FnbOrderDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ example: 'C-1042' }) orderNumber!: string
  @ApiPropertyOptional({ type: NamedRefDto , description: 'ممکن است null باشد' }) venue!: NamedRefDto | null
  @ApiPropertyOptional({ type: RefDto , description: 'ممکن است null باشد' }) unit!: RefDto | null
  @ApiProperty({ example: 'delivered' }) status!: string
  @ApiProperty({ type: [OrderItemDto] }) items!: OrderItemDto[]
  @ApiProperty({ example: 240_000 }) subtotal!: number
  @ApiProperty({ example: 20_000 }) deliveryFee!: number
  @ApiProperty({ example: 260_000 }) total!: number
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) placedAt!: string | null
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) deliveredAt!: string | null
  @ApiProperty({ type: OrderBillingDto }) billing!: OrderBillingDto
  @ApiPropertyOptional({ nullable: true }) cancellationReason!: string | null
}

export class ServiceRefDto {
  @ApiProperty({ example: 'cleaning' }) code!: string
  @ApiProperty({ example: 'نظافت واحد' }) title!: string
  @ApiPropertyOptional({ nullable: true, example: 'ساعت' }) unitLabel!: string | null
}

export class CodeTitleDto {
  @ApiProperty() code!: string
  @ApiProperty() title!: string
}

export class ServiceUsageDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiPropertyOptional({ type: RefDto , description: 'ممکن است null باشد' }) unit!: RefDto | null
  @ApiProperty({ type: ServiceRefDto }) service!: ServiceRefDto
  @ApiPropertyOptional({ type: CodeTitleDto , description: 'ممکن است null باشد' }) tariff!: CodeTitleDto | null
  @ApiProperty({ example: '1405-07' }) period!: string
  @ApiProperty({ format: 'date-time' }) occurredAt!: string
  @ApiProperty({ example: 3, description: 'کل مصرف' }) quantity!: number
  @ApiProperty({ example: 2, description: 'سهم از سهمیه‌ی رایگان آفر' }) quotaQuantity!: number
  @ApiProperty({ example: 1, description: 'مازاد قابل‌پرداخت' }) overageQuantity!: number
  @ApiProperty({ example: 400_000 }) unitPrice!: number
  @ApiProperty({ example: 400_000, description: 'مبلغ قابل‌پرداخت (تومان)' }) amount!: number
  @ApiProperty({ enum: ['active', 'void'] }) status!: string
  @ApiPropertyOptional({ nullable: true }) voidReason!: string | null
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) billedChargeId!: string | null
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) billedAt!: string | null
  @ApiPropertyOptional({ nullable: true }) note!: string | null
}

// ---------------------------------------------------------------------------
// فید تغییرات و گزارش همگام‌سازی
// ---------------------------------------------------------------------------

export class ChangeEventDto {
  @ApiProperty({ example: 4211, description: 'شماره ترتیبی یکنواخت؛ cursor' }) seq!: number
  @ApiProperty({ enum: ENTITY_NAMES }) entity!: string
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ enum: ['created', 'updated', 'deleted'] }) action!: string
  @ApiProperty({ format: 'date-time' }) occurredAt!: string
  @ApiPropertyOptional({
    nullable: true,
    description: 'نسخه‌ی فعلی رکورد (همان شکل endpoint مربوطه). برای deleted یا رکوردی که دیگر در دسترس نیست null است',
  })
  data?: unknown
}

export class ChangesDto {
  @ApiProperty({ type: [ChangeEventDto] }) events!: ChangeEventDto[]
  @ApiProperty({ example: 4260, description: 'در درخواست بعدی به‌عنوان since بفرستید' }) nextCursor!: number
  @ApiProperty({ description: 'true = بلافاصله صفحه‌ی بعد را بخوانید' }) hasMore!: boolean
  @ApiProperty({ example: 4260 }) latestSeq!: number
}

export class SyncItemDto {
  @ApiProperty({ enum: ENTITY_NAMES, example: 'charge' })
  @IsIn(ENTITY_NAMES)
  entity!: string

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string

  @ApiProperty({ enum: ['synced', 'failed', 'skipped'], example: 'synced' })
  @IsIn(['synced', 'failed', 'skipped'])
  status!: string

  @ApiPropertyOptional({ example: 'SF-1405-001234', description: 'شماره سند/کد رکورد در ERP' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  erpRef?: string

  @ApiPropertyOptional({ example: 'کد حساب درآمد تعریف نشده', description: 'دلیل خطا (برای failed)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string
}

export class SyncReportDto {
  @ApiProperty({ type: [SyncItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[]
}

export class SyncStateDto {
  @ApiProperty({ enum: ENTITY_NAMES }) entity!: string
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ enum: ['synced', 'failed', 'skipped'] }) status!: string
  @ApiPropertyOptional({ nullable: true }) erpRef!: string | null
  @ApiPropertyOptional({ nullable: true }) message!: string | null
  @ApiProperty({ format: 'date-time' }) syncedAt!: string
}

export class PingDto {
  @ApiProperty({ example: 'ok' }) status!: string
  @ApiProperty({ example: { id: '11111111-1111-1111-1111-111111111111', name: 'برج آفتاب', subdomain: 'borj-aftab' } })
  tenant!: Record<string, unknown>
  @ApiProperty({ example: { id: 'a0000000-…', name: 'اتصال سپیدار', scopes: ['read', 'sync'] } })
  key!: Record<string, unknown>
  @ApiProperty({ example: 'IRT', description: 'واحد مبالغ: تومان' }) currency!: string
  @ApiProperty({ example: 'jalali', description: 'period ها ماه شمسی YYYY-MM هستند' }) periodCalendar!: string
  @ApiProperty({ example: 4260 }) latestSeq!: number
  @ApiProperty({ format: 'date-time' }) serverTime!: string
  @ApiProperty({ example: '1.0.0' }) apiVersion!: string
}

// ---------------------------------------------------------------------------
// ورودی‌های پنل مدیریت (JWT)
// ---------------------------------------------------------------------------

export class CreateKeyDto {
  @ApiProperty({ example: 'اتصال نرم‌افزار سپیدار' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiPropertyOptional({ example: ['read', 'sync'], description: 'read = خواندن داده، sync = گزارش شماره سند ERP' })
  @IsOptional()
  @IsArray()
  @IsIn(['read', 'sync'], { each: true })
  scopes?: string[]

  @ApiPropertyOptional({ example: 365, description: 'اعتبار به روز (خالی = بدون انقضا)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number
}

export class ConnectorDto {
  @ApiProperty({ example: 'ارسال به ERP مرکزی' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiPropertyOptional({ example: 'webhook', description: 'نوع آداپتر (فعلاً webhook؛ آداپترهای اختصاصی بعداً اضافه می‌شوند)' })
  @IsOptional()
  @IsString()
  type?: string

  @ApiProperty({ example: 'https://erp.example.com/hamin/inbox' })
  @IsString()
  @MaxLength(500)
  url!: string

  @ApiPropertyOptional({ example: ['charge', 'payment', 'expense'], description: 'موجودیت‌ها؛ * = همه' })
  @IsOptional()
  @IsArray()
  @IsIn([...ENTITY_NAMES, '*'], { each: true })
  entities?: string[]

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  batchSize?: number

  @ApiPropertyOptional({ enum: ['active', 'paused'] })
  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: string

  @ApiPropertyOptional({ enum: ['now', 'beginning'], description: 'شروع ارسال از الان یا از اولین تغییر ثبت‌شده' })
  @IsOptional()
  @IsIn(['now', 'beginning'])
  startFrom?: string

  @ApiPropertyOptional({ description: 'تنظیمات اختصاصی آداپتر' })
  @IsOptional()
  config?: Record<string, unknown>
}

export class UpdateConnectorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) url?: string
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsIn([...ENTITY_NAMES, '*'], { each: true }) entities?: string[]
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) batchSize?: number
  @ApiPropertyOptional({ enum: ['active', 'paused'] }) @IsOptional() @IsIn(['active', 'paused']) status?: string
  @ApiPropertyOptional({ description: 'true = ساخت secret جدید' }) @IsOptional() @IsBoolean() rotateSecret?: boolean
  @ApiPropertyOptional() @IsOptional() config?: Record<string, unknown>
}

export class ResetCursorDto {
  @ApiProperty({ enum: ['beginning', 'latest', 'seq'] })
  @IsIn(['beginning', 'latest', 'seq'])
  to!: string

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number
}

export class BackfillDto {
  @ApiPropertyOptional({ example: ['unit', 'party', 'charge'], description: 'خالی = همه' })
  @IsOptional()
  @IsArray()
  @IsIn(ENTITY_NAMES, { each: true })
  entities?: string[]
}
