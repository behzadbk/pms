#!/usr/bin/env python3
"""
شبیه‌سازی ۶ ماهه‌ی ساختمان (۱۲ واحد) با نقش‌های واقعی روی API زنده‌ی ۸ سرویس.

نقش‌ها: سوپرادمین · مدیر · حسابدار · مسئول مشاعات · نگهبان/امنیت · آشپزخانه · ساکن (خوش‌حساب، دیرپرداخت،
بدهکار، همیشه‌بدهکار، نیمه‌پرداخت).

«گذر زمان» چطور شبیه‌سازی می‌شود؟  ساعت سیستم جلو نمی‌رود؛ ۶ دوره‌ی شارژ (اپریل تا سپتامبر ۲۰۲۶) در گذشته
صادر می‌شوند، پس سررسیدها واقعاً گذشته‌اند و قفل بدهکاری روی ساعت واقعی دیتابیس کار می‌کند. رزرو و مهمان و بسته
هر «ماه» یک دور اجرا می‌شود و بعد داده‌های آن دور ۳۰ روز به گذشته منتقل می‌شود.

اجرا:   PGURL=postgres://postgres:postgres@localhost:5432/pms python3 tests/sim_6month.py
خروجی:  گزارش در /tmp/sim_report.json  و  /tmp/sim_report.md
"""
import json, os, sys, hmac, hashlib, urllib.request, urllib.error, uuid, datetime as dt, subprocess, random, threading, time

H = os.environ.get("HOST", "http://localhost")
P = dict(identity=3001, property=3002, facility=3003, finance=3004, guard=3005, notification=3006, audit=3007, fnb=3008)
PGURL = os.environ.get("PGURL", "postgres://postgres:postgres@localhost:5432/pms")
WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "local_webhook_secret")
random.seed(1405)

results, findings = [], []


def call(svc, method, path, body=None, token=None, headers=None, timeout=15):
    req = urllib.request.Request(f"{H}:{P[svc]}{path}", method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t
    except Exception as e:  # noqa
        return 0, str(e)


def sql(q):
    r = subprocess.run(["psql", PGURL, "-tAX", "-v", "ON_ERROR_STOP=1", "-c", q], capture_output=True, text=True, env={**os.environ, "PGPASSWORD": "postgres"})
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:300])
    return r.stdout.strip()


def check(group, name, ok, detail="", sev="P2", finding=None):
    """sev: P0 امنیتی/از دست رفتن داده · P1 عملکرد اصلی خراب · P2 باگ کوچک/ناهماهنگی · INFO مشاهده"""
    results.append((group, name, bool(ok)))
    print(("✓" if ok else "✗"), f"[{group}] {name}", "" if ok else f"  → {str(detail)[:230]}")
    if not ok:
        findings.append(dict(sev=sev, group=group, title=finding or name, detail=str(detail)[:600]))
    return ok


def observe(group, title, detail, sev="INFO"):
    print(f"• [{group}] {title}")
    findings.append(dict(sev=sev, group=group, title=title, detail=str(detail)[:600]))


def login(ident, pw, tenant):
    s, b = call("identity", "POST", "/auth/login", {"email": ident, "password": pw, "tenantSubdomain": tenant})
    return (b.get("accessToken") if isinstance(b, dict) else None), s, b


def sign(tid, pid, ok=True):
    return hmac.new(WEBHOOK_SECRET.encode(), f"{tid}:{pid}:{'true' if ok else 'false'}".encode(), hashlib.sha256).hexdigest()


def pay(resident_tok, tid, charge_id, success=True, key=None):
    s, b = call("finance", "POST", "/payments/initiate", {"chargeId": charge_id}, token=resident_tok, headers={"Idempotency-Key": key or str(uuid.uuid4())})
    if s not in (200, 201):
        return s, b
    s2, b2 = call("finance", "POST", f"/payments/webhook/zarinpal/{tid}", {"paymentId": b["id"], "success": success}, headers={"X-Webhook-Signature": sign(tid, b["id"], success)})
    return s2, b2


# ════════════════════════════════════════════════════════════════════════════
# ۰. سوپرادمین: ساختمان تازه‌ی «کاملاً خام»
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۰. ساخت ساختمان خام توسط سوپرادمین ═══")
SUB = "sim" + uuid.uuid4().hex[:6]
sa, s, b = login("behzad", "1234", SUB) if False else (None, 0, None)
s, b = call("identity", "POST", "/auth/platform-login", {"username": "behzad", "password": "1234"})
sa = b.get("accessToken") if isinstance(b, dict) else None
check("setup", "ورود سوپرادمین", sa, (s, b), "P1")
s, b = call("identity", "POST", "/platform/buildings",
            {"name": "برج شبیه‌سازی", "subdomain": SUB, "tier": "professional", "unitCount": 12, "floorCount": 3,
             "adminEmail": f"admin@{SUB}.test", "adminPassword": "Str0ngPass!"}, token=sa)
check("setup", "ساخت ساختمان", s in (200, 201), (s, b), "P1")
BID = b["id"]
admin, s, b = login(f"admin@{SUB}.test", "Str0ngPass!", SUB)
check("setup", "ورود مدیر ساختمان جدید", admin, (s, b), "P1")

