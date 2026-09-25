-- ۰۰۳ — نقش «حسابداری» (accountant)
-- شارژ و مطالبات + ثبت فاکتور از پنل مدیر ساختمان جدا شد و به نقش حسابدار سپرده شد؛
-- مدیر ساختمان فقط گزارش مالی را می‌بیند. (finance-service: POST /charges/generate-monthly → @Roles('accountant'))
-- idempotent: اجرای دوباره مشکلی ایجاد نمی‌کند.

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE identity.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'resident', 'guard', 'staff', 'accountant'));
