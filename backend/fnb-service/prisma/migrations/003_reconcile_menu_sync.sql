-- ============================================================================
-- fnb-service 003 — یکی‌کردن مدل «منوی هم‌گام» (002_menu_sync) با «مدیریت مجموعه‌ها» (002_venue_management)
-- ----------------------------------------------------------------------------
-- هر دو مایگریشن ستون kind روی venues را اضافه می‌کردند؛ منوی هم‌گام دسته را متن ساده روی آیتم نگه می‌داشت
-- و فقط یک مجموعه از هر نوع مجاز بود. مدل نهایی: kind ناتهی با پیش‌فرض، چند مجموعه از یک نوع، و
-- دسته‌ها در fnb.menu_categories. روی دیتابیسی که منوی هم‌گام را اجرا کرده، آیتم‌های موجود به دسته‌ی
-- واقعی منتقل می‌شوند و داده‌ای از دست نمی‌رود. idempotent.
-- ============================================================================

UPDATE fnb.venues SET kind = CASE WHEN name ~ 'کافه|کافی|cafe|coffee' THEN 'cafe' ELSE 'restaurant' END WHERE kind IS NULL;
ALTER TABLE fnb.venues ALTER COLUMN kind SET DEFAULT 'restaurant';
ALTER TABLE fnb.venues ALTER COLUMN kind SET NOT NULL;

-- ایندکس یکتای (tenant_id, kind) فقط برای مدل قدیمی «یک رستوران + یک کافه» بود
DROP INDEX IF EXISTS fnb.uq_fnb_venues_tenant_kind;

-- دسته‌ی متنی آیتم‌های منوی هم‌گام → سطرهای menu_categories
INSERT INTO fnb.menu_categories (tenant_id, venue_id, name)
SELECT DISTINCT i.tenant_id, i.venue_id, i.category
  FROM fnb.menu_items i
 WHERE i.category_id IS NULL AND i.venue_id IS NOT NULL AND i.category IS NOT NULL AND i.category <> ''
ON CONFLICT (venue_id, name) DO NOTHING;

UPDATE fnb.menu_items i
   SET category_id = c.id
  FROM fnb.menu_categories c
 WHERE i.category_id IS NULL AND c.venue_id = i.venue_id AND c.name = i.category;