# ── خام بودن: هیچ جدولِ tenant_دار برای این ساختمان نباید ردیفی داشته باشد (جز خود tenant و مدیر)
tables = sql("""SELECT table_schema||'.'||table_name FROM information_schema.columns
                 WHERE column_name='tenant_id' AND table_schema NOT IN ('information_schema','pg_catalog')
                   AND table_name NOT LIKE 'event_logs_%' ORDER BY 1""").splitlines()
nonempty = {}
for t in tables:
    n = int(sql(f"SELECT count(*) FROM {t} WHERE tenant_id='{BID}'"))
    if n:
        nonempty[t] = n
unexpected = {k: v for k, v in nonempty.items() if k not in ("identity.users",)}
check("raw", "ساختمان تازه هیچ داده‌ی دمو/اولیه‌ای ندارد (فقط حساب مدیر)", not unexpected, unexpected, "P1")
check("raw", "فقط ۱ کاربر (مدیر) ساخته شده", nonempty.get("identity.users") == 1, nonempty, "P2")
for svc, path, nm in [("property", "/units", "واحدها"), ("facility", "/amenities", "مشاعات"), ("guard", "/parcels", "بسته‌ها"), ("fnb", "/fnb/venues", "رستوران‌ها")]:
    s, b = call(svc, "GET", path, token=admin)
    check("raw", f"لیست {nm} خالی است", s == 200 and b == [], (s, b))

# ════════════════════════════════════════════════════════════════════════════
# ۱. مدیر: راه‌اندازی ساختمان (واحد، ساکن، مشاعات، قوانین، کارکنان)
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۱. راه‌اندازی توسط مدیر ═══")
s, b = call("identity", "POST", f"/buildings/{BID}/units/bulk", {"floors": 3, "units_per_floor": 4, "area": 80}, token=admin)
check("onboard", "ساخت ۱۲ واحد (۳ طبقه × ۴)", s in (200, 201), (s, b), "P1")
s, units = call("property", "GET", "/units", token=admin)
check("onboard", "property-service واحدها را می‌بیند (۱۲ تا)", s == 200 and len(units) == 12, (s, len(units) if isinstance(units, list) else units), "P1")
units = sorted(units, key=lambda u: u["unit_number"] if "unit_number" in u else u.get("unitNumber"))
UID = [u["id"] for u in units]
UNO = [u.get("unit_number") or u.get("unitNumber") for u in units]
AREA = {u["id"]: float(u.get("area_sqm") or u.get("areaSqm") or 0) for u in units}
observe("onboard", "فیلد مساحت واحد در property-service", f"نمونه واحد: {json.dumps(units[0], ensure_ascii=False)[:300]}")

# ساکنان: پروفایل‌های مالی
PROFILE = ["good"] * 5 + ["late"] * 2 + ["debtor"] * 2 + ["chronic"] + ["partial"] * 2
PHONES = [f"0912{random.randint(1000000, 9999999)}" for _ in range(12)]
res_tok = {}
for i, uid in enumerate(UID):
    s, b = call("identity", "POST", f"/units/{uid}/residents?building_id={BID}",
                {"name": f"ساکن {UNO[i]}", "phone": PHONES[i], "residency": "owner" if i % 2 else "tenant", "send_sms": False}, token=admin)
    ok = s in (200, 201)
    check("onboard", f"ثبت سرپرست واحد {UNO[i]}", ok, (s, b), "P1")
    t, s, b = login(PHONES[i], UNO[i], SUB)
    check("onboard", f"ورود ساکن واحد {UNO[i]} با موبایل + رمز اولیه", t, (s, b), "P1")
    res_tok[uid] = t
s, b = call("identity", "POST", "/auth/login", {"email": PHONES[0], "password": UNO[0], "tenantSubdomain": SUB})
if isinstance(b, dict):
    observe("security", "رمز اولیه‌ی ساکن = شماره‌ی واحد (مثلاً «101»)",
            f"mustChangePassword در پاسخ لاگین: {b.get('mustChangePassword') or b.get('user', {}).get('mustChangePassword')}؛ "
            "اگر کسی شماره‌ی موبایل یک ساکن را بداند و ساکن رمز را عوض نکرده باشد، حدس‌زدنِ رمز بسیار ساده است (شماره‌ی واحدها ۳ رقمی و قابل‌پیش‌بینی). "
            "پیشنهاد: رمز تصادفی یا کد یک‌بارمصرف + اجبار تغییر رمز قبل از هر عملیات.", "P2")

# کارکنان
STAFF = {}
for uname, dept in [("sim.desk", "amenity_desk"), ("sim.guard", "security"), ("sim.kitchen", "kitchen"), ("sim.lobby", "lobby")]:
    s, b = call("identity", "POST", "/users/staff", {"fullName": uname, "username": uname, "password": "secret12", "department": dept}, token=admin)
    check("onboard", f"ساخت کارمند {dept}", s in (200, 201), (s, b), "P1")
    t, s, b = login(uname, "secret12", SUB)
    check("onboard", f"ورود کارمند {dept}", t, (s, b), "P1")
    STAFF[dept] = t

# مشاعات
AM = {}
for nm, typ, appr in [("استخر", "pool", False), ("سالن اجتماعات", "hall", True), ("باشگاه", "gym", False)]:
    s, b = call("facility", "POST", "/amenities", {"name": nm, "type": typ, "requiresApproval": appr}, token=admin)
    check("onboard", f"ساخت مشاع «{nm}»", s in (200, 201), (s, b), "P1")
    AM[typ] = b["id"] if isinstance(b, dict) else None
