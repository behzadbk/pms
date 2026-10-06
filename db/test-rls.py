#!/usr/bin/env python3
"""
تست واقعی ایزوله‌سازی tenant و constraintهای دیتابیس PMS.
اجرا (بعد از migrate.sh --seed):
    APP_DATABASE_URL=postgres://app_user:<pass>@localhost:5432/pms python3 db/test-rls.py
این اسکریپت دقیقاً با نقش app_user وصل می‌شود (نه superuser) و همان الگوی
DatabaseService.withTenant را شبیه‌سازی می‌کند.
"""
import os, sys, psycopg2
from psycopg2 import errors

URL = os.environ.get("APP_DATABASE_URL", "postgres://app_user:testpass@127.0.0.1:5432/pms")
A = "11111111-1111-1111-1111-111111111111"  # برج آفتاب (دارای داده)
B = "11111111-1111-1111-1111-111111111112"  # مجتمع نیلوفر (بدون داده عملیاتی)

conn = psycopg2.connect(URL)
passed, failed = [], []

def check(name, ok, detail=""):
    (passed if ok else failed).append(name)
    print(("✓ " if ok else "✗ ") + name + (f"  — {detail}" if detail else ""))

def with_tenant(tenant, sql, params=None):
    cur = conn.cursor()
    cur.execute("BEGIN")
    cur.execute("SELECT set_config('app.current_tenant_id', %s, true)", (tenant,))
    cur.execute(sql, params)
    rows = cur.fetchall() if cur.description else []
    conn.commit()
    return rows

# ۱) بدون context هیچ ردیفی دیده نشود (fail-closed) و خطا هم ندهد
cur = conn.cursor()
try:
    cur.execute("SELECT count(*) FROM property.units")
    n = cur.fetchone()[0]
    conn.commit()
    check("بدون tenant context صفر ردیف برمی‌گردد (fail-closed)", n == 0, f"count={n}")
except Exception as e:
    conn.rollback()
    check("بدون tenant context صفر ردیف برمی‌گردد (fail-closed)", False, repr(e))

# ۲) با context A داده دیده می‌شود
rows = with_tenant(A, "SELECT count(*) FROM property.units")
check("tenant A واحدهای خودش را می‌بیند", rows[0][0] > 0, f"count={rows[0][0]}")

# ۳) tenant B هیچ‌کدام از داده‌های A را نمی‌بیند
rows = with_tenant(B, "SELECT count(*) FROM property.units")
check("tenant B هیچ نشتی از داده‌های A ندارد", rows[0][0] == 0, f"count={rows[0][0]}")

# ۳ب) همین برای چند اسکیمای دیگر
# مقدار دقیق به حجم seed بستگی دارد؛ فقط «A می‌بیند و B نمی‌بیند» مهم است
for schema_table in ["finance.monthly_charges", "guard.parcels", "fnb.menu_items",
                     "facility.reservations", "residency.memberships"]:
    a = with_tenant(A, f"SELECT count(*) FROM {schema_table}")[0][0]
    b = with_tenant(B, f"SELECT count(*) FROM {schema_table}")[0][0]
    check(f"ایزوله‌سازی {schema_table}", a > 0 and b == 0, f"A={a} B={b}")

# ۴) باگ connection بازیافتی: بعد از COMMIT مقدار GUC به '' برمی‌گردد
cur = conn.cursor()
try:
    cur.execute("SELECT current_setting('app.current_tenant_id', true)")
    val = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM property.units")
    n = cur.fetchone()[0]
    conn.commit()
    check("connection بازیافتی بعد از COMMIT خطای uuid نمی‌دهد", n == 0,
          f"GUC={val!r} count={n}")
except Exception as e:
    conn.rollback()
    check("connection بازیافتی بعد از COMMIT خطای uuid نمی‌دهد", False, repr(e))

# ۵) WITH CHECK: نمی‌توان با context تنانت A ردیفی برای تنانت B ساخت
cur = conn.cursor()
try:
    cur.execute("BEGIN")
    cur.execute("SELECT set_config('app.current_tenant_id', %s, true)", (A,))
    cur.execute("INSERT INTO property.buildings (tenant_id, name) VALUES (%s, 'جعلی')", (B,))
    conn.commit()
    check("جعل tenant_id در INSERT مسدود می‌شود (WITH CHECK)", False, "INSERT موفق شد!")
except errors.CheckViolation as e:
    conn.rollback(); check("جعل tenant_id در INSERT مسدود می‌شود (WITH CHECK)", True)
except Exception as e:
    conn.rollback()
    ok = "row-level security" in str(e).lower() or "policy" in str(e).lower()
    check("جعل tenant_id در INSERT مسدود می‌شود (WITH CHECK)", ok, str(e).strip().splitlines()[0])

# ۶) INSERT مجاز برای تنانت خودش کار می‌کند و بعد پاک می‌شود
cur = conn.cursor()
cur.execute("BEGIN")
cur.execute("SELECT set_config('app.current_tenant_id', %s, true)", (A,))
cur.execute("INSERT INTO property.buildings (tenant_id, name) VALUES (%s, 'بلوک تست') RETURNING id", (A,))
new_id = cur.fetchone()[0]
cur.execute("DELETE FROM property.buildings WHERE id = %s", (new_id,))
conn.commit()
check("INSERT برای تنانت خودی مجاز است", True)

# ۷) EXCLUDE constraint: رزرو هم‌پوشان رد شود
cur = conn.cursor()
try:
    cur.execute("BEGIN")
    cur.execute("SELECT set_config('app.current_tenant_id', %s, true)", (A,))
    cur.execute("""INSERT INTO facility.reservations
        (tenant_id, amenity_id, unit_id, requested_by, start_at, end_at, status)
        SELECT tenant_id, amenity_id, unit_id, requested_by,
               start_at + interval '30 minutes', end_at + interval '30 minutes', 'confirmed'
          FROM facility.reservations LIMIT 1""")
    conn.commit()
    check("رزرو هم‌پوشان روی همان امکانات رد می‌شود", False, "INSERT موفق شد!")
