import { join } from 'path'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
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

  // توجه: انتشار رویداد (EventsService) با اتصال amqp-connection-manager مستقل خودش
  // کار می‌کند — نیازی به app.connectMicroservice(Transport.RMQ) نیست.

  // اتصال gRPC (پاسخ‌گویی sync به سرویس‌های دیگر — بخش ۲ سند ARCHITECTURE-SAAS.md)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'property',
      protoPath: join(__dirname, 'proto/property.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT ?? 50052}`,
    },
  })
  await app.startAllMicroservices()

  const port = process.env.PORT ?? 3002
  await app.listen(port)
  Logger.log(`property-service (REST) روی پورت ${port}`, 'Bootstrap')
  Logger.log(`property-service (gRPC) روی پورت ${process.env.GRPC_PORT ?? 50052}`, 'Bootstrap')
}
bootstrap()