s, b = call("facility", "PUT", f"/amenities/{AM['pool']}/booking-rules",
            {"maxBookingsPerUnitPerPeriod": 2, "periodType": "week", "minAdvanceHours": 1, "maxAdvanceDays": 30, "depositAmount": 0}, token=admin)
check("onboard", "قانون رزرو استخر: ۲ رزرو در هفته", s in (200, 201), (s, b))
s, b = call("identity", "PUT", f"/buildings/{BID}/rules", {"debtor_grace_days": 30, "restrictions": {f"amenity:{AM['pool']}": True, "module:food": True}}, token=admin)
check("onboard", "قانون بدهکار: ۳۰ روز مهلت، استخر و غذا بسته", s in (200, 201), (s, b), "P1")

# ── نبودهای ساختاری در ساختمان تازه (حسابدار، فرمول شارژ، رستوران، نگهبان)
print("\n═══ ۱.۱ آیا ساختمان تازه می‌تواند خودش کار کند؟ ═══")
s, b = call("identity", "POST", "/users/staff", {"fullName": "حسابدار", "username": "sim.acc", "password": "secret12", "department": "accounting", "role": "accountant"}, token=admin)
check("gaps", "مدیر می‌تواند «حسابدار» بسازد", s in (200, 201) and (isinstance(b, dict) and b.get("role") == "accountant"), (s, b),
      "P1", "هیچ API برای ساخت کاربر حسابدار وجود ندارد؛ ساختمان تازه نمی‌تواند شارژ صادر کند")
check("gaps", "کارمند «امنیت» به API نگهبانی دسترسی دارد", call("guard", "GET", "/parcels", token=STAFF["security"])[0] == 200,
      call("guard", "GET", "/parcels", token=STAFF["security"]),
      "P1", "نگهبانی که مدیر با بخش «security» می‌سازد (نقش staff) به guard-service (فقط نقش guard/admin) ۴۰۳ می‌گیرد؛ و API ساخت نقش guard نیست")
s, b = call("fnb", "GET", "/fnb/venues", token=admin)
check("gaps", "ساختمان تازه راهی برای ساخت رستوران/کافه دارد", s == 200 and bool(b), (s, b), "P2",
      "هیچ endpoint برای ساخت venue در fnb-service نیست؛ ماژول غذا در ساختمان تازه غیرقابل‌استفاده است")
s, b = call("finance", "GET", "/charge-formulas", token=admin)
check("gaps", "API فرمول شارژ وجود دارد", s == 200, (s, b), "P1", "هیچ API برای تعریف/ویرایش فرمول شارژ نیست (generate-monthly بدون formulaId کار نمی‌کند)")

# راه‌حل موقت برای ادامه‌ی شبیه‌سازی: حسابدار و فرمول را مستقیم با SQL می‌سازیم (فقط در محیط تست)
sql(f"""INSERT INTO identity.users (tenant_id, full_name, email, password_hash, role)
        SELECT '{BID}', 'حسابدار شبیه‌سازی', 'acc@{SUB}.test', password_hash, 'accountant'
          FROM identity.users WHERE email='accountant@borj-aftab.test' LIMIT 1""")
FORMULA = str(uuid.uuid4())
sql(f"""INSERT INTO finance.charge_formulas (id, tenant_id, name, base_amount, amount_per_sqm)
        VALUES ('{FORMULA}', '{BID}', 'شارژ پایه', 500000, 10000)""")
acc, s, b = login(f"acc@{SUB}.test", "Passw0rd!", SUB)
check("setup", "ورود حسابدار (ساخته‌شده با SQL)", acc, (s, b), "P1")

# ════════════════════════════════════════════════════════════════════════════
# ۲. شش ماه شارژ و پرداخت
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۲. شش ماه صدور شارژ و پرداخت ═══")
PERIODS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
charge_ids = {}  # (unit_id, period) → id
for pi, period in enumerate(PERIODS):
    s, b = call("finance", "POST", "/charges/generate-monthly", {"period": period, "formulaId": FORMULA}, token=acc)
    check("finance", f"{period}: صدور شارژ برای ۱۲ واحد", s in (200, 201) and b.get("generatedCount") == 12, (s, b), "P1")
    s, b = call("finance", "POST", "/charges/generate-monthly", {"period": period, "formulaId": FORMULA}, token=acc)
    check("finance", f"{period}: صدور دوباره تکراری نمی‌سازد (idempotent)", s in (200, 201) and b.get("generatedCount") == 0, (s, b))
    for i, uid in enumerate(UID):
        s, rows = call("finance", "GET", f"/units/{uid}/charges", token=admin)
        row = next((r for r in rows if str(r["period"])[:7] == period), None) if isinstance(rows, list) else None
        if row:
            charge_ids[(uid, period)] = row["id"]
    # مبلغ طبق فرمول و سررسید روز ۱۰
    sample = charge_ids.get((UID[0], period))
    s, rows = call("finance", "GET", f"/units/{UID[0]}/charges", token=admin)
    row = next((r for r in rows if r["id"] == sample), None) if isinstance(rows, list) else None
    exp = 500000 + 10000 * AREA[UID[0]]
    check("finance", f"{period}: مبلغ شارژ = پایه + مساحت×نرخ", row and abs(float(row["total_amount"]) - exp) < 1, (row and row.get("total_amount"), exp), "P1")
    dd = sql(f"SELECT due_date::text FROM finance.monthly_charges WHERE id='{sample}'")
    check("finance", f"{period}: سررسید روز ۱۰ همان ماه", dd == f"{period}-10", dd)
    if pi == 0 and row:
        api_dd = str(row["due_date"])
        check("finance", "فیلد due_date در API یک تاریخ ساده (YYYY-MM-DD) است نه زمان وابسته به TZ سرور", len(api_dd) == 10, api_dd, "P2",
              "pg فیلد DATE را در منطقه‌ی زمانی سرور به JS Date تبدیل می‌کند (setTypeParser(1082) در هیچ سرویسی نیست)؛ روی سرور با TZ=Asia/Tehran خروجی «2026-04-09T20:30:00.000Z» یعنی یک روز قبل برای کلاینت UTC")

