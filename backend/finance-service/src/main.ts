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
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true,
    credentials: true,
  })

  // توجه: هم انتشار رویداد (EventsService) و هم مصرف رویدادهای reservation.*
  // (ReservationEventsConsumer) هرکدام اتصال amqp-connection-manager مستقل خودشان
  // را در onModuleInit برقرار می‌کنند — نیازی به app.connectMicroservice نیست.

  const port = process.env.PORT ?? 3004
  await app.listen(port)
  Logger.log(`finance-service در حال اجرا روی پورت ${port}`, 'Bootstrap')
}
bootstrap()
