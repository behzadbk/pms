/**
 * کلید JWT — در یک نقطه و به‌صورت lazy خوانده می‌شود.
 *
 * چرا این فایل لازم است:
 *  ۱) JwtModule.register(...) هنگام import شدن auth.module اجرا می‌شود؛ یعنی *قبل* از این‌که
 *     ConfigModule.forRoot فایل .env را بخواند. نتیجه: امضا با 'dev-only-secret' و اعتبارسنجی
 *     با JWT_SECRET واقعی → همه‌ی درخواست‌ها 401. به همین دلیل JwtModule با registerAsync و
 *     این تابع (در زمان DI، بعد از بارگذاری .env) پیکربندی می‌شود.
 *  ۲) مقدار خالی (JWT_PUBLIC_KEY= در .env.example) با ?? رد نمی‌شد و سرویس هنگام boot کرش می‌کرد.
 *  ۳) در production نبودن کلید باید سرویس را متوقف کند، نه این‌که بی‌صدا از یک کلید عمومی
 *     قابل‌حدس استفاده کند (در آن حالت هر کسی می‌توانست توکن super_admin جعل کند).
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_PUBLIC_KEY || process.env.JWT_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET تنظیم نشده است — سرویس در production بدون کلید اجرا نمی‌شود')
  }
  return 'dev-only-secret'
}

/** نوع توکن — refreshToken هرگز نباید به‌جای accessToken پذیرفته شود (و برعکس) */
export type TokenType = 'access' | 'refresh'