# ── پرداخت‌ها بر اساس پروفایل
def plan(profile, idx):
    """کدام دوره‌ها پرداخت شود"""
    if profile == "good":
        return PERIODS
    if profile == "late":
        return PERIODS[:-1]               # آخرین ماه هنوز معوق (۲۳ روز، کمتر از مهلت ۳۰ روزه)
    if profile == "debtor":
        return PERIODS[:2]                # از خرداد(جون) نمی‌پردازد
    if profile == "chronic":
        return []
    if profile == "partial":
        return [PERIODS[0], PERIODS[1], PERIODS[3], PERIODS[5]]  # ماه ۳ و ۵ پرداخت‌نشده
    return PERIODS

TID = BID
dup_tested = False
for i, uid in enumerate(UID):
    for period in plan(PROFILE[i], i):
        cid = charge_ids.get((uid, period))
        if not cid:
            check("finance", f"شناسه شارژ {UNO[i]}/{period} پیدا شد", False, "", "P1")
            continue
        key = str(uuid.uuid4())
        if sql(f"SELECT status FROM finance.monthly_charges WHERE id='{cid}'") == "paid":
            continue
        s, b = pay(res_tok[uid], TID, cid, True, key)
        ok = s in (200, 201) and b.get("status") == "success"
        check("finance", f"پرداخت {UNO[i]}/{period}", ok, (s, b), "P1")
        if i == 0 and period == PERIODS[0] and not dup_tested:
            dup_tested = True
            # پرداخت مجدد همان شارژ، webhook تکراری، و webhook شکست بعد از موفقیت
            s, b2 = call("finance", "POST", "/payments/initiate", {"chargeId": cid}, token=res_tok[uid])
            check("finance", "پرداخت دوباره‌ی شارژ پرداخت‌شده → 409", s == 409, (s, b2))
            s, p = call("finance", "POST", "/payments/initiate", {"chargeId": charge_ids[(uid, PERIODS[1])]}, token=res_tok[uid], headers={"Idempotency-Key": "k-" + key})
            pid = p["id"]
            for n in range(3):
                call("finance", "POST", f"/payments/webhook/zarinpal/{TID}", {"paymentId": pid, "success": True}, headers={"X-Webhook-Signature": sign(TID, pid, True)})
            s, b3 = call("finance", "POST", f"/payments/webhook/zarinpal/{TID}", {"paymentId": pid, "success": False}, headers={"X-Webhook-Signature": sign(TID, pid, False)})
            check("finance", "webhook شکست بعد از موفقیت، وضعیت را عوض نمی‌کند", b3 and b3.get("status") == "success", (s, b3))
            cnt = sql(f"SELECT count(*) FROM finance.payments WHERE monthly_charge_id='{charge_ids[(uid, PERIODS[1])]}' AND status='success'")
            check("finance", "webhook سه‌باره فقط یک پرداخت موفق می‌سازد", cnt == "1", cnt)

# ── کنترل دسترسی مالی
a_u, b_u = UID[0], UID[1]
s, b = call("finance", "GET", f"/units/{b_u}/charges", token=res_tok[a_u])
check("security", "ساکن واحد A نمی‌تواند شارژها و بدهی واحد B را ببیند", s in (403, 404) or b == [], (s, f"{len(b) if isinstance(b, list) else b} ردیف"), "P1",
      "IDOR: هر ساکنِ ساختمان می‌تواند بدهی/شارژ تک‌تک واحدهای دیگر را بخواند (GET /units/:id/charges بدون بررسی عضویت واحد)")
s, b = call("finance", "POST", "/payments/initiate", {"chargeId": charge_ids[(UID[10], PERIODS[2])]}, token=res_tok[a_u])
check("security", "ساکن A نمی‌تواند برای شارژ واحد دیگر پرداخت شروع کند", s in (403, 404), (s, b), "P2",
      "POST /payments/initiate مالکیت شارژ را بررسی نمی‌کند")
for role_name, tk in [("نگهبان/امنیت", STAFF["security"]), ("آشپزخانه", STAFF["kitchen"])]:
    s, b = call("finance", "POST", "/charges/generate-monthly", {"period": "2027-01", "formulaId": FORMULA}, token=tk)
    check("security", f"{role_name} نمی‌تواند شارژ صادر کند", s == 403, s, "P0")
