import { Type, applyDecorators } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, ApiQuery, getSchemaPath } from '@nestjs/swagger'
import { PageMeta } from './dto'

/** پاسخ فهرستی: { data: T[], meta: PageMeta } */
export const ApiPaged = <T extends Type<unknown>>(model: T, description?: string) =>
  applyDecorators(
    ApiExtraModels(model, PageMeta),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMeta) },
        },
      },
    }),
  )

/** پاسخ تکی: { data: T } */
export const ApiData = <T extends Type<unknown>>(model: T, description?: string) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({ description, schema: { type: 'object', properties: { data: { $ref: getSchemaPath(model) } } } }),
  )

export const ApiPaging = (withUpdatedSince: boolean) =>
  applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, type: Number, example: 100, description: 'حداکثر ۵۰۰' }),
    ...(withUpdatedSince
      ? [
          ApiQuery({
            name: 'updatedSince',
            required: false,
            type: String,
            description: 'فقط رکوردهای تغییر‌یافته از این زمان (ISO-8601)، مثلاً 2026-10-01T00:00:00Z',
          }),
        ]
      : []),
  )
