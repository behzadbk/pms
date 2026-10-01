#!/usr/bin/env python3
"""
تست API ماژول ساکنین، خانوار، حالت والدین و رزرو مشاعات (RESIDENTS.md).

پیش‌نیاز: دیتابیس تازه با داده‌ی نمونه (cd db && ./migrate.sh --reset) و اجرای
identity-service روی ۳۰۰۱ و facility-service روی ۳۰۰۳ (tests/run-all-services.sh) —
identity با RESIDENTS_HOUSEKEEPING_THROTTLE_MS=0 تا کارهای زمان‌دار (پایان دسترسی پرستار) فوراً اجرا شوند.
DATABASE_URL (نقش superuser) برای خواندن توکن دعوت و بررسی audit_log لازم است —
توکن دعوت عمداً در پاسخ API به مدیر برنمی‌گردد و فقط پیامک می‌شود.

اجرا:  DATABASE_URL=postgres://postgres@localhost:5432/pms python3 tests/e2e_residents.py
"""
import json, os, subprocess, sys, uuid, urllib.request, urllib.error, datetime as dt

H = os.environ.get("HOST", "http://localhost")
P = dict(identity=3001, facility=3003)
DB = os.environ.get("DATABASE_URL", "postgres://postgres@localhost:5432/pms")
T = "borj-aftab"
TENANT = "11111111-1111-1111-1111-111111111111"
U = {n: f"bbbbbbbb-0000-0000-0000-00000000{n.zfill(4)}" for n in ["1204", "1203", "1202", "1104", "1103", "1102", "0803"]}
M = dict(reza="91000000-0000-0000-0000-000000000001", mina="91000000-0000-0000-0000-000000000002",
         sara="91000000-0000-0000-0000-000000000003", arian="91000000-0000-0000-0000-000000000004",
         maryam="91000000-0000-0000-0000-000000000005", leila="91000000-0000-0000-0000-000000000021",
         bahram="91000000-0000-0000-0000-000000000022", negar="91000000-0000-0000-0000-000000000023")
REZA = "90000000-0000-0000-0000-000000000001"
POOL, GYM = "dddddddd-0000-0000-0000-000000000004", "dddddddd-0000-0000-0000-000000000001"
results = []