s, b = call("finance", "POST", "/charges/generate-monthly", {"period": "2026-13", "formulaId": FORMULA}, token=acc)
check("finance", "دوره‌ی نامعتبر → 400", s == 400, (s, b))
s, b = call("finance", "POST", "/charges/generate-monthly", {"period": "2026-09", "formulaId": str(uuid.uuid4())}, token=acc)
check("finance", "فرمول ناموجود → 404", s == 404, (s, b))
s, b = call("finance", "POST", "/charges/generate-monthly", {"period": "2026-09", "formulaId": "not-a-uuid"}, token=acc)
check("finance", "formulaId نامعتبر → 4xx نه 500", 400 <= s < 500, (s, b), "P2")

# ── منطق «دیرکرد» و وضعیت overdue
st = sql(f"SELECT string_agg(DISTINCT status, ',') FROM finance.monthly_charges WHERE tenant_id='{BID}'")
check("finance", "شارژهای معوق وضعیت «overdue» می‌گیرند (دیرکرد)", "overdue" in st.split(","), f"وضعیت‌های موجود: {st}", "P2",
      "هیچ jobی شارژِ گذشته از سررسید را overdue نمی‌کند و هیچ جریمه‌ی دیرکردی محاسبه نمی‌شود (SPEC: «late fees»)")
cols = sql("SELECT string_agg(column_name,',') FROM information_schema.columns WHERE table_schema='finance' AND table_name='monthly_charges'")
lf = sql(f"SELECT count(*) FROM finance.monthly_charges WHERE tenant_id='{BID}' AND status<>'paid' AND due_date < current_date - 30 AND COALESCE(late_fee_amount,0) > 0")
check("finance", "جریمه‌ی دیرکرد برای شارژهای بیش از ۳۰ روز معوق محاسبه شده است (late_fee_amount)", int(lf) > 0, f"{lf} ردیف", "P2",
      "ستون late_fee_amount هست اما هیچ کدی آن را پر نمی‌کند؛ total_amount هرگز جریمه ندارد")

# ════════════════════════════════════════════════════════════════════════════
# ۳. قفل بدهکاری (قوانین برج) با ساعت واقعی
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۳. قوانین بدهکاری ═══")
tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()


def amenity_locked(uid, aid):
    s, b = call("facility", "GET", f"/amenities/{aid}/slots?date={tomorrow}", token=res_tok[uid])
    return s, b


def try_book(uid, aid, day_offset=3, hour=10, hours=1):
    start = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=day_offset)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return call("facility", "POST", "/reservations", {"amenity_id": aid, "start": start.isoformat().replace("+00:00", "Z"), "hours": hours}, token=res_tok[uid])


for kind, idxs, expect in [("good", [0], False), ("late", [5], False), ("debtor", [7], True), ("chronic", [9], True), ("partial", [10], True)]:
    i = idxs[0]
    s, b = try_book(UID[i], AM["pool"], day_offset=4 + i)
    locked = s == 403 and isinstance(b, dict) and b.get("code") == "debtor_restricted"
    check("debtor", f"واحد {UNO[i]} ({kind}): رزرو استخر {'بسته' if expect else 'باز'} است", locked == expect, (s, b), "P1")
s, b = call("facility", "POST", "/reservations", {"amenity_id": AM["gym"], "start": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=3)).replace(hour=9, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")}, token=res_tok[UID[9]])
check("debtor", "بدهکار می‌تواند باشگاه (قفل‌نشده) را رزرو کند", s in (200, 201), (s, b), "P2")
od = sql(f"SELECT residency.unit_overdue_days('{UID[9]}')") if False else None
# بدهکار با پرداخت همه، همان لحظه آزاد شود
for period in PERIODS:
    cid = charge_ids[(UID[9], period)]
    pay(res_tok[UID[9]], TID, cid, True)
s, b = try_book(UID[9], AM["pool"], day_offset=6)
check("debtor", "بعد از تسویه‌ی کامل، قفل فوراً برداشته می‌شود", s in (200, 201), (s, b), "P1")
# مرز مهلت: واحدِ late با مهلت ۲۳ → بسته، ۲۴ → باز
od_late = int(sql(f"SELECT residency.unit_overdue_days('{UID[5]}')"))
for grace, exp_locked in [(od_late, True), (od_late + 1, False)]:
    call("identity", "PUT", f"/buildings/{BID}/rules", {"debtor_grace_days": grace, "restrictions": {f"amenity:{AM['pool']}": True}}, token=admin)
    s, b = try_book(UID[5], AM["pool"], day_offset=9 + grace % 5, hour=12)
    locked = s == 403 and isinstance(b, dict) and b.get("code") == "debtor_restricted"
    check("debtor", f"مرز مهلت: {od_late} روز تأخیر با مهلت {grace} → {'بسته' if exp_locked else 'باز'}", locked == exp_locked, (s, b), "P1")
call("identity", "PUT", f"/buildings/{BID}/rules", {"debtor_grace_days": 30, "restrictions": {f"amenity:{AM['pool']}": True, "module:food": True}}, token=admin)
# مدیر و مسئول مشاعات مستثنی‌اند
start = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=11)).replace(hour=14, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
s, b = call("facility", "POST", "/reservations", {"amenity_id": AM["pool"], "start": start, "unit_id": UID[7]}, token=STAFF["amenity_desk"])
check("debtor", "مسئول مشاعات می‌تواند برای واحد بدهکار ثبت دستی کند", s in (200, 201), (s, b))

# ════════════════════════════════════════════════════════════════════════════
# ۴. رزرو: قوانین، رقابت هم‌زمان، تأیید
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۴. رزرو مشاعات ═══")
# سقف ۲ رزرو در هفته از مسیر v2 (همانی که UI استفاده می‌کند)
good = UID[1]
codes = []
for k in range(4):
    s, b = try_book(good, AM["pool"], day_offset=2 + k, hour=8 + k)
    codes.append(s)
check("booking", "سقف «۲ رزرو در هفته» روی مسیر POST /reservations رعایت می‌شود", codes.count(201) + codes.count(200) <= 2, codes, "P1",
      "قانون رزرو (max_bookings_per_unit_per_period) فقط روی مسیر قدیمی /amenities/:id/reservations اعمال می‌شود؛ مسیر v2 که UI می‌زند آن را نادیده می‌گیرد")
far = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=90)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
s, b = call("facility", "POST", "/reservations", {"amenity_id": AM["pool"], "start": far}, token=res_tok[UID[2]])
check("booking", "رزرو ۹۰ روز آینده (حداکثر پیش‌رزرو ۳۰ روز) رد می‌شود", s in (400, 409, 422), (s, b), "P2",
      "پنجره‌ی حداکثر پیش‌رزرو (max_advance_days) روی مسیر v2 اعمال نمی‌شود")
