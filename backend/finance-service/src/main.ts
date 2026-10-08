import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { PgExceptionFilter } from './common/pg-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // پیوست فاکتور به‌صورت base64 در JSON می‌آید (حداکثر ۳ مگابایت فایل)
  app.useBodyParser('json', { limit: '6mb' })
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

  // توجه: هم انتشار رویداد (EventsService) و هم مصرف رویدادهای reservation.*
  // (ReservationEventsConsumer) هرکدام اتصال amqp-connection-manager مستقل خودشان
  // را در onModuleInit برقرار می‌کنند — نیازی به app.connectMicroservice نیست.

  const port = process.env.PORT ?? 3004
  await app.listen(port)
  Logger.log(`finance-service در حال اجرا روی پورت ${port}`, 'Bootstrap')
}
bootstrap()
