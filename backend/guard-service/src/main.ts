import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { AppModule } from './app.module'
import { PgExceptionFilter } from './common/pg-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  // خطاهای ورودی نامعتبر دیتابیس (UUID/تاریخ غلط، تکراری، …) → 4xx به‌جای 500
  app.useGlobalFilters(new PgExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
  // مبدأ فرانت‌اند از CORS_ORIGIN (چند مقدار با کاما) — در dev اگر ست نشود همه مبداها مجازند
  // CORS fail-closed: در production بدون CORS_ORIGIN هیچ مبدأ cross-origin مجاز نیست (قبلاً «همه‌ی مبدأها + credentials»
  // بود). در توسعه همه مجازند.
  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : process.env.NODE_ENV !== 'production',
    credentials: true,
  })
  // هدر X-Powered-By نسخه/فریم‌ورک را لو می‌دهد و فایده‌ای ندارد
  app.getHttpAdapter().getInstance().disable('x-powered-by')

  // توجه: انتشار رویداد (EventsService) با اتصال amqp-connection-manager مستقل خودش
  // کار می‌کند. اتصال WebSocket زنده (GuardGateway) هم به‌صورت جدا توسط Nest
  // roomی مدیریت می‌شود — هیچ‌کدام نیازی به app.connectMicroservice(RMQ) ندارند.

  const port = process.env.PORT ?? 3005
  await app.listen(port)
  Logger.log(`guard-service در حال اجرا روی پورت ${port}`, 'Bootstrap')
}
bootstrap()
