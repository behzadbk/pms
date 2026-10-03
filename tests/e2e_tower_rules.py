#!/usr/bin/env python3
"""
تست API: ساخت واحد، افزودن/ویرایش/حذف ساکن، و «قوانین برج» (محدودیت واحد بدهکار).

پیش‌نیاز: دیتابیس تازه با داده‌ی نمونه (cd db && ./migrate.sh --reset) و اجرای identity (۳۰۰۱)،
facility (۳۰۰۳)، guard (۳۰۰۵) و fnb (۳۰۰۸) — tests/run-all-services.sh.
DATABASE_URL با نقش superuser برای ساخت/تسویه‌ی شارژ آزمایشی لازم است.

اجرا:  DATABASE_URL=postgres://postgres:postgres@localhost:5432/pms python3 tests/e2e_tower_rules.py
"""
import json, os, subprocess, sys, uuid, urllib.request, urllib.error, datetime as dt

H = os.environ.get("HOST", "http://localhost")
P = dict(identity=3001, facility=3003, guard=3005, fnb=3008)
DB = os.environ.get("DATABASE_URL", "postgres://postgres@localhost:5432/pms")
T = "borj-aftab"
TENANT = "11111111-1111-1111-1111-111111111111"
UNIT_1204 = "bbbbbbbb-0000-0000-0000-000000001204"
POOL, GYM = "dddddddd-0000-0000-0000-000000000004", "dddddddd-0000-0000-0000-000000000001"
results = []


