import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { PgExceptionFilter } from './common/pg-exception.filter'

async function bootstrap() {
  // عکس آیتم‌های منو (data URL کوچک‌شده) در بدنه‌ی JSON می‌آید؛ سقف پیش‌فرض ۱۰۰KB کافی نیست
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
  app.useBodyParser('json', { limit: '1mb' })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  // خطاهای ورودی نامعتبر دیتابیس (UUID/تاریخ غلط، تکراری، …) → 4xx به‌جای 500
  app.useGlobalFilters(new PgExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
  // مبدأ فرانت‌اند از CORS_ORIGIN (چند مقدار با کاما) — در dev اگر ست نشود همه مبداها مجازند
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true,
    credentials: true,
  })

  const port = process.env.PORT ?? 3008
  await app.listen(port)
  Logger.log(`fnb-service در حال اجرا روی پورت ${port}`, 'Bootstrap')
}
bootstrap()