except errors.ExclusionViolation:
    conn.rollback(); check("رزرو هم‌پوشان روی همان امکانات رد می‌شود", True)
except Exception as e:
    conn.rollback(); check("رزرو هم‌پوشان روی همان امکانات رد می‌شود", False, repr(e))

# ۸) app_user نباید بتواند ساختار عوض کند
cur = conn.cursor()
try:
    cur.execute("CREATE TABLE property.hack (x int)")
    conn.commit(); check("app_user اجازه DDL ندارد", False, "CREATE TABLE موفق شد!")
except Exception:
    conn.rollback(); check("app_user اجازه DDL ندارد", True)

# ۹) app_user نباید بتواند RLS را خاموش کند
cur = conn.cursor()
try:
    cur.execute("ALTER TABLE property.units DISABLE ROW LEVEL SECURITY")
    conn.commit(); check("app_user نمی‌تواند RLS را خاموش کند", False, "ALTER موفق شد!")
except Exception:
    conn.rollback(); check("app_user نمی‌تواند RLS را خاموش کند", True)

# ۱۰) داده‌های لاگین seed
cur = conn.cursor()
cur.execute("SELECT count(*) FROM identity.platform_admins WHERE username IN ('behzad','amir')")
n = cur.fetchone()[0]; conn.commit()
check("دو کاربر سوپرادمین seed شده‌اند", n == 2, f"count={n}")

cur = conn.cursor()
cur.execute("SELECT count(*) FROM identity.tenants")
n = cur.fetchone()[0]; conn.commit()
check("جدول tenants بدون RLS برای جستجوی subdomain در لاگین", n >= 2, f"count={n}")

rows = with_tenant(A, "SELECT role FROM identity.users ORDER BY role")
check("کاربران نقش‌دار tenant A (admin/guard/resident/staff حاضرند)",
      {'admin','guard','resident','staff'} <= {r[0] for r in rows},
      str([r[0] for r in rows]))

# ۱۱) پارتیشن ماه بعدِ audit موجود باشد
cur = conn.cursor()
cur.execute("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='audit' AND c.relkind='r' AND c.relispartition""")
n = cur.fetchone()[0]; conn.commit()
check("پارتیشن‌های ماهانه audit ساخته شده‌اند (≥۴)", n >= 4, f"count={n}")

# ۱۲) کاتالوگ: هر جدول دارای tenant_id (همه‌ی اسکیماها از جمله residency) باید
#     ENABLE+FORCE RLS و policy دارای WITH CHECK مبتنی بر platform.current_tenant_id() داشته باشد
SCHEMAS = ('identity','property','residency','facility','finance','guard','notification','audit','fnb')
ALLOW = {('identity', 'platform_invoices')}  # آگاهانه بدون RLS: پنل سوپرادمین
cur = conn.cursor()
cur.execute("""
  SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
         EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polpermissive
                   AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%%platform.current_tenant_id()%%')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = ANY(%s) AND c.relkind IN ('r','p') AND NOT c.relispartition
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                  AND a.attname = 'tenant_id' AND NOT a.attisdropped)""", (list(SCHEMAS),))
tenant_tables = [r for r in cur.fetchall() if (r[0], r[1]) not in ALLOW]
conn.commit()
bad = [f"{r[0]}.{r[1]}" for r in tenant_tables if not (r[2] and r[3] and r[4])]
check(f"همه‌ی {len(tenant_tables)} جدول tenant‌دار RLS+FORCE+WITH CHECK دارند", not bad, ", ".join(bad))
check("اسکیمای residency در کاتالوگ پوشش داده شده", any(r[0] == 'residency' for r in tenant_tables))

cur = conn.cursor()
cur.execute("SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user")
check("app_user نه BYPASSRLS است نه SUPERUSER", cur.fetchone()[0] is False); conn.commit()

# ۱۳) residency: ایزوله‌سازی و جعل tenant_id
src = with_tenant(A, "SELECT user_id, unit_id, role, residency FROM residency.memberships LIMIT 1")
if not src:
    check("residency: ردیف نمونه‌ی tenant A برای تست جعل وجود دارد (seed)", False)
else:
    cur = conn.cursor()
    cur.execute("BEGIN"); cur.execute("SELECT set_config('app.current_tenant_id', %s, true)", (B,))
    try:
        cur.execute("""INSERT INTO residency.memberships (tenant_id, user_id, unit_id, role, residency)
                       VALUES (%s, %s, %s, %s, %s)""", (A, *src[0]))
        conn.rollback(); check("residency: جعل tenant_id در INSERT مسدود می‌شود", False, "INSERT موفق شد!")
    except errors.InsufficientPrivilege as e:
        conn.rollback(); check("residency: جعل tenant_id در INSERT مسدود می‌شود", True, str(e).splitlines()[0])
    except Exception as e:
        conn.rollback(); check("residency: جعل tenant_id در INSERT مسدود می‌شود", False, repr(e))
cur = conn.cursor()
cur.execute("SELECT count(*) FROM residency.building_rules"); n = cur.fetchone()[0]; conn.commit()
check("residency: بدون tenant context صفر ردیف (fail-closed)", n == 0, f"count={n}")

print("\n" + "="*60)
print(f"نتیجه: {len(passed)} قبول / {len(failed)} رد")
if failed:
    print("ردشده‌ها: " + "، ".join(failed)); sys.exit(1)