soon = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10)).isoformat().replace("+00:00", "Z")
s, b = call("facility", "POST", "/reservations", {"amenity_id": AM["pool"], "start": soon}, token=res_tok[UID[2]])
check("booking", "رزرو ۱۰ دقیقه‌ی بعد (حداقل اطلاع ۱ ساعت) رد می‌شود", s in (400, 409, 422), (s, b), "P2",
      "حداقل زمان اطلاع‌رسانی (min_advance_hours) روی مسیر v2 اعمال نمی‌شود")

# هم‌زمانی: ۲۵ درخواست هم‌زمان برای یک بازه
slot = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=5)).replace(hour=18, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
outs = []
good_units = [u for k, u in enumerate(UID) if PROFILE[k] == "good"] + [UID[9]]


def worker(uid):
    outs.append(call("facility", "POST", "/reservations", {"amenity_id": AM["gym"], "start": slot}, token=res_tok[uid])[0])


ths = [threading.Thread(target=worker, args=(good_units[k % len(good_units)],)) for k in range(25)]
[t.start() for t in ths]
[t.join() for t in ths]
ok_n = sum(1 for c in outs if c in (200, 201))
check("booking", f"۲۵ درخواست هم‌زمان برای یک بازه → فقط ۱ موفق (موفق: {ok_n})", ok_n == 1, sorted(outs), "P0")
check("booking", "هیچ خطای ۵۰۰ در رقابت هم‌زمان نیست", all(c < 500 for c in outs), [c for c in outs if c >= 500], "P1")

# مشاع نیازمند تأیید
s, b = call("facility", "POST", "/reservations", {"amenity_id": AM["hall"], "start": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)).replace(hour=19, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z"), "hours": 1}, token=res_tok[UID[3]])
mh = sql(f"SELECT max_hours::text||'/'||slot_hours::text FROM facility.amenities WHERE id='{AM['hall']}'")
s2_, b2_ = call("facility", "POST", "/amenities", {"name": "سالن ۴ ساعته", "type": "hall", "requiresApproval": True, "maxHours": 4, "slotHours": 2}, token=admin)
mh2 = sql(f"SELECT max_hours::text||'/'||slot_hours::text FROM facility.amenities WHERE id='{b2_['id']}'") if isinstance(b2_, dict) and b2_.get("id") else "?"
check("booking", "مدیر می‌تواند حداکثر ساعت/طول اسلات هر مشاع را تنظیم کند", mh2 != mh and mh2 != "?", f"پیش‌فرض {mh} · بعد از ارسال maxHours/slotHours={mh2}", "P2",
      "API ساخت/ویرایش مشاع max_hours و slot_hours را نمی‌پذیرد؛ همه‌ی مشاعات یک‌ساعته می‌مانند (سالن ۲-۴ ساعته غیرممکن)")
check("booking", "رزرو سالن در حالت «در انتظار تأیید» ثبت می‌شود", s in (200, 201) and b.get("status") == "pending", (s, b), "P1")
rid = b.get("id") if isinstance(b, dict) else None
if rid:
    s, b = call("facility", "POST", f"/reservations/{rid}/approve", token=res_tok[UID[3]])
    check("booking", "ساکن نمی‌تواند رزرو را تأیید کند", s == 403, s, "P0")
    s, b = call("facility", "POST", f"/reservations/{rid}/approve", token=STAFF["kitchen"])
    check("booking", "کارمند آشپزخانه نمی‌تواند رزرو را تأیید کند", s == 403, s, "P1")
    s, b = call("facility", "POST", f"/reservations/{rid}/approve", token=STAFF["amenity_desk"])
    check("booking", "مسئول مشاعات تأیید می‌کند", s == 200, (s, b), "P1")
    s, b = call("facility", "POST", f"/reservations/{rid}/approve", token=STAFF["amenity_desk"])
    check("booking", "تأیید دوباره → 409", s == 409, (s, b))

# ════════════════════════════════════════════════════════════════════════════
# ۵. شش «ماه» عملیات روزمره: مهمان، بسته، سفارش غذا، لاگ
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۵. عملیات ماهانه‌ی نگهبانی/مشاعات (۶ دور) ═══")
guard_tok = STAFF["security"]
for m in range(6):
    for k in range(4):
        uid = UID[(m * 4 + k) % 12]
        s, b = call("guard", "POST", f"/units/{uid}/guest-passes", {"guestName": f"مهمان {m}-{k}", "validUntil": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=6)).isoformat().replace("+00:00", "Z")}, token=res_tok[uid])
        if m == 0 and k == 0:
            check("ops", "ساکن کد مهمان می‌سازد", s in (200, 201), (s, b), "P1")
    s, b = call("fnb", "GET", "/fnb/venues", token=res_tok[UID[0]])
    # ثبت‌های ماه به ۳۰ روز قبل منتقل می‌شوند (گذر زمان)
    sql(f"UPDATE facility.reservations SET start_at=start_at-interval '30 days', end_at=end_at-interval '30 days' WHERE tenant_id='{BID}'")
    sql(f"UPDATE guard.guest_passes SET created_at=created_at-interval '30 days' WHERE tenant_id='{BID}'")
