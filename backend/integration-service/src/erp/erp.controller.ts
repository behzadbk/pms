import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Response } from 'express'
import { Public } from '../auth/decorators/public.decorator'
import { DatabaseService } from '../database/database.service'
import {
  BuildingDto,
  ChangesDto,
  ChargeDto,
  ExpenseDto,
  FnbOrderDto,
  PartyDto,
  PaymentDto,
  PingDto,
  ServiceUsageDto,
  StaffDto,
  SyncReportDto,
  SyncStateDto,
  UnitDto,
} from './dto'
import { ENTITY_NAMES, EntityName, getByIds, getOne, listEntity } from './entities'
import { Erp, ErpCaller, ErpKeyGuard, RequireScope } from './erp-key.guard'
import { ApiData, ApiPaged, ApiPaging } from './swagger.helpers'

export const API_VERSION = '1.0.0'

type Q = Record<string, string | undefined>

function paging(q: Q) {
  const page = Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1)
  const pageSize = Math.min(500, Math.max(1, Number.parseInt(q.pageSize ?? '100', 10) || 100))
  let updatedSince: string | undefined
  if (q.updatedSince) {
    const d = new Date(q.updatedSince)
    if (Number.isNaN(d.getTime())) throw new BadRequestException('updatedSince باید تاریخ ISO-8601 باشد')
    updatedSince = d.toISOString()
  }
  return { page, pageSize, updatedSince }
}

@ApiTags('ERP')
@ApiSecurity('erpApiKey')
@ApiUnauthorizedResponse({ description: 'کلید API ارسال نشده، نامعتبر، باطل یا منقضی است' })
@ApiForbiddenResponse({ description: 'کلید مجوز (scope) لازم را ندارد' })
@Public() // JWT کاربران اینجا پذیرفته نمی‌شود؛ احراز هویت فقط با کلید ERP
@UseGuards(ErpKeyGuard)
@Controller('v1')
export class ErpController {
  constructor(private readonly db: DatabaseService) {}

  private async list(erp: ErpCaller, entity: EntityName, q: Q) {
    const p = paging(q)
    const { items, total } = await this.db.withTenant(erp.tenantId, (c) => listEntity(c, entity, { ...p, filters: q }))
    return { data: items, meta: { page: p.page, pageSize: p.pageSize, total, hasMore: p.page * p.pageSize < total } }
  }

  private async one(erp: ErpCaller, entity: EntityName, id: string) {
    const item = await this.db.withTenant(erp.tenantId, (c) => getOne(c, entity, id))
    if (!item) throw new NotFoundException('رکورد پیدا نشد')
    return { data: item }
  }

  // ------------------------------------------------------------------ عمومی

  @Get('ping')
  @ApiOperation({ summary: 'بررسی اتصال و مشخصات کلید', description: 'اولین درخواست هر ERP: صحت کلید، مجتمع متصل، واحد پول و آخرین cursor فید.' })
  @ApiData(PingDto)
  async ping(@Erp() erp: ErpCaller) {
    return this.db.withTenant(erp.tenantId, async (c) => {
      const t = (await c.query(`SELECT id, name, subdomain FROM identity.tenants WHERE id = $1`, [erp.tenantId])).rows[0] ?? {
        id: erp.tenantId,
      }
      const seq = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      return {
        data: {
          status: 'ok',
          tenant: t,
          key: { id: erp.keyId, name: erp.keyName, scopes: erp.scopes },
          currency: 'IRT',
          periodCalendar: 'jalali',
          latestSeq: seq,
          serverTime: new Date().toISOString(),
          apiVersion: API_VERSION,
        },
      }
    })
  }

  // ------------------------------------------------------------------ اطلاعات پایه

