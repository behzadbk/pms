import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { PgExceptionFilter } from './common/pg-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // خاموشی تمیز روی SIGTERM/SIGINT (هر دیپلوی یا ری‌استارت docker):
  // ۱) دیگر اتصال جدید نپذیر و صبر کن درخواست‌های در جریان تمام شوند؛ ۲) بعد app.close() (بستن pool دیتابیس و صف‌ها).
  // نکته: enableShutdownHooks()ِ Nest اول onModuleDestroy (pool.end) را اجرا می‌کند و بعد سرور را می‌بندد؛
  // درخواست‌های در جریان با «Cannot use a pool after calling end» شکست می‌خوردند، پس ترتیب را خودمان تعیین می‌کنیم.
  // docker stop بعد از ۱۰ ثانیه SIGKILL می‌زند، پس سقف تخلیه ۷ ثانیه و خروج اجباری ۹ ثانیه است.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    Logger.log(
      `${signal} دریافت شد؛ تخلیه‌ی درخواست‌های در جریان…`,
      'Shutdown',
    );
    setTimeout(() => process.exit(1), 9_000).unref();
    const server = app.getHttpServer();
    await Promise.race([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 7_000)),
    ]);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // خطاهای ورودی نامعتبر دیتابیس (UUID/تاریخ غلط، تکراری، …) → 4xx به‌جای 500
  app.useGlobalFilters(
    new PgExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  // مبدأ فرانت‌اند از CORS_ORIGIN (چند مقدار با کاما) — در dev اگر ست نشود همه مبداها مجازند
  // CORS fail-closed: در production بدون CORS_ORIGIN هیچ مبدأ cross-origin مجاز نیست (قبلاً «همه‌ی مبدأها + credentials»
  // بود). در توسعه همه مجازند.
  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : process.env.NODE_ENV !== 'production',
    credentials: true,
  });
  // هدر X-Powered-By نسخه/فریم‌ورک را لو می‌دهد و فایده‌ای ندارد
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // توجه: انتشار رویداد (EventsService) با اتصال amqp-connection-manager مستقل خودش
  // کار می‌کند — نیازی به app.connectMicroservice(Transport.RMQ) نیست.
  // اتصال به property-service هم از طریق gRPC Client (property-client/) است، نه اینجا.

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  Logger.log(`facility-service در حال اجرا روی پورت ${port}`, 'Bootstrap');
}
bootstrap();