def call(svc, method, path, body=None, token=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(f"{H}:{P[svc]}{path}", method=method, data=data)
    req.add_header("content-type", ctype)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read()
            try:
                return r.status, json.loads(t) if t else None
            except Exception:
                return r.status, t
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
    print(("✓" if ok else "✗"), f"[{group}] {name}", "" if ok else f"  → {str(detail)[:400]}")


def login(ident, pw="Passw0rd!"):
    s, b = call("identity", "POST", "/auth/login", {"email": ident, "password": pw, "tenantSubdomain": T})
    return (b or {}).get("accessToken") if s in (200, 201) else None, s, b


def unit(units_resp, no):
    return next((u for u in units_resp["units"] if u["no"] == no), None)


def multipart(field, filename, content, ctype):
    boundary = "----pms" + uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


admin, _, _ = login("admin@borj-aftab.test")
reza, _, _ = login("resident@borj-aftab.test")
desk, _, _ = login("amenity")
kitchen, _, _ = login("kitchen")
s, b = call("identity", "POST", "/auth/platform-login", {"username": "behzad", "password": "1234"})
sa = b.get("accessToken")
check("auth", "ورود مدیر، ساکن (رضا کریمی)، مسئول مشاعات و سوپرادمین", all([admin, reza, desk, sa]))

# ═══════════════ ۱) فهرست ساکنین و محدوده‌ی مدیر ═══════════════
s, b = call("identity", "GET", f"/buildings/{TENANT}/units", token=admin)
check("list", "فهرست واحدها با شمارش فیلترها", s == 200 and b["counts"]["all"] >= 10 and {"owner", "tenant", "pending", "vacant"} <= set(b["counts"]), (s, b))
check("list", "۱۲۰۴: «مستأجر · ۵ نفر» + «کودک ۲»", unit(b, "1204") and unit(b, "1204")["meta"] == "مستأجر · ۵ نفر" and any(x["t"] == "کودک ۲" for x in unit(b, "1204")["badges"]), unit(b, "1204"))
check("list", "۱۱۰۴: در انتظار (QR لابی)", unit(b, "1104") and unit(b, "1104")["category"] == "pending" and unit(b, "1104")["badges"][0]["t"] == "در انتظار تأیید", unit(b, "1104"))
check("list", "۱۱۰۳: «پایان قرارداد تا ۲۰ روز»", any(x["t"] == "پایان قرارداد تا ۲۰ روز" for x in unit(b, "1103")["badges"]), unit(b, "1103"))
s, b = call("identity", "GET", f"/buildings/{TENANT}/units?filter=vacant", token=admin)
check("list", "فیلتر «خالی»", s == 200 and all(u["category"] == "vacant" for u in b["units"]) and unit(b, "203") is not None and unit(b, "1202") is None, b)
s, b = call("identity", "GET", f"/buildings/{TENANT}/units?filter=pending", token=admin)
check("list", "فیلتر «در انتظار»: واحد خالی با درخواست QR", s == 200 and {u["no"] for u in b["units"]} == {"1104", "1202"}, [u["no"] for u in b["units"]])
s, b = call("identity", "GET", f"/buildings/{TENANT}/units?q=%D9%85%DB%8C%D9%86%D8%A7", token=admin)  # «مینا»
check("list", "جست‌وجوی نام عضو (نه فقط سرپرست)", s == 200 and [u["no"] for u in b["units"]] == ["1204"], b)
s, b = call("identity", "GET", f"/buildings/{TENANT}/units", token=reza)
check("scope", "ساکن → ۴۰۳", s == 403, s)

# ساختمان دوم با مدیر خودش — مدیر فقط ساختمان خودش را می‌بیند
sub = "t" + uuid.uuid4().hex[:8]
s, b = call("identity", "POST", "/platform/buildings", {"name": "برج تست ساکنین", "subdomain": sub, "tier": "professional", "unitCount": 10,
                                                      "adminEmail": f"admin@{sub}.test", "adminPassword": "Str0ngPass!"}, token=sa)
other_bid = b.get("id")
s, b = call("identity", "POST", "/auth/login", {"email": f"admin@{sub}.test", "password": "Str0ngPass!", "tenantSubdomain": sub})
other_admin = b.get("accessToken")
s, b = call("identity", "GET", f"/buildings/{TENANT}/units", token=other_admin)
check("scope", "مدیر ساختمان دیگر → ۴۰۳", s == 403, s)
s, b = call("identity", "GET", f"/units/{U['1204']}", token=other_admin)
check("scope", "واحد ساختمان دیگر (RLS) → ۴۰۴", s == 404, s)
s, b = call("identity", "GET", f"/units/{U['1204']}", token=sa)
check("scope", "سوپرادمین بدون building_id → ۴۰۰", s == 400, s)
s, b = call("identity", "GET", f"/units/{U['1204']}?building_id={TENANT}", token=sa)
check("scope", "سوپرادمین با building_id", s == 200 and b["no"] == "1204", s)

# ═══════════════ ۲) پرونده واحد و قواعد سرپرست ═══════════════
s, b = call("identity", "GET", f"/units/{U['1204']}", token=admin)
check("unit", "پرونده ۱۲۰۴: مالک غیرساکن + ۵ ساکن + سرپرست", s == 200 and b["owner"]["name"] == "حسین رادمنش" and b["owner"]["absent"] and b["resident_count"] == 5 and b["head"]["name"] == "رضا کریمی", b)
s, b = call("identity", "PATCH", f"/memberships/{M['reza']}", {"status": "ended"}, token=admin)
check("rules", "پایان سرپرست بدون واگذاری → ۴۰۹", s == 409 and "سرپرست" in b.get("message", ""), (s, b))
s, b = call("identity", "POST", f"/units/{U['1204']}/residents", {"name": "سرپرست دوم", "phone": "09120000999", "residency": "tenant", "role": "head"}, token=admin)
check("rules", "سرپرست دوم در یک واحد → ۴۰۹", s == 409, (s, b))
s, b = call("identity", "PATCH", f"/memberships/{M['maryam']}", {"end_date": None}, token=admin)
check("rules", "پرستار بدون تاریخ پایان → رد", s in (400, 409), (s, b))
s, b = call("identity", "POST", f"/units/{U['1204']}/residents", {"name": "x", "phone": "123", "residency": "tenant"}, token=admin)
check("rules", "موبایل نامعتبر → ۴۰۰", s == 400, s)

# ═══════════════ ۳) صف درخواست‌های عضویت ═══════════════
s, b = call("identity", "GET", f"/buildings/{TENANT}/join-requests", token=admin)
kinds = {r["id"]: r["kind"] for r in b} if s == 200 else {}
check("join", "سه درخواست: تأیید / انتقال / منتظر سرپرست", kinds.get(M["leila"]) == "ok" and kinds.get(M["bahram"]) == "move" and kinds.get(M["negar"]) == "head", b)
check("join", "یادداشت «این شماره اکنون ساکن واحد ۸۰۳ است»", any(r.get("note") == "این شماره اکنون ساکن واحد ۸۰۳ است" for r in b), b)
s, b = call("identity", "POST", f"/join-requests/{M['leila']}/approve", token=admin)
check("join", "تأیید لیلا → عضو فعال و سرپرست ۱۱۰۴", s == 200 and b["status"] == "active", (s, b))
s, b = call("identity", "POST", f"/join-requests/{M['bahram']}/transfer", {}, token=admin)
check("join", "انتقال بهرام از ۸۰۳ به ۱۲۰۲", s == 200 and b["status"] == "active" and b["from_units"] == ["803"], (s, b))
s, b = call("identity", "POST", f"/join-requests/{M['negar']}/remind-head", token=admin)
check("join", "یادآوری به سرپرست (رضا کریمی)", s == 200 and b["head_name"] == "رضا کریمی", (s, b))
s, b = call("identity", "POST", f"/join-requests/{M['negar']}/reject", {"reason": "عضو خانوار نیست"}, token=admin)
check("join", "رد درخواست", s == 200 and b["status"] == "rejected" and b["requests"] == [], (s, b))
s, b = call("identity", "POST", f"/join-requests/{M['negar']}/approve", token=admin)
check("join", "درخواست رسیدگی‌شده دوباره قابل تأیید نیست → ۴۰۹", s == 409, s)
s, b = call("identity", "GET", f"/buildings/{TENANT}/units", token=admin)
check("join", "بعد از رسیدگی: ۱۱۰۴ و ۱۲۰۲ پر، ۸۰۳ خالی", unit(b, "1104")["category"] == "tenant" and unit(b, "1202")["category"] == "tenant" and unit(b, "803")["category"] == "vacant", [(u["no"], u["category"]) for u in b["units"]])

# ═══════════════ ۴) پذیرش: ثبت ساکن در واحد خالی → «دعوت ارسال شد» ═══════════════
s, b = call("identity", "POST", f"/units/{U['0803']}/residents", {"name": "پویا مرادی", "phone": "۰۹۱۲ ۷۷۷ ۶۶۵۵", "national_id": "0012345679",
                                                                 "residency": "tenant", "start_date": "2026-09-23", "end_date": "2027-09-22", "pays_charge": True, "send_sms": True}, token=admin)
new_mid = b.get("membership_id")
check("accept", "ثبت ساکن در واحد خالی ۸۰۳", s in (200, 201) and b["role"] == "head" and b["status"] == "invited" and b["invite"] and "token" not in json.dumps(b), (s, b))
s, b = call("identity", "GET", f"/buildings/{TENANT}/units", token=admin)
u803 = unit(b, "803")
check("accept", "۸۰۳ پر شد با برچسب «دعوت ارسال شد»", u803["category"] == "tenant" and u803["name"] == "پویا مرادی" and u803["badges"][0]["t"] == "دعوت ارسال شد", u803)
check("audit", "ثبت ساکن در audit_log", sql(f"SELECT count(*) FROM audit.event_logs WHERE action='membership.created' AND request_body->>'membership_id'='{new_mid}'") == "1")
check("notif", "مالک ۸۰۳ از ثبت مستأجر مطلع شد", sql("SELECT count(*) FROM notification.inbox WHERE kind='tenant_added'") != "0")

# دعوت → پذیرش → ورود با موبایل
token = sql(f"SELECT token FROM residency.invites WHERE membership_id='{new_mid}' AND revoked_at IS NULL")
s, b = call("identity", "GET", f"/invites/{token}")
check("invite", "اطلاعات لینک دعوت", s == 200 and b["valid"] and b["unit_no"] == "803", b)
s, b = call("identity", "POST", f"/invites/{token}/accept", {"password": "Pooya123"})
check("invite", "پذیرش دعوت و ساخت حساب ورود", s == 200 and b["username"] == "09127776655", (s, b))
s, b = call("identity", "POST", f"/invites/{token}/accept", {"password": "Pooya123"})
check("invite", "لینک یک‌بارمصرف → ۴۱۰", s == 410, s)
pooya, s, _ = login("09127776655", "Pooya123")
check("invite", "ورود با شماره موبایل", bool(pooya), s)
s, b = call("identity", "GET", "/me/household", token=pooya)
check("invite", "خانوار من برای سرپرست تازه", s == 200 and b["me"]["is_head"] and b["unit"]["no"] == "803", b)

# ═══════════════ ۵) پذیرش: تخلیه → واحد خالی و قطع نشست ═══════════════
s, b = call("identity", "GET", f"/units/{U['0803']}/move-out?date=2026-11-06", token=admin)
check("moveout", "پیش‌نمایش موارد مانع (بدهی/مرسوله/رزرو)", s == 200 and set(b["blockers"]) == {"debt", "parcels", "reservations"} and len(b["affected"]) == 1, b)
future = (dt.date.today() + dt.timedelta(days=5)).isoformat()
s, b = call("identity", "POST", f"/units/{U['0803']}/move-out", {"date": future}, token=admin)
check("moveout", "تخلیه با تاریخ آینده زمان‌بندی می‌شود", s == 200 and b["status"] == "scheduled", (s, b))
s, b = call("identity", "POST", f"/units/{U['0803']}/move-out", {"date": dt.date.today().isoformat()}, token=admin)
check("moveout", "تخلیه امروز اجرا می‌شود", s == 200 and b["status"] == "done" and b["unit"]["occupancy"] == "vacant", (s, b))
s, b = call("identity", "GET", f"/buildings/{TENANT}/units?filter=vacant", token=admin)
check("moveout", "بعد از تخلیه ۸۰۳ «خالی» است", unit(b, "803") is not None, [u["no"] for u in b["units"]])
s, b = call("identity", "GET", "/auth/me", token=pooya)
check("moveout", "نشست ساکن تخلیه‌شده باطل شد → ۴۰۱", s == 401, s)
_, s, _ = login("09127776655", "Pooya123")
check("moveout", "ورود دوباره‌ی ساکن تخلیه‌شده → ۴۰۱", s == 401, s)
check("moveout", "سوابق عضویت حفظ شد (ended)", sql(f"SELECT status FROM residency.memberships WHERE id='{new_mid}'") == "ended")
check("audit", "تخلیه در audit_log", sql(f"SELECT count(*) FROM audit.event_logs WHERE action='unit.moved_out' AND request_body->>'unit_id'='{U['0803']}'") == "1")

# ═══════════════ ۶) خانوار من (سرپرست) ═══════════════
s, b = call("identity", "GET", "/me/household", token=reza)
names = [m["name"] for m in b.get("members", [])]
check("household", "خانوار ۱۲۰۴ از دید سرپرست", s == 200 and b["me"]["is_head"] and names[0] == "رضا کریمی" and "سارا" in names and "مریم رحیمی" in names, (s, names))
sara_row = next(m for m in b["members"] if m["name"] == "سارا")
check("household", "سارا: «۷ تا ۱۲ سال · سقف ۵۰۰ هزار» / «حالت والدین»", sara_row["sub"] == "۷ تا ۱۲ سال · سقف ۵۰۰ هزار" and sara_row["access_label"] == "حالت والدین", sara_row)
s, b = call("identity", "POST", "/me/household/members", {"type": "caregiver", "name": "کمک‌کار", "phone": "09350000099"}, token=reza)
check("household", "پرستار بدون پایان دسترسی → ۴۰۰", s == 400, (s, b))
s, b = call("identity", "POST", "/me/household/members", {"type": "caregiver", "name": "زهرا نیکو", "phone": "09350000099",
                                                          "end_date": (dt.date.today() + dt.timedelta(days=30)).isoformat(), "days": "شنبه تا چهارشنبه"}, token=reza)
check("household", "افزودن پرستار موقت (دعوت)", s in (200, 201) and b["status"] == "invited", (s, b))
care_mid = b.get("membership_id")
s, b = call("identity", "POST", "/me/household/members", {"type": "child", "name": "کیان", "birth_year": 1398}, token=reza)
kian = b.get("membership_id")
check("household", "افزودن کودک بدون موبایل → فعال با پیش‌تنظیم ۷ تا ۱۲", s in (200, 201) and b["status"] == "active" and b["preset"] == "c12", (s, b))
s, b = call("identity", "DELETE", f"/me/household/members/{M['reza']}", token=reza)
check("household", "سرپرست خودش را حذف نمی‌کند → ۴۰۹", s == 409, s)
s, b = call("identity", "DELETE", f"/me/household/members/{care_mid}", token=reza)
check("household", "حذف عضو", s == 200 and "زهرا نیکو" not in [m["name"] for m in b["members"]], s)

# پرستار: پایان خودکار دسترسی در end_date
sql(f"UPDATE residency.memberships SET status='active', start_date = CURRENT_DATE - 10, end_date = CURRENT_DATE - 1 WHERE id='{M['maryam']}'")
call("identity", "GET", "/me/permissions", token=admin)  # housekeeping تنبل (RESIDENTS_HOUSEKEEPING_THROTTLE_MS=0)
s, b = call("identity", "GET", f"/units/{U['1204']}", token=admin)
check("rules", "دسترسی پرستار در تاریخ پایان خودکار قطع شد", all(m["id"] != M["maryam"] for m in b["members"]), [m["name"] for m in b["members"]])

# ═══════════════ ۷) ورود کودک با کد یا QR ═══════════════
s, b = call("identity", "POST", f"/me/household/members/{M['sara']}/login-code", token=reza)
code, qr = b.get("code"), b.get("qr_token")
check("child", "کد ۶ رقمی + QR پنج‌دقیقه‌ای", s in (200, 201) and len(code) == 6 and b["qr_payload"].startswith("hamino://family?t=borj-aftab"), (s, b))
s, b = call("identity", "POST", "/auth/family-code", {"tenantSubdomain": T, "code": code})
sara = b.get("accessToken")
check("child", "ورود سارا با کد خانواده", s == 200 and b["user"]["role"] == "child", (s, b))
s, b = call("identity", "POST", "/auth/family-code", {"tenantSubdomain": T, "code": code})
check("child", "کد یک‌بارمصرف است → ۴۰۱", s == 401, s)
s, b = call("identity", "POST", f"/me/household/members/{kian}/login-code", token=reza)
s, b = call("identity", "POST", "/auth/family-code", {"tenantSubdomain": T, "qr_token": b["qr_token"]})
check("child", "ورود با اسکن QR", s == 200 and b["user"]["fullName"] == "کیان", (s, b))

s, b = call("identity", "GET", "/me/permissions", token=sara)
check("child", "نقشه‌ی دسترسی کودک: مالی پنهان، اضطراری باز", s == 200 and b["kind"] == "child" and b["modules"]["finance"] == "hidden" and b["modules"]["emergency"] == "free", b)
check("child", "اعتبار ماهانه: سقف ۵۰۰ هزار، ۲۸۰ خرج، ۲۲۰ مانده", b.get("credit") == {"cap": 500000, "spent": 280000, "remaining": 220000}, b.get("credit"))
check("child", "غذا «با تأیید» (پیش‌تنظیم ۷ تا ۱۲)", b["modules"]["food"] == "approval", b["modules"])

# پذیرش: «پنهان» کردن یک بخش فوراً از اپ کودک حذف می‌شود
s, b = call("identity", "PUT", f"/me/household/members/{M['sara']}/parent-control", {"modules": {"parcel": 0}, "quiet_hours": None}, token=reza)
check("parent", "ویرایش یک ردیف → پیش‌تنظیم «سفارشی»", s == 200 and b["preset"] == "custom" and b["modules"]["parcel"] == 0, (s, b))
s, b = call("identity", "GET", "/me/permissions", token=sara)
check("parent", "«پنهان» فوراً روی اپ کودک اعمال شد (بدون ورود دوباره)", b["modules"]["parcel"] == "hidden", b["modules"])
check("audit", "تغییر حالت والدین در audit_log", sql(f"SELECT count(*) FROM audit.event_logs WHERE action='parent_control.updated' AND request_body->>'membership_id'='{M['sara']}'") != "0")
s, b = call("identity", "GET", f"/me/household/members/{M['sara']}/parent-control", token=pooya)
check("parent", "حالت والدین کودک دیگران → ۴۰۱/۴۰۴", s in (401, 403, 404), s)

# پذیرش: سفارش بالای سقف → درخواست برای والد → تأیید → کسر از اعتبار
call("identity", "PUT", f"/me/household/members/{M['sara']}/parent-control", {"modules": {"food": 2}}, token=reza)
s, b = call("identity", "POST", "/me/child/requests", {"type": "order", "amount": 100000, "payload": {"venue": "کافی‌شاپ", "items": [{"n": "کیک", "q": 1}]}}, token=sara)
check("order", "سفارش زیر سقف مستقیم ثبت می‌شود", s in (200, 201) and b["status"] == "placed" and b["credit"]["remaining"] == 120000, (s, b))
s, b = call("identity", "POST", "/me/child/requests", {"type": "order", "amount": 320000, "payload": {"venue": "رستوران ساختمان", "items": [{"n": "پیتزا مخصوص", "q": 1, "p": 280000}, {"n": "نوشابه", "q": 1, "p": 40000}]}}, token=sara)
req_id = (b.get("request") or {}).get("id")
check("order", "سفارش بالای سقف → درخواست برای والد", s in (200, 201) and b["status"] == "pending" and b["request"]["reason"] == "over_cap", (s, b))
s, b = call("identity", "GET", "/me/notifications", token=reza)
check("order", "درخواست به والد رسید (اعلان)", s == 200 and any(n["kind"] == "child_request" and n["ref_id"] == req_id for n in b["items"]), b)
s, b = call("identity", "GET", "/me/child-requests", token=reza)
r0 = next((r for r in b if r["id"] == req_id), None)
check("order", "برگه‌ی تأیید: مبلغ و «بیشتر از مانده‌ی سقف»", r0 and r0["amount"] == 320000 and r0["over_cap_by"] == 200000 and r0["title"] == "سارا می‌خواهد سفارش بدهد", r0)
s, b = call("identity", "POST", f"/child-requests/{req_id}/approve", {}, token=reza)
check("order", "تأیید والد → از اعتبار کودک کم شد", s == 200 and b["status"] == "approved" and b["credit"]["spent"] == 700000, (s, b))
s, b = call("identity", "POST", f"/child-requests/{req_id}/approve", {}, token=reza)
check("order", "تأیید دوباره → ۴۰۹", s == 409, s)
s, b = call("identity", "GET", "/me/permissions", token=sara)
check("order", "اعتبار کودک به‌روز شد", b["credit"]["spent"] == 700000, b.get("credit"))
check("audit", "تأیید درخواست کودک در audit_log", sql(f"SELECT count(*) FROM audit.event_logs WHERE action='child_request.approved' AND request_body->>'request_id'='{req_id}'") == "1")

call("identity", "PUT", f"/me/household/members/{M['sara']}/parent-control", {"modules": {"food": 1}}, token=reza)
s, b = call("identity", "POST", "/me/child/requests", {"type": "order", "amount": 1000}, token=sara)
rej_id = (b.get("request") or {}).get("id")
check("order", "بخش «با تأیید» → همیشه درخواست", b.get("status") == "pending" and b["request"]["reason"] == "approval", b)
s, b = call("identity", "POST", f"/child-requests/{rej_id}/reject", {"reason": "الان نه"}, token=reza)
check("order", "رد درخواست", s == 200 and b["status"] == "rejected", (s, b))
s, b = call("identity", "POST", "/me/child/requests", {"type": "order", "amount": 1000}, token=sara)
old_id = b["request"]["id"]
sql(f"UPDATE residency.child_requests SET created_at = now() - interval '31 minutes', expires_at = now() - interval '1 minute' WHERE id = '{old_id}'")
s, b = call("identity", "GET", "/me/child/requests", token=sara)
check("order", "درخواست ۳۰ دقیقه‌ای منقضی می‌شود", next(r["status"] for r in b if r["id"] == old_id) == "expired", [r["status"] for r in b])
s, b = call("identity", "POST", f"/child-requests/{old_id}/approve", {}, token=reza)
check("order", "درخواست منقضی قابل تأیید نیست → ۴۰۹", s == 409, s)

call("identity", "PUT", f"/me/household/members/{M['sara']}/parent-control", {"modules": {"food": 0}}, token=reza)
s, b = call("identity", "POST", "/me/child/requests", {"type": "order", "amount": 1000}, token=sara)
check("order", "بخش «پنهان» → ۴۰۳", s == 403, s)
s, b = call("identity", "GET", "/me/permissions", token=sara)
check("parent", "غذا پنهان → از نقشه‌ی کودک حذف", b["modules"]["food"] == "hidden", b["modules"])

# ساعت سکوت: سفارش بسته؛ تماس اضطراری همیشه باز
call("identity", "PUT", f"/me/household/members/{M['sara']}/parent-control", {"modules": {"food": 2}, "quiet_hours": {"from": "00:00", "to": "23:59"}}, token=reza)
s, b = call("identity", "POST", "/me/child/requests", {"type": "order", "amount": 1000}, token=sara)
check("quiet", "ساعت سکوت → ۴۲۳", s == 423 and b.get("code") == "quiet_hours", (s, b))
s, b = call("identity", "GET", "/me/permissions", token=sara)
check("quiet", "نقشه‌ی دسترسی ساعت سکوت فعال را نشان می‌دهد", b["quiet"]["active"] is True, b["quiet"])
s, b = call("identity", "POST", "/me/emergency", token=sara)
check("quiet", "تماس اضطراری در ساعت سکوت هم باز است", s == 200 and b["ok"], (s, b))
for who, tk in [("مدیر", admin), ("مسئول مشاعات", desk), ("ساکن", reza)]:
    s, b = call("identity", "POST", "/me/emergency", token=tk)
    check("quiet", f"تماس اضطراری برای {who}", s == 200, s)
call("identity", "PUT", f"/me/household/members/{M['sara']}/parent-control", {"quiet_hours": None, "exit_pin": "4821"}, token=reza)
s, b = call("identity", "POST", "/me/exit-unlock", {"pin": "0000"}, token=sara)
check("quiet", "قفل خروج: رمز اشتباه → ۴۰۳", s == 403, s)
s, b = call("identity", "POST", "/me/exit-unlock", {"pin": "4821"}, token=sara)
check("quiet", "قفل خروج: رمز والد درست", s == 200, s)

# ═══════════════ ۸) واگذاری سرپرستی ═══════════════
s, b = call("identity", "POST", "/me/household/transfer-head", {"membership_id": M["sara"]}, token=reza)
check("head", "واگذاری به کودک ممنوع → ۴۰۹", s == 409, s)
s, b = call("identity", "POST", "/me/household/transfer-head", {"membership_id": M["mina"]}, token=reza)
check("head", "واگذاری سرپرستی به مینا", s == 200 and not b["me"]["is_head"], (s, b))
s, b = call("identity", "POST", "/me/household/members", {"type": "adult", "name": "x", "phone": "09120001111"}, token=reza)
check("head", "بعد از واگذاری، افزودن عضو → ۴۰۳", s == 403, s)
s, b = call("identity", "PATCH", f"/memberships/{M['reza']}", {"role": "head"}, token=admin)
check("head", "مدیر سرپرستی را برمی‌گرداند (ارتقا = واگذاری)", s == 200 and b["head"]["name"] == "رضا کریمی", (s, b.get("head") if isinstance(b, dict) else b))

# ═══════════════ ۹) رزرو مشاعات ═══════════════
tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
s, b = call("facility", "GET", f"/amenities/{POOL}/slots?date={tomorrow}", token=reza)
check("booking", "ساعت‌های آزاد فردا (استخر)", s == 200 and len(b["slots"]) == 9 and b["amenity"]["needs_approval"], (s, b))
start17 = next(x["start"] for x in b["slots"] if x["hour"] == 17)
s, b = call("facility", "POST", "/reservations", {"amenity_id": POOL, "start": start17}, token=reza)
res_id = b.get("id")
check("booking", "مشاع با «نیاز به تأیید» → pending", s in (200, 201) and b["status"] == "pending", (s, b))
s, b = call("facility", "GET", f"/amenities/{POOL}/slots?date={tomorrow}", token=reza)
check("booking", "ساعت پُر قابل انتخاب نیست (taken)", next(x for x in b["slots"] if x["hour"] == 17)["status"] == "taken", b["slots"])
s, b = call("facility", "POST", "/reservations", {"amenity_id": POOL, "start": start17}, token=reza)
check("booking", "تداخل زمانی → ۴۰۹", s == 409, (s, b))
s, b = call("facility", "POST", "/reservations", {"amenity_id": POOL, "start": start17, "hours": 2}, token=reza)
check("booking", "بیشتر از حداکثر ساعت → ۴۰۰", s == 400, s)
s, b = call("facility", "GET", "/reservations?status=pending", token=desk)
check("booking", "در صف مسئول مشاعات آمد", s == 200 and any(r["id"] == res_id for r in b), (s, b))
check("booking", "اعلان «درخواست رزرو جدید» به مسئول مشاعات و مدیر", sql(f"SELECT string_agg(recipient_role, ',' ORDER BY recipient_role) FROM notification.inbox WHERE ref_id='{res_id}'") == "admin,perm:amenity_desk")
s, b = call("identity", "GET", "/me/notifications", token=desk)
check("booking", "مسئول مشاعات اعلان را در صندوقش می‌بیند", any(n["ref_id"] == res_id for n in b["items"]), b)
s, b = call("facility", "POST", f"/reservations/{res_id}/approve", token=kitchen)
check("booking", "کارمند آشپزخانه نمی‌تواند تأیید کند → ۴۰۳", s == 403, s)
s, b = call("facility", "POST", f"/reservations/{res_id}/approve", token=desk)
check("booking", "تأیید مسئول مشاعات", s == 200 and b["status"] == "confirmed", (s, b))
start19 = start17.replace("T13:30", "T15:30")
s, b = call("facility", "POST", "/reservations", {"amenity_id": POOL, "start": start19}, token=reza)
s2, b2 = call("facility", "POST", f"/reservations/{b.get('id')}/reject", {"reason": "استخر در حال تعمیر است"}, token=admin)
check("booking", "عدم تأیید با دلیل", s2 == 200 and b2["status"] == "rejected" and b2["reject_reason"] == "استخر در حال تعمیر است", (s, b, s2, b2))
s, b = call("facility", "GET", f"/amenities/{GYM}/slots?date={tomorrow}", token=reza)
gym16 = next(x["start"] for x in b["slots"] if x["hour"] == 16)
s, b = call("facility", "POST", "/reservations", {"amenity_id": GYM, "start": gym16}, token=reza)
check("booking", "مشاع بدون تأیید → قطعی", s in (200, 201) and b["status"] == "confirmed", (s, b))
check("audit", "رزرو و تأیید در audit_log", sql(f"SELECT count(*) FROM audit.event_logs WHERE request_body->>'reservation_id'='{res_id}'") == "2")
# کودک با «رزرو امکانات: با تأیید من» → درخواست برای والد
s, b = call("facility", "POST", "/reservations", {"amenity_id": GYM, "start": gym16.replace("T12:30", "T13:30")}, token=sara)
check("booking", "کودک (با تأیید) → درخواست برای والد", s in (200, 201) and b["status"] == "pending_parent", (s, b))
s, b = call("identity", "GET", "/me/child-requests", token=reza)
amen_req = next((r for r in b if r["type"] == "amenity"), None)
s, b = call("identity", "POST", f"/child-requests/{amen_req['id']}/approve", {}, token=reza)
check("booking", "تأیید والد → رزرو ساخته شد", s == 200 and sql(f"SELECT count(*) FROM facility.reservations WHERE source='child_request'") == "1", (s, b))

# ═══════════════ ۱۰) ورود گروهی (CSV/XLSX) و QR لابی ═══════════════
s, b = call("identity", "GET", f"/buildings/{TENANT}/residents/import/template", token=admin)
check("import", "دانلود قالب اکسل", s == 200 and isinstance(b, (bytes, bytearray)) and b[:2] == b"PK", s)
csv = ("واحد,نام و نام خانوادگی,شماره موبایل,کد ملی,نوع سکونت,شروع سکونت,پایان قرارداد,پرداخت شارژ با\n"
       "101,آرش نیک,09121112233,,مالک ساکن,1405/07/01,,\n"
       "2501,بی‌واحد,09121112234,,مستأجر,,,\n"
       "102,تکراری,09121112233,,مستأجر,,,\n"
       "203,بی‌نوع,09121112235,,,,,\n")
body, ctype = multipart("file", "residents-mehr.csv", csv.encode(), "text/csv")
s, b = call("identity", "POST", f"/buildings/{TENANT}/residents/import", raw=body, ctype=ctype, token=admin)
texts = [e["text"] for e in b.get("errors", [])] if isinstance(b, dict) else []
check("import", "نتیجه‌ی ردیف‌به‌ردیف", s in (200, 201) and b["created"] == 1 and b["total"] == 4, (s, b))
check("import", "خطاها به متن طراحی", texts == ["ردیف ۳ · واحد ۲۵۰۱ وجود ندارد", "ردیف ۴ · شماره تکراری با واحد ۱۰۱", "ردیف ۵ · نوع سکونت خالی است"], texts)
s, b = call("identity", "GET", f"/buildings/{TENANT}/lobby-qr", token=admin)
lobby = b.get("token")
check("lobby", "QR لابی ساختمان", s == 200 and b["url"].endswith("/join/" + lobby), b)
s, b = call("identity", "POST", f"/join/{lobby}", {"name": "سمانه راد", "phone": "09125550000", "unit_no": "۲۰۳", "residency": "tenant"})
check("lobby", "ثبت‌نام عمومی با QR → در انتظار تأیید مدیر", s in (200, 201) and b["status"] == "pending_approval", (s, b))
s, b = call("identity", "GET", f"/buildings/{TENANT}/join-requests", token=admin)
check("lobby", "در صف درخواست‌های مدیر آمد", any(r["name"] == "سمانه راد" and r["kind"] == "ok" for r in b), b)

# ═══════════════ ۱۱) سوپرادمین ═══════════════
s, b = call("identity", "GET", "/admin/residents", token=sa)
aftab = next((x for x in b["buildings"] if x["id"] == TENANT), None)
check("super", "ساختمان‌ها با درصد پر بودن", s == 200 and aftab and 0 < aftab["occupancy_pct"] <= 100 and aftab["units_total"] >= 10, aftab)
check("super", "ساختمان بدون مدیر تعیین‌شده علامت می‌خورد", all("manager_assigned" in x for x in b["buildings"]), b["buildings"])
s, b = call("identity", "GET", "/admin/residents?q=%D8%B1%D8%B6%D8%A7", token=admin)
check("super", "مدیر ساختمان به پنل سوپرادمین → ۴۰۳", s == 403, s)
s, b = call("identity", "GET", "/admin/residents?q=%D8%B1%D8%B6%D8%A7", token=sa)
check("super", "جست‌وجوی شخص در همه‌ی ساختمان‌ها", any(p["id"] == REZA and p["memberships"] for p in b["people"]), b["people"])
s, b = call("identity", "GET", f"/admin/users/{REZA}", token=sa)
check("super", "پرونده‌ی شخص: عضویت‌ها + تاریخچه", s == 200 and any(m["unit_no"] == "1204" for m in b["memberships"]) and len(b["audit"]) >= 3, (s, b.get("memberships") if isinstance(b, dict) else b))
s, b = call("identity", "POST", f"/admin/users/{REZA}/logout-all", token=sa)
s2, _ = call("identity", "GET", "/auth/me", token=reza)
check("super", "خروج از همه‌ی دستگاه‌ها → توکن قبلی ۴۰۱", s == 200 and s2 == 401, (s, s2))
import time; time.sleep(1.1)
reza, s, _ = login("resident@borj-aftab.test")
check("super", "ورود دوباره بعد از خروج از همه‌ی دستگاه‌ها", bool(reza), s)
s, b = call("identity", "POST", f"/admin/users/{REZA}/block", token=sa)
_, s2, b2 = login("resident@borj-aftab.test")
check("super", "مسدودسازی → ورود ۴۰۱", s == 200 and s2 == 401, (s, s2, b2))
call("identity", "POST", f"/admin/users/{REZA}/unblock", token=sa)
time.sleep(1.1)
reza, s, _ = login("resident@borj-aftab.test")
check("super", "رفع مسدودی", bool(reza), s)

# ─── گزارش ───
ok = sum(1 for r in results if r[2])
print(f"\nنتیجه: {ok} قبول / {len(results) - ok} رد (از {len(results)})")
sys.exit(0 if ok == len(results) else 1)