  @Get('buildings')
  @ApiOperation({ summary: 'ساختمان‌ها / بلوک‌ها' })
  @ApiPaging(false)
  @ApiPaged(BuildingDto)
  buildings(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'building', q)
  }

  @Get('units')
  @ApiOperation({
    summary: 'واحدها',
    description: 'هر واحد معمولاً یک «طرف حساب» یا مرکز هزینه در ERP است. `payerPartyId` شخص پرداخت‌کننده‌ی شارژ را نشان می‌دهد.',
  })
  @ApiPaging(false)
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'occupancy', required: false, enum: ['vacant', 'owner', 'tenant'] })
  @ApiQuery({ name: 'unitNumber', required: false })
  @ApiPaged(UnitDto)
  units(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'unit', q)
  }

  @Get('units/:id')
  @ApiOperation({ summary: 'یک واحد' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(UnitDto)
  @ApiNotFoundResponse()
  unit(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'unit', id)
  }

  @Get('parties')
  @ApiOperation({
    summary: 'اشخاص (مالک، مستأجر، مالک غیرساکن)',
    description: 'طرف‌حساب‌های مالی ساختمان. کودکان و مراقبان موقت ارسال نمی‌شوند. برای یافتن پرداخت‌کننده‌ی شارژ: `paysCharge=true`.',
  })
  @ApiPaging(true)
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'residency', required: false, enum: ['owner', 'tenant', 'owner_absent'] })
  @ApiQuery({ name: 'status', required: false, enum: ['invited', 'pending_approval', 'pending_head', 'active', 'ended'] })
  @ApiQuery({ name: 'paysCharge', required: false, type: Boolean })
  @ApiQuery({ name: 'nationalId', required: false })
  @ApiPaged(PartyDto)
  parties(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'party', q)
  }

  @Get('parties/:id')
  @ApiOperation({ summary: 'یک شخص' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(PartyDto)
  @ApiNotFoundResponse()
  party(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'party', id)
  }

  @Get('staff')
  @ApiOperation({ summary: 'کارکنان', description: 'برای حقوق‌ودستمزد در ERP: مدیر، کارکنان بخش‌ها، نگهبانی و حسابداری.' })
  @ApiPaging(true)
  @ApiQuery({ name: 'role', required: false, enum: ['admin', 'staff', 'guard', 'accountant'] })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiPaged(StaffDto)
  staff(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'staff', q)
  }

  @Get('staff/:id')
  @ApiOperation({ summary: 'یک کارمند' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(StaffDto)
  @ApiNotFoundResponse()
  staffOne(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'staff', id)
  }

  // ------------------------------------------------------------------ مالی

  @Get('charges')
  @ApiOperation({
    summary: 'شارژهای صادرشده (فاکتور فروش هر واحد)',
    description:
      'هر شارژ = یک فاکتور فروش/سند بدهکار برای واحد. `lines` ردیف‌های قابل‌نگاشت به حساب‌های درآمد است: ' +
      'شارژ ثابت (پایه، متراژ، نفرات، آیتم‌های ثابت)، **شارژ متغیر** (کافه/رستوران و مازاد خدمات)، جریمه‌ی دیرکرد و گرد کردن. جمع ردیف‌ها = totalAmount.',
  })
  @ApiPaging(true)
  @ApiQuery({ name: 'period', required: false, description: 'ماه شمسی، مثلاً 1405-07' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'paid', 'overdue'] })
  @ApiPaged(ChargeDto)
  charges(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'charge', q)
  }

  @Get('charges/:id')
  @ApiOperation({ summary: 'یک شارژ' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(ChargeDto)
  @ApiNotFoundResponse()
  charge(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'charge', id)
  }

  @Get('payments')
  @ApiOperation({
    summary: 'پرداخت‌ها (دریافت از واحدها)',
    description: 'فقط `status=success` دریافت قطعی است. برای سند دریافت: بدهکار بانک/صندوق بر اساس `method`، بستانکار طرف حساب واحد.',
  })
  @ApiPaging(false)
  @ApiQuery({ name: 'status', required: false, description: 'مثلاً success' })
  @ApiQuery({ name: 'chargeId', required: false })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiPaged(PaymentDto)
  payments(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'payment', q)
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'یک پرداخت' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(PaymentDto)
  @ApiNotFoundResponse()
  payment(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'payment', id)
  }

  @Get('expenses')
  @ApiOperation({ summary: 'فاکتورهای هزینه‌ی ساختمان', description: 'ثبت‌شده توسط حسابدار در پنل (خرید قطعه، پیمانکار، قبوض…).' })
  @ApiPaging(true)
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'paid'] })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'vendor', required: false })
  @ApiPaged(ExpenseDto)
  expenses(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'expense', q)
  }

  @Get('expenses/:id')
  @ApiOperation({ summary: 'یک فاکتور هزینه' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(ExpenseDto)
  @ApiNotFoundResponse()
  expense(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'expense', id)
  }

  @Get('expenses/:id/attachment')
  @ApiOperation({ summary: 'فایل پیوست فاکتور هزینه' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream')
  @ApiOkResponse({ description: 'فایل خام' })
  @ApiNotFoundResponse()
  async expenseAttachment(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const f = await this.db.withTenant(erp.tenantId, async (c) =>
      (
        await c.query<{ attachment_name: string; attachment_mime: string; attachment_data: Buffer }>(
          `SELECT attachment_name, attachment_mime, attachment_data FROM finance.expense_invoices WHERE id = $1`,
          [id],
        )
      ).rows[0],
    )
    if (!f?.attachment_data) throw new NotFoundException('این فاکتور پیوست ندارد')
    res.setHeader('Content-Type', f.attachment_mime || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.attachment_name || 'attachment')}`)
    res.send(f.attachment_data)
  }

  @Get('fnb-orders')
  @ApiOperation({
    summary: 'سفارش‌های کافه/رستوران',
    description: 'سفارش تحویل‌شده با `billing.chargeable=true` روی شارژ متغیر واحد می‌نشیند (در lines شارژ با code=fnb).',
  })
  @ApiPaging(false)
  @ApiQuery({ name: 'status', required: false, description: 'مثلاً delivered' })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'venueId', required: false })
  @ApiPaged(FnbOrderDto)
  fnbOrders(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'fnb_order', q)
  }

  @Get('fnb-orders/:id')
  @ApiOperation({ summary: 'یک سفارش کافه/رستوران' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(FnbOrderDto)
  @ApiNotFoundResponse()
  fnbOrder(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'fnb_order', id)
  }

  @Get('service-usages')
  @ApiOperation({
    summary: 'مصرف خدمات و مازاد آفرها',
    description: 'مثلاً ساعت نظافت داخل واحد: سهم از سهمیه‌ی رایگان (`quotaQuantity`) و مازاد قابل‌پرداخت (`overageQuantity`، `amount`).',
  })
  @ApiPaging(false)
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'void'] })
  @ApiQuery({ name: 'serviceCode', required: false })
  @ApiPaged(ServiceUsageDto)
  serviceUsages(@Erp() erp: ErpCaller, @Query() q: Q) {
    return this.list(erp, 'service_usage', q)
  }

  @Get('service-usages/:id')
  @ApiOperation({ summary: 'یک مصرف خدمت' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiData(ServiceUsageDto)
  @ApiNotFoundResponse()
  serviceUsage(@Erp() erp: ErpCaller, @Param('id', ParseUUIDPipe) id: string) {
    return this.one(erp, 'service_usage', id)
  }

  // ------------------------------------------------------------------ همگام‌سازی

  @Get('changes')
  @ApiOperation({
    summary: 'فید تغییرات (همگام‌سازی افزایشی)',
    description:
      'همه‌ی تغییرات به ترتیب `seq`. الگو: `since`=آخرین cursor ذخیره‌شده → پردازش رویدادها → ذخیره‌ی `nextCursor` → ' +
      'تا وقتی `hasMore=true` ادامه بده؛ سپس هر چند ثانیه/دقیقه poll کن. هیچ تغییری از دست نمی‌رود حتی اگر ERP مدتی خاموش باشد.',
  })
  @ApiQuery({ name: 'since', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 200, description: '۱ تا ۱۰۰۰' })
  @ApiQuery({ name: 'entities', required: false, description: `با کاما، مثلاً charge,payment — از میان: ${ENTITY_NAMES.join(', ')}` })
  @ApiQuery({ name: 'includeData', required: false, type: Boolean, example: true, description: 'نسخه‌ی کامل رکورد در data' })
  @ApiData(ChangesDto)
  async changes(@Erp() erp: ErpCaller, @Query() q: Q) {
    const since = Math.max(0, Number.parseInt(q.since ?? '0', 10) || 0)
    const limit = Math.min(1000, Math.max(1, Number.parseInt(q.limit ?? '200', 10) || 200))
    const filter = q.entities ? q.entities.split(',').map((s) => s.trim()).filter(Boolean) : []
    const bad = filter.filter((e) => !ENTITY_NAMES.includes(e as EntityName))
    if (bad.length) throw new BadRequestException(`موجودیت نامعتبر: ${bad.join(', ')}`)
    const includeData = q.includeData !== 'false'

    return this.db.withTenant(erp.tenantId, async (c) => {
      // limit+1 ردیف «اسکن» می‌کنیم؛ فیلتر موجودیت بعد از اسکن اعمال می‌شود تا cursor از ردیف‌های فیلترشده هم عبور کند
      const rows = (
        await c.query<{ seq: string; entity: EntityName; entity_id: string; action: string; occurred_at: Date }>(
          `SELECT seq, entity, entity_id, action, occurred_at FROM integration.outbox WHERE seq > $1 ORDER BY seq LIMIT $2`,
          [since, limit + 1],
        )
      ).rows
      const hasMore = rows.length > limit
      const scanned = rows.slice(0, limit)
      const picked = filter.length ? scanned.filter((r) => filter.includes(r.entity)) : scanned
      const snapshots = new Map<string, any>()
      if (includeData) {
        const byEntity = new Map<EntityName, string[]>()
        for (const r of picked) if (r.action !== 'deleted') byEntity.set(r.entity, [...(byEntity.get(r.entity) ?? []), r.entity_id])
        for (const [entity, ids] of byEntity) {
          const m = await getByIds(c, entity, [...new Set(ids)])
          for (const [id, v] of m) snapshots.set(`${entity}:${id}`, v)
        }
      }
      const latest = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      const nextCursor = scanned.length ? Number(scanned[scanned.length - 1].seq) : since
      return {
        data: {
          events: picked.map((r) => ({
            seq: Number(r.seq),
            entity: r.entity,
            id: r.entity_id,
            action: r.action,
            occurredAt: r.occurred_at.toISOString(),
            ...(includeData ? { data: snapshots.get(`${r.entity}:${r.entity_id}`) ?? null } : {}),
          })),
          nextCursor,
          hasMore,
          latestSeq: latest,
        },
      }
    })
  }

  @Post('sync')
  @HttpCode(200)
  @RequireScope('sync')
  @ApiOperation({
    summary: 'گزارش نتیجه‌ی ثبت در ERP',
    description:
      'ERP بعد از ثبت هر رکورد، شماره سند/کد خودش (`erpRef`) یا خطا را گزارش می‌دهد. این فقط «مرجع» است؛ ' +
      'داده‌ی حسابداری در Livo ذخیره نمی‌شود. نتیجه در پنل حسابداری Livo (وضعیت اتصال ERP) دیده می‌شود. تا ۱۰۰۰ مورد در هر درخواست.',
  })
  @ApiBadRequestResponse()
  @ApiOkResponse({ schema: { example: { data: { accepted: 2 } } } })
  async sync(@Erp() erp: ErpCaller, @Body() body: SyncReportDto) {
    await this.db.withTenant(erp.tenantId, async (c) => {
      for (const it of body.items) {
        await c.query(
          `INSERT INTO integration.sync_state (tenant_id, entity, entity_id, status, erp_ref, message, reported_by, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (tenant_id, entity, entity_id) DO UPDATE
             SET status = EXCLUDED.status, erp_ref = COALESCE(EXCLUDED.erp_ref, integration.sync_state.erp_ref),
                 message = EXCLUDED.message, reported_by = EXCLUDED.reported_by, synced_at = now()`,
          [erp.tenantId, it.entity, it.id, it.status, it.erpRef ?? null, it.message ?? null, erp.keyId],
        )
      }
    })
    return { data: { accepted: body.items.length } }
  }

  @Get('sync')
  @ApiOperation({ summary: 'وضعیت همگام‌سازی گزارش‌شده', description: 'مثلاً `?status=failed` برای دیدن مواردی که در ERP ثبت نشده‌اند.' })
  @ApiQuery({ name: 'entity', required: false, enum: ENTITY_NAMES })
  @ApiQuery({ name: 'status', required: false, enum: ['synced', 'failed', 'skipped'] })
  @ApiQuery({ name: 'id', required: false, description: 'شناسه‌ی رکورد همین' })
  @ApiPaging(false)
  @ApiPaged(SyncStateDto)
  async syncState(@Erp() erp: ErpCaller, @Query() q: Q) {
    const p = paging(q)
    return this.db.withTenant(erp.tenantId, async (c) => {
      const where: string[] = []
      const params: unknown[] = []
      for (const [k, col] of [['entity', 'entity'], ['status', 'status'], ['id', 'entity_id']] as const) {
        if (q[k]) {
          params.push(q[k])
          where.push(`${col} = $${params.length}`)
        }
      }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = Number((await c.query(`SELECT count(*) AS n FROM integration.sync_state ${w}`, params)).rows[0].n)
      params.push(p.pageSize, (p.page - 1) * p.pageSize)
      const rows = (
        await c.query(
          `SELECT entity, entity_id, status, erp_ref, message, synced_at FROM integration.sync_state ${w}
            ORDER BY synced_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params,
        )
      ).rows
      return {
        data: rows.map((r) => ({
          entity: r.entity,
          id: r.entity_id,
          status: r.status,
          erpRef: r.erp_ref,
          message: r.message,
          syncedAt: r.synced_at.toISOString(),
        })),
        meta: { page: p.page, pageSize: p.pageSize, total, hasMore: p.page * p.pageSize < total },
      }
    })
  }
}