n_res = sql(f"SELECT count(*) FROM facility.reservations WHERE tenant_id='{BID}'")
observe("ops", "پایان ۶ دور عملیات ماهانه", f"رزروهای ساختمان: {n_res}")

# ── جریان نگهبانی (چون نقش guard در ساختمان تازه قابل‌ساخت نیست، با نقش مدیر)
print("   (نگهبانی با توکن مدیر چون نقش guard برای ساختمان تازه وجود ندارد)")
uid = UID[2]
s, gp = call("guard", "POST", f"/units/{uid}/guest-passes", {"guestName": "میهمان فلان", "validUntil": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=3)).isoformat().replace("+00:00", "Z")}, token=res_tok[uid])
code = (gp or {}).get("code") or (gp or {}).get("pass_code") or (gp or {}).get("qr_code")
if isinstance(gp, dict) and gp.get("id"):
    s, b = call("guard", "GET", f"/guest-passes/verify?code={code}", token=admin)
    check("guard", "نگهبان کد مهمان معتبر را تأیید می‌کند", s == 200 and b.get("ok"), (s, b), "P1")
    s, b = call("guard", "POST", f"/guest-passes/{gp['id']}/check-in", token=admin)
    check("guard", "ثبت ورود مهمان", s in (200, 201), (s, b), "P1")
    s, b = call("guard", "POST", f"/guest-passes/{gp['id']}/check-in", token=admin)
    check("guard", "استفاده‌ی دوباره از کد → 400", s == 400, (s, b))
s, gp2 = call("guard", "POST", f"/units/{uid}/guest-passes", {"guestName": "گذشته", "validUntil": (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat().replace("+00:00", "Z")}, token=res_tok[uid])
check("guard", "کد مهمانِ با اعتبار گذشته (validUntil در گذشته) ساخته نمی‌شود", s in (400, 422), (s, gp2), "P2", "ساخت کد مهمان با تاریخ انقضای گذشته پذیرفته می‌شود")
s, b = call("guard", "POST", f"/units/{UID[11]}/guest-passes", {"guestName": "غریبه", "validUntil": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=3)).isoformat().replace("+00:00", "Z")}, token=res_tok[UID[0]])
check("security", "ساکن برای واحد دیگران کد مهمان نمی‌سازد", s == 403, (s, b), "P1")
for k in range(3):
    s, b = call("guard", "POST", "/parcels", {"unitId": UID[k], "courierCompany": "پست", "trackingCode": f"TRK{k}"}, token=admin)
    check("guard", f"ثبت بسته {k + 1}", s in (200, 201), (s, b), "P1")
    if k == 0 and isinstance(b, dict):
        s, b = call("guard", "POST", f"/parcels/{b['id']}/pickup-confirm", token=admin)
        check("guard", "تحویل بسته", s in (200, 201), (s, b), "P1")
s, b = call("guard", "POST", "/parcels", {"unitId": str(uuid.uuid4()), "courierCompany": "پست"}, token=admin)
check("guard", "بسته برای واحد ناموجود رد می‌شود (4xx نه 500/ثبت یتیم)", 400 <= s < 500, (s, b), "P2", "ثبت بسته برای unitId ناموجود/ساختمان دیگر پذیرفته می‌شود")

# ── کدهای مهمان و امنیت نقش‌ها
s, b = call("guard", "GET", "/guest-passes/verify?code=NOPE", token=res_tok[UID[0]])
check("security", "ساکن نمی‌تواند کد مهمان را استعلام کند", s == 403, s, "P1")

# ════════════════════════════════════════════════════════════════════════════
# ۶. ایزوله‌سازی بین ساختمان‌ها
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۶. ایزوله‌سازی ساختمان‌ها ═══")
t_demo, s, b = login("resident@borj-aftab.test", "Passw0rd!", "borj-aftab")
if t_demo:
    s, b = call("finance", "GET", f"/units/{UID[0]}/charges", token=t_demo)
    check("isolation", "ساکن ساختمان دمو شارژهای ساختمان شبیه‌سازی را نمی‌بیند", s in (403, 404) or b == [], (s, len(b) if isinstance(b, list) else b), "P0")
    s, b = call("facility", "GET", f"/amenities/{AM['pool']}/slots?date={tomorrow}", token=t_demo)
    check("isolation", "مشاع ساختمان دیگر از ساختمان دمو قابل‌دسترس نیست", s in (403, 404), (s, b), "P0")
    s, b = call("facility", "POST", "/reservations", {"amenity_id": AM["pool"], "start": slot}, token=t_demo)
    check("isolation", "رزرو مشاع ساختمان دیگر ممکن نیست", s in (403, 404), (s, b), "P0")