def call(svc, method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{H}:{P[svc]}{path}", method=method, data=data)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t


def sql(q):
    return subprocess.run(["psql", DB, "-tAX", "-c", q], capture_output=True, text=True, check=True).stdout.strip()


def check(group, name, ok, detail=""):
    results.append((group, name, bool(ok)))
    print(("✓" if ok else "✗"), f"[{group}] {name}", "" if ok else f"  → {str(detail)[:500]}")


def login(ident, pw="Passw0rd!"):
    s, b = call("identity", "POST", "/auth/login", {"email": ident, "password": pw, "tenantSubdomain": T})
    return (b or {}).get("accessToken") if s in (200, 201) else None


PH = ["0935" + str(uuid.uuid4().int)[:7] for _ in range(3)]  # شماره‌ی تازه در هر اجرا
admin = login("admin@borj-aftab.test")
reza = login("resident@borj-aftab.test")
s, b = call("identity", "POST", "/auth/platform-login", {"username": "behzad", "password": "1234"})
sa = (b or {}).get("accessToken")
check("auth", "ورود مدیر، ساکن و سوپرادمین", all([admin, reza, sa]))

# ═══════════════ ۱) ساختمان تازه: بدون واحد → ساخت واحد ═══════════════
sub = "t" + uuid.uuid4().hex[:8]
s, b = call("identity", "POST", "/platform/buildings", {"name": "برج آزمایشی", "subdomain": sub, "tier": "professional", "unitCount": 12, "floorCount": 3}, token=sa)
bid = (b or {}).get("id") if isinstance(b, dict) else None
if not bid and isinstance(b, dict):
    bid = (b.get("building") or {}).get("id")
check("units", "ساختمان تازه ساخته شد", s in (200, 201) and bid, (s, b))
if not bid:
    sys.exit(1)
s, b = call("identity", "GET", f"/buildings/{bid}/units", token=sa)
check("units", "ساختمان تازه هیچ واحدی ندارد", s == 200 and b["counts"]["all"] == 0, (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units/bulk", {"floors": 3, "units_per_floor": 4}, token=sa)
check("units", "ساخت گروهی ۳ طبقه × ۴ واحد = ۱۲", s == 200 and b["created"] == 12 and b["skipped"] == 0, (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units/bulk", {"floors": 3, "units_per_floor": 4}, token=sa)
check("units", "ساخت دوباره تکراری‌ها را رد می‌کند (idempotent)", s == 200 and b["created"] == 0 and b["skipped"] == 12, (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units/bulk", {"floors": 0, "units_per_floor": 4}, token=sa)
check("units", "طبقه‌ی صفر → ۴۰۰", s == 400, (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units/bulk", {"floors": 80, "units_per_floor": 30}, token=sa)
check("units", "بیش از ۵۰۰ واحد در یک بار → ۴۰۰", s == 400, (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units", {"unit_number": "۹۹۹", "floor": 9}, token=sa)
extra = (b or {}).get("id") if isinstance(b, dict) else None
check("units", "افزودن تکی واحد (رقم فارسی → 999)", s in (200, 201) and b["no"] == "999", (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units", {"unit_number": "101"}, token=sa)
check("units", "شماره‌ی تکراری → ۴۰۹", s == 409, (s, b))
s, b = call("identity", "PATCH", f"/units/{extra}?building_id={bid}", {"unit_number": "998", "area": 85, "parking_count": 1}, token=sa)
check("units", "ویرایش مشخصات واحد", s == 200 and b["no"] == "998", (s, b))
s, b = call("identity", "GET", f"/units/{extra}?building_id={bid}", token=sa)
check("units", "مساحت و پارکینگ ذخیره شد", s == 200 and b["area"] == 85 and b["parking_count"] == 1, (s, b))
s, b = call("identity", "DELETE", f"/units/{extra}?building_id={bid}", token=sa)
check("units", "حذف واحد خالی و بی‌سابقه", s == 200, (s, b))
s, b = call("identity", "GET", f"/buildings/{bid}/units", token=sa)
check("units", "فهرست: ۱۲ واحد خالی", s == 200 and b["counts"]["all"] == 12 and b["counts"]["vacant"] == 12, (s, b["counts"] if isinstance(b, dict) else b))
u101 = next(u["id"] for u in b["units"] if u["no"] == "101")
s, b = call("identity", "POST", f"/buildings/{TENANT}/units", {"unit_number": "888"}, token=reza)
check("units", "ساکن نمی‌تواند واحد بسازد → ۴۰۳", s == 403, (s, b))
s, b = call("identity", "POST", f"/buildings/{bid}/units", {"unit_number": "888"}, token=admin)
check("units", "مدیر ساختمان دیگر به ساختمان دیگران دست نمی‌زند → ۴۰۳", s == 403, (s, b))

# ═══════════════ ۲) ساکن: افزودن، ویرایش، حذف ═══════════════
s, b = call("identity", "POST", f"/units/{u101}/residents?building_id={bid}", {"name": "علی احمدی", "phone": PH[0], "residency": "tenant", "send_sms": False}, token=sa)
head_m = (b or {}).get("membership_id") if isinstance(b, dict) else None
check("residents", "سوپرادمین ساکن (سرپرست) ثبت می‌کند", s in (200, 201) and b["role"] == "head", (s, b))
s, b = call("identity", "POST", f"/units/{u101}/residents?building_id={bid}", {"name": "سارا احمدی", "phone": PH[1], "residency": "tenant", "send_sms": False, "role": "adult"}, token=sa)
adult_m = (b or {}).get("membership_id") if isinstance(b, dict) else None
check("residents", "عضو دوم (بزرگسال)", s in (200, 201) and b["role"] == "adult", (s, b))
s, b = call("identity", "PATCH", f"/memberships/{adult_m}?building_id={bid}", {"name": "سارا احمدی‌نژاد", "phone": PH[2]}, token=sa)
check("residents", "ویرایش نام و موبایل", s == 200 and any(m["name"] == "سارا احمدی‌نژاد" for m in b["members"]), (s, b))
s, b = call("identity", "DELETE", f"/memberships/{head_m}?building_id={bid}", token=sa)
check("residents", "حذف سرپرستی که عضو دیگر دارد → ۴۰۹ با پیام روشن", s == 409 and "سرپرست" in json.dumps(b, ensure_ascii=False), (s, b))
s, b = call("identity", "DELETE", f"/memberships/{adult_m}?building_id={bid}", token=sa)
check("residents", "حذف عضو بزرگسال", s == 200 and not any(m["id"] == adult_m and m["status"] != "ended" for m in b["members"]) and b["resident_count"] == 1, (s, b))
s, b = call("identity", "DELETE", f"/memberships/{adult_m}?building_id={bid}", token=sa)
check("residents", "حذف دوباره → ۴۰۴", s == 404, (s, b))
s, b = call("identity", "DELETE", f"/memberships/{head_m}?building_id={bid}", token=sa)
check("residents", "حذف آخرین ساکن (سرپرست تنها)", s == 200 and b["resident_count"] == 0 and b["occupancy"] == "vacant", (s, b))
s, b = call("identity", "GET", f"/buildings/{bid}/units", token=sa)
check("residents", "واحد دوباره «خالی» شد", s == 200 and b["counts"]["vacant"] == 12, b["counts"] if isinstance(b, dict) else b)
s, b = call("identity", "DELETE", f"/units/{u101}?building_id={bid}", token=sa)
check("units", "واحدِ دارای سابقه‌ی ساکن حذف نمی‌شود → ۴۰۹", s == 409, (s, b))
check("audit", "حذف ساکن در ممیزی ثبت شد", int(sql(f"select count(*) from audit.event_logs where tenant_id='{bid}' and action='membership.removed'") or 0) == 2)

# ═══════════════ ۳) قوانین برج ═══════════════
s, b = call("identity", "GET", f"/buildings/{TENANT}/rules", token=admin)
check("rules", "خواندن پیش‌فرض: مهلت ۳۰ روز و بدون محدودیت", s == 200 and b["debtor_grace_days"] == 30 and b["restrictions"] == {}, (s, b))
check("rules", "سه بخش قابل‌محدودسازی + مشاعات ساختمان", [m["key"] for m in b["modules"]] == ["module:food", "module:guest", "module:amenity"] and len(b["amenities"]) >= 4, b)
s, b = call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 10, "restrictions": {"module:finance": True}}, token=admin)
check("rules", "بخش مالی قابل محدودسازی نیست → ۴۰۰", s == 400, (s, b))
s, b = call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 10, "restrictions": {"amenity:" + str(uuid.uuid4()): True}}, token=admin)
check("rules", "مشاعِ ناشناس → ۴۰۰", s == 400, (s, b))
s, b = call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 400, "restrictions": {}}, token=admin)
check("rules", "مهلت بیش از ۳۶۵ روز → ۴۰۰", s == 400, (s, b))
s, b = call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 10, "restrictions": {"amenity:" + POOL: True, "module:food": True, "module:guest": True}}, token=reza)
check("rules", "ساکن نمی‌تواند قوانین را عوض کند → ۴۰۳", s == 403, (s, b))
s, b = call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 10, "restrictions": {"amenity:" + POOL: True, "module:food": True, "module:guest": True, "module:amenity": False}}, token=admin)
check("rules", "ذخیره: استخر + غذا + مهمان، مهلت ۱۰ روز", s == 200 and b["debtor_grace_days"] == 10 and set(b["restrictions"]) == {"amenity:" + POOL, "module:food", "module:guest"}, (s, b))

# ═══════════════ ۴) اعمال محدودیت روی واحد بدهکار ═══════════════
tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
sql(f"delete from finance.monthly_charges where unit_id='{UNIT_1204}'")
sql(f"delete from facility.reservations where unit_id='{UNIT_1204}' and start_at >= '{tomorrow}'::date")  # تست دوباره‌اجرا شود
s, b = call("facility", "GET", f"/amenities/{POOL}/slots?date={tomorrow}", token=reza)
check("debtor", "بدون بدهی: استخر قفل نیست", s == 200 and b["lock"] is None, (s, b))
# بدهی ۵ روزه، مهلت ۱۰ روز → هنوز بدهکار حساب نمی‌شود
sql(f"insert into finance.monthly_charges (tenant_id, unit_id, period, base_amount, total_amount, due_date, status) values ('{TENANT}','{UNIT_1204}','2099-01',1000000,1000000,(now() at time zone 'Asia/Tehran')::date - 5,'overdue')")
s, b = call("identity", "GET", "/me/permissions", token=reza)
check("debtor", "۵ روز تأخیر < مهلت ۱۰ روز: قفلی نیست", s == 200 and b["modules"]["food"] == "free" and b["debtor"] is None, (s, b))
# مهلت ۳ روز → بدهکار
s, b = call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 3, "restrictions": {"amenity:" + POOL: True, "module:food": True, "module:guest": True}}, token=admin)
check("debtor", "پیش‌نمایش مدیر: ۱ واحد بدهکار", s == 200 and b["debtor_units_now"] >= 1, (s, b))
s, b = call("identity", "GET", "/me/permissions", token=reza)
check("debtor", "غذا و مهمان «locked»، مالی و اضطراری باز", s == 200 and b["modules"]["food"] == "locked" and b["modules"]["guest"] == "locked" and b["modules"]["finance"] == "free" and b["modules"]["emergency"] == "free" and b["modules"]["ticket"] == "free", (s, b.get("modules") if isinstance(b, dict) else b))
check("debtor", "مبلغ و روز تأخیر برای صفحه‌ی قفل", b["debtor"]["overdue_days"] == 5 and b["debtor"]["amount"] == 1000000 and POOL in b["locked_amenities"], b.get("debtor"))
s, b = call("facility", "GET", "/amenities", token=reza)
by = {a["id"]: a for a in b}
check("debtor", "فهرست مشاعات: استخر locked، باشگاه نه", by[POOL]["locked"] is True and by[GYM]["locked"] is False, (by[POOL].get("locked"), by[GYM].get("locked")))
s, b = call("facility", "GET", f"/amenities/{POOL}/slots?date={tomorrow}", token=reza)
check("debtor", "ساعت‌های استخر همراه پیام قفل", s == 200 and b["lock"] and b["lock"]["code"] == "debtor_restricted", (s, b.get("lock") if isinstance(b, dict) else b))
start = next(x["start"] for x in b["slots"] if x["hour"] == 17)
s, b = call("facility", "POST", "/reservations", {"amenity_id": POOL, "start": start}, token=reza)
check("debtor", "رزرو استخر برای واحد بدهکار → ۴۰۳ debtor_restricted", s == 403 and b.get("code") == "debtor_restricted", (s, b))
s, b = call("facility", "GET", f"/amenities/{GYM}/slots?date={tomorrow}", token=reza)
gstart = next(x["start"] for x in b["slots"] if x["status"] == "free")
s, b = call("facility", "POST", "/reservations", {"amenity_id": GYM, "start": gstart}, token=reza)
check("debtor", "مشاعِ محدودنشده (باشگاه) همچنان رزرو می‌شود", s in (200, 201), (s, b))
s, b = call("facility", "POST", "/reservations", {"amenity_id": POOL, "start": start, "unit_id": UNIT_1204}, token=admin)
check("debtor", "ثبت دستی مدیر از قفل مستثناست", s in (200, 201), (s, b))
s, b = call("guard", "POST", f"/units/{UNIT_1204}/guest-passes", {"guestName": "مهمان", "validUntil": (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=5)).isoformat() + "Z"}, token=reza)
check("debtor", "کارت مهمان برای واحد بدهکار → ۴۰۳", s == 403 and b.get("code") == "debtor_restricted", (s, b))
s, b = call("fnb", "POST", "/fnb/orders", {"venueId": str(uuid.uuid4()), "unitId": UNIT_1204, "deliveryType": "in_unit", "items": [{"itemId": str(uuid.uuid4()), "quantity": 1}]}, token=reza)
check("debtor", "سفارش غذا برای واحد بدهکار → ۴۰۳", s == 403 and b.get("code") == "debtor_restricted", (s, b))
# تسویه → بسته‌ها باز می‌شود
sql(f"update finance.monthly_charges set status='paid' where unit_id='{UNIT_1204}'")
s, b = call("identity", "GET", "/me/permissions", token=reza)
check("debtor", "بعد از تسویه همه‌چیز باز است", s == 200 and b["modules"]["food"] == "free" and b["debtor"] is None and b["locked_amenities"] == [], (s, b.get("modules") if isinstance(b, dict) else b))
s, b = call("guard", "POST", f"/units/{UNIT_1204}/guest-passes", {"guestName": "مهمان", "validUntil": (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=5)).isoformat() + "Z"}, token=reza)
check("debtor", "بعد از تسویه کارت مهمان صادر می‌شود", s in (200, 201), (s, b))
# پاکسازی
sql(f"delete from finance.monthly_charges where unit_id='{UNIT_1204}' and period='2099-01'")
call("identity", "PUT", f"/buildings/{TENANT}/rules", {"debtor_grace_days": 30, "restrictions": {}}, token=admin)

ok = sum(1 for r in results if r[2])
print(f"\n{ok}/{len(results)} سناریو سبز")
sys.exit(0 if ok == len(results) else 1)
