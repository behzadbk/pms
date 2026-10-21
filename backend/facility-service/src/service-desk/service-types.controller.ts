import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import {
  CurrentUser,
  JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { auditLog } from '../common/inbox';

const DEPT_RE = /^[a-z][a-z0-9_]{1,30}$/;

export class ServiceTypeDto {
  @IsString()
  @MinLength(2, { message: 'عنوان خدمت را بنویسید' })
  @MaxLength(60)
  title: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @Matches(DEPT_RE, { message: 'دپارتمان نامعتبر است' })
  department_code: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
export class ServiceTypePatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) title?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional()
  @Matches(DEPT_RE, { message: 'دپارتمان نامعتبر است' })
  department_code?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

interface TypeRow {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  department_code: string;
  department_name: string | null;
  manager_name: string | null;
  is_active: boolean;
}

async function assertDepartment(client: PoolClient, code: string) {
  const r = await client.query<{ is_active: boolean }>(
    `SELECT is_active FROM identity.departments WHERE code = $1`,
    [code],
  );
  if (!r.rows[0])
    throw new BadRequestException('این دپارتمان در ساختمان تعریف نشده است');
  if (!r.rows[0].is_active)
    throw new BadRequestException('این دپارتمان غیرفعال است');
}

const SELECT_TYPES = `
  SELECT t.id, t.title, t.icon, t.description, t.department_code, d.name AS department_name,
         m.full_name AS manager_name, t.is_active
    FROM facility.service_types t
    LEFT JOIN identity.departments d ON d.code = t.department_code
    LEFT JOIN identity.users m ON m.id = d.manager_user_id`;

/**
 * کاتالوگ خدمات (کارواش، خانه‌داری، نظافت …) — مدیر ساختمان هر خدمت را به یک «دپارتمان» وصل می‌کند.
 * درخواست ساکن به مدیر همان دپارتمان می‌رسد؛ برای هر خدمت پنل/داشبورد جدا ساخته نمی‌شود.
 *   GET    /service-types          ساکن و کارکنان: فقط خدمات فعال · مدیر: همه
 *   POST   /service-types · PATCH /service-types/:id · DELETE /service-types/:id   (مدیر ساختمان)
 */
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const showAll = user.role === 'admin' && all === '1';
      const r = await client.query<TypeRow>(
        `${SELECT_TYPES} ${showAll ? '' : 'WHERE t.is_active'} ORDER BY t.sort, t.title`,
      );
      return r.rows;
    });
  }

  @Roles('admin')
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: ServiceTypeDto) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      await assertDepartment(client, dto.department_code);
      const dup = await client.query(
        `SELECT 1 FROM facility.service_types WHERE lower(btrim(title)) = lower($1)`,
        [dto.title.trim()],
      );
      if (dup.rowCount)
        throw new BadRequestException('خدمتی با این عنوان وجود دارد');
      const ins = await client.query<{ id: string }>(
        `INSERT INTO facility.service_types (tenant_id, title, icon, description, department_code, is_active, sort)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT max(sort) FROM facility.service_types), 100) + 10) RETURNING id`,
        [
          user.tenant_id,
          dto.title.trim(),
          dto.icon ?? null,
          dto.description ?? null,
          dto.department_code,
          dto.is_active ?? true,
        ],
      );
      await auditLog(client, user.tenant_id!, user, 'service_type.created', {
        summary: `خدمت «${dto.title.trim()}» تعریف شد`,
        service_type_id: ins.rows[0].id,
      });
      return (
        await client.query<TypeRow>(`${SELECT_TYPES} WHERE t.id = $1`, [
          ins.rows[0].id,
        ])
      ).rows[0];
    });
  }

  @Roles('admin')
  @Patch(':id')
  patch(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ServiceTypePatchDto,
  ) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const sets: string[] = [];
      const vals: unknown[] = [];
      const set = (col: string, v: unknown) => {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      };
      if (dto.department_code !== undefined) {
        await assertDepartment(client, dto.department_code);
        set('department_code', dto.department_code);
      }
      if (dto.title !== undefined) {
        const dup = await client.query(
          `SELECT 1 FROM facility.service_types WHERE id <> $1 AND lower(btrim(title)) = lower($2)`,
          [id, dto.title.trim()],
        );
        if (dup.rowCount)
          throw new BadRequestException('خدمتی با این عنوان وجود دارد');
        set('title', dto.title.trim());
      }
      if (dto.icon !== undefined) set('icon', dto.icon || null);
      if (dto.description !== undefined)
        set('description', dto.description || null);
      if (dto.is_active !== undefined) set('is_active', dto.is_active);
      if (sets.length) {
        vals.push(id);
        const r = await client.query(
          `UPDATE facility.service_types SET ${sets.join(', ')} WHERE id = $${vals.length}`,
          vals,
        );
        if (!r.rowCount) throw new NotFoundException('خدمت یافت نشد');
      }
      const row = (
        await client.query<TypeRow>(`${SELECT_TYPES} WHERE t.id = $1`, [id])
      ).rows[0];
      if (!row) throw new NotFoundException('خدمت یافت نشد');
      return row;
    });
  }

  @Roles('admin')
  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      // عنوان و دپارتمان در هر درخواست نگه‌داشته شده؛ حذف خدمت تاریخچه را خراب نمی‌کند
      const r = await client.query(
        `DELETE FROM facility.service_types WHERE id = $1`,
        [id],
      );
      if (!r.rowCount) throw new NotFoundException('خدمت یافت نشد');
      return { ok: true };
    });
  }
}