s, b = call("property", "GET", "/units", token=admin)
check("isolation", "مدیر ساختمان فقط ۱۲ واحد خودش را می‌بیند", s == 200 and len(b) == 12, len(b) if isinstance(b, list) else b, "P0")
s, b = call("identity", "GET", f"/buildings/{BID}/rules", token=t_demo) if t_demo else (0, None)
check("isolation", "ساکن ساختمان دیگر قوانین این ساختمان را نمی‌بیند", s in (401, 403, 404), (s, b), "P1")

# ════════════════════════════════════════════════════════════════════════════
# ۷. لاگ audit در عبور از ماه‌ها
# ════════════════════════════════════════════════════════════════════════════
print("\n═══ ۷. پارتیشن‌های audit ═══")
parts = sql("SELECT string_agg(c.relname, ',' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='audit' AND c.relname LIKE 'event_logs_2%'")
observe("audit", "پارتیشن‌های موجود", parts)
last = parts.split(",")[-1] if parts else ""
future = "2027-03-15"
fut_ok = True
try:
    sql(f"INSERT INTO audit.event_logs (tenant_id, occurred_at, session_id, source, level, action) VALUES ('{BID}', '{future} 10:00+00', gen_random_uuid(), 'sim', 'info', 'sim.future') ")
except RuntimeError as e:
    fut_ok = False
    err = str(e)
check("audit", f"درج لاگ برای ماه خارج از پارتیشن‌های موجود ({future}) ممکن است", fut_ok, locals().get("err", ""), "P1",
      "پارتیشن audit فقط تا ۳ ماه جلوتر ساخته می‌شود و maintain-audit-partitions.sh هیچ‌جا زمان‌بندی نشده (نه docker-compose، نه install.sh)؛ بعد از آن لاگ‌ها بی‌صدا از دست می‌روند")
ahead = int(sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='audit' AND c.relkind='r' AND c.relname ~ '^event_logs_[0-9]{4}_[0-9]{2}$' AND c.relname >= 'event_logs_' || to_char(current_date,'YYYY_MM')"))
check("audit", "پارتیشن ماهانه‌ی audit به‌صورت خودکار برای ≥ ۶ ماه آینده ساخته می‌شود (بدون کرون بیرونی)", ahead >= 6, f"{ahead} پارتیشن از ماه جاری به بعد", "P1",
      "کرون ماهانه‌ی maintain-audit-partitions.sh هیچ‌جا زمان‌بندی نشده و پارتیشن فقط ۳ ماه آینده ساخته می‌شود")
s, b = call("audit", "GET", "/audit/logs", token=admin)
check("audit", "مدیر لاگ ساختمان خودش را می‌بیند", s == 200, (s, str(b)[:100]), "P2")
if s == 200 and isinstance(b, (list, dict)):
    rows = b if isinstance(b, list) else b.get("items") or b.get("rows") or b.get("logs") or []
    other = [r for r in rows if isinstance(r, dict) and r.get("tenant_id") not in (None, BID)]
    check("isolation", "لاگ‌های ساختمان‌های دیگر در پاسخ مدیر نیست", not other, len(other), "P0")

# ── ردپای audit از رویدادهای این ساختمان
time.sleep(2)
acts = sql(f"SELECT string_agg(action||'='||n, ', ') FROM (SELECT action, count(*) n FROM audit.event_logs WHERE tenant_id='{BID}' GROUP BY action ORDER BY n DESC LIMIT 12) x")
observe("audit", "رویدادهای ثبت‌شده در audit برای این ساختمان", acts or "هیچ")
check("audit", "پرداخت‌ها در audit ثبت می‌شوند", "payment" in (acts or ""), acts, "P2", "رویداد payment.succeeded در لاگ audit دیده نمی‌شود")
check("audit", "صدور شارژ در audit ثبت می‌شود", "charge" in (acts or ""), acts, "P2", "رویداد charge.generated در لاگ audit دیده نمی‌شود")

# ════════════════════════════════════════════════════════════════════════════
# گزارش
# ════════════════════════════════════════════════════════════════════════════
p = sum(1 for r in results if r[2])
f = len(results) - p
print(f"\nنتیجه: {p} قبول / {f} رد  (ساختمان تست: {SUB}, tenant={BID})")
order = {"P0": 0, "P1": 1, "P2": 2, "INFO": 3}
findings.sort(key=lambda x: order.get(x["sev"], 9))
json.dump(dict(subdomain=SUB, tenant_id=BID, passed=p, failed=f, findings=findings, checks=results), open("/tmp/sim_report.json", "w"), ensure_ascii=False, indent=1, default=str)
with open("/tmp/sim_report.md", "w") as fh:
    fh.write(f"# گزارش شبیه‌سازی ۶ ماهه\n\n{p} قبول / {f} رد\n\n")
    for x in findings:
        fh.write(f"- **{x['sev']}** [{x['group']}] {x['title']}\n  - {x['detail']}\n")
