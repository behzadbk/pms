import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { PgExceptionFilter } from './common/pg-exception.filter'
import { ErpApiModule, IntegrationAdminModule } from './erp/integration.module'
import { API_VERSION } from './erp/erp.controller'

const ERP_DOC = `
API اتصال **Livo** (نرم‌افزار مدیریت ساختمان) به **ERP / نرم‌افزار حسابداری** ساختمان.

Livo نرم‌افزار حسابداری نیست؛ داده‌ی عملیاتی و مالیِ تولیدشده در همین — شارژ صادرشده‌ی هر واحد، پرداخت‌ها،
فاکتورهای هزینه، **شارژ متغیر** (کافه/رستوران و مازاد خدمات)، واحدها، اشخاص و کارکنان — از این API در اختیار ERP قرار می‌گیرد
و ثبت سند حسابداری در خود ERP انجام می‌شود.

### دو روش اتصال
1. **Pull — ERP می‌خواند:** با کلید API از endpointهای زیر داده را بخوانید و برای همگام‌سازی افزایشی از \`GET /v1/changes\` استفاده کنید.
2. **Push — Livo می‌فرستد:** در پنل مدیر/حسابدار (اتصال ERP) آدرس ERP را ثبت کنید؛ هر تغییر به‌صورت دسته‌ای با امضای HMAC به آن آدرس POST می‌شود.

### احراز هویت
هدر \`X-API-Key: hmn_live_…\` — کلید را مدیر یا حسابدار ساختمان در پنل می‌سازد (فقط یک بار نمایش داده می‌شود).
کلید تست محیط توسعه: \`hmn_test_11111111111111111111111111111111_sandboxkey000000000000000001\`

### قراردادها
- مبالغ: **تومان** (عدد صحیح). دوره‌ی شارژ (\`period\`): ماه **شمسی** \`YYYY-MM\`. تاریخ‌ها: ISO-8601.
- فهرست‌ها: \`{ data: [...], meta: { page, pageSize, total, hasMore } }\` — \`pageSize\` تا ۵۰۰.
- تکی: \`{ data: {...} }\`. خطا: \`{ statusCode, message, error }\`.
- شناسه‌ها UUID و پایدارند؛ شماره سند ERP را با \`POST /v1/sync\` گزارش دهید تا در پنل Livo دیده شود.
- امضای push: \`X-Livo-Signature: t=<unix>,v1=<hex(HMAC_SHA256(secret, t + "." + rawBody))>\`.

راهنمای کامل: docs/09-ERP-INTEGRATION.md در ریپو.
`

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  // خاموشی تمیز روی SIGTERM/SIGINT (هر دیپلوی یا ری‌استارت docker):
  // ۱) دیگر اتصال جدید نپذیر و صبر کن درخواست‌های در جریان تمام شوند؛ ۲) بعد app.close() (بستن pool دیتابیس و صف‌ها).
  // نکته: enableShutdownHooks()ِ Nest اول onModuleDestroy (pool.end) را اجرا می‌کند و بعد سرور را می‌بندد؛
  // درخواست‌های در جریان با «Cannot use a pool after calling end» شکست می‌خوردند، پس ترتیب را خودمان تعیین می‌کنیم.
  // docker stop بعد از ۱۰ ثانیه SIGKILL می‌زند، پس سقف تخلیه ۷ ثانیه و خروج اجباری ۹ ثانیه است.
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    Logger.log(`${signal} دریافت شد؛ تخلیه‌ی درخواست‌های در جریان…`, 'Shutdown')
    setTimeout(() => process.exit(1), 9_000).unref()
    const server = app.getHttpServer()
    await Promise.race([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => setTimeout(resolve, 7_000))])
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
  app.useBodyParser('json', { limit: '2mb' })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalFilters(new PgExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : process.env.NODE_ENV !== 'production',
    credentials: true,
  })
  app.getHttpAdapter().getInstance().disable('x-powered-by')

  // آدرس نسبی: پشت gateway صفحه روی /api/integration/docs است و درخواست‌ها به /api/integration/… می‌روند؛
  // مستقیم روی پورت سرویس به /… — بدون نیاز به تنظیم دامنه
  const servers = (process.env.SWAGGER_SERVERS ?? '.').split(',').map((s) => s.trim()).filter(Boolean)
  // متن‌های فارسی راست‌به‌چپ؛ کدها و مسیرها چپ‌به‌راست می‌مانند
  const customCss = `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .description, .swagger-ui .opblock-description-wrapper, .swagger-ui .opblock-summary-description,
    .swagger-ui .parameter__name + .parameter__type ~ div, .swagger-ui .parameters-col_description .renderedMarkdown,
    .swagger-ui .response-col_description .renderedMarkdown, .swagger-ui .opblock-tag small, .swagger-ui .model .description {
      direction: rtl; text-align: right; font-family: Vazirmatn, Tahoma, sans-serif; line-height: 1.9 }
    .swagger-ui .info .description code, .swagger-ui .renderedMarkdown code, .swagger-ui .info pre { direction: ltr; unicode-bidi: isolate }
  `
  const swaggerOpts = {
    customCss,
    swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true, displayRequestDuration: true, filter: true, docExpansion: 'none' },
  }

  const erpCfg = new DocumentBuilder()
    .setTitle('Livo ERP Integration API')
    .setDescription(ERP_DOC)
    .setVersion(API_VERSION)
    .setLicense('Proprietary — Barouco', 'https://barouco.ir')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'کلید API ساخته‌شده در پنل «اتصال ERP»' }, 'erpApiKey')
    .build()
  for (const s of servers) erpCfg.servers = [...(erpCfg.servers ?? []), { url: s }]
  const erpDoc = SwaggerModule.createDocument(app, erpCfg, { include: [ErpApiModule] })
  SwaggerModule.setup('docs', app, erpDoc, { ...swaggerOpts, customSiteTitle: 'Livo — API اتصال ERP', jsonDocumentUrl: 'docs/openapi.json' })

  const adminCfg = new DocumentBuilder()
    .setTitle('Livo ERP Integration — Panel API')
    .setDescription('endpointهای پنل مدیر/حسابدار برای مدیریت کلیدها و مقصدهای ارسال (احراز هویت با JWT کاربر)')
    .setVersion(API_VERSION)
    .addBearerAuth()
    .build()
  for (const s of servers) adminCfg.servers = [...(adminCfg.servers ?? []), { url: s }]
  const adminDoc = SwaggerModule.createDocument(app, adminCfg, { include: [IntegrationAdminModule] })
  SwaggerModule.setup('admin-docs', app, adminDoc, { ...swaggerOpts, customSiteTitle: 'Livo — مدیریت اتصال ERP', jsonDocumentUrl: 'admin-docs/openapi.json' })

  const port = process.env.PORT ?? 3009
  await app.listen(port)
  Logger.log(`integration-service در حال اجرا روی پورت ${port} — مستندات: /docs`, 'Bootstrap')
}
bootstrap()
