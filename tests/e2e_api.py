#!/usr/bin/env python3
"""تست سناریویی end-to-end کل API روی سرویس‌های در حال اجرا (همه ۸ سرویس)."""
import json, os, sys, hmac, hashlib, urllib.request, urllib.error, uuid, datetime as dt
H=os.environ.get("HOST","http://localhost")
P=dict(identity=3001,property=3002,facility=3003,finance=3004,guard=3005,notification=3006,audit=3007,fnb=3008)
results=[]
def call(svc,method,path,body=None,token=None,headers=None):
    req=urllib.request.Request(f"{H}:{P[svc]}{path}",method=method,data=json.dumps(body).encode() if body is not None else None)
    req.add_header("content-type","application/json")
    if token: req.add_header("Authorization",f"Bearer {token}")
    for k,v in (headers or {}).items(): req.add_header(k,v)
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            t=r.read().decode(); return r.status,(json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t=e.read().decode()
        try: return e.code,json.loads(t)
        except Exception: return e.code,t
def check(group,name,ok,detail=""):
    results.append((group,name,bool(ok),str(detail)[:160]))
    print(("✓" if ok else "✗"),f"[{group}] {name}", ("" if ok else f"  → {str(detail)[:200]}"))

T="borj-aftab"; tok={}
# ── ۱. احراز هویت
for r in ["admin","resident","guard","staff"]:
    s,b=call("identity","POST","/auth/login",{"email":f"{r}@borj-aftab.test","password":"Passw0rd!","tenantSubdomain":T})
    check("auth",f"ورود {r}",s in(200,201) and b["user"]["role"]==r,(s,b)); tok[r]=b.get("accessToken"); tok[r+"_rt"]=b.get("refreshToken")
s,b=call("identity","POST","/auth/platform-login",{"username":"behzad","password":"1234"}); tok["sa"]=b.get("accessToken")
check("auth","ورود سوپرادمین behzad",s in(200,201),(s,b))
s,b=call("identity","POST","/auth/login",{"email":"admin@borj-aftab.test","password":"wrongpass","tenantSubdomain":T}); check("auth","رمز غلط → 401",s==401,s)
s,b=call("identity","POST","/auth/login",{"email":"admin@borj-aftab.test","password":"Passw0rd!","tenantSubdomain":"nilufar"}); check("auth","کاربر مجتمع دیگر → 401",s==401,s)
s,b=call("identity","GET","/auth/me",token=tok["resident"]); check("auth","/auth/me",s==200 and b["role"]=="resident",(s,b))
s,b=call("identity","GET","/auth/me"); check("auth","بدون توکن → 401",s==401,s)
s,b=call("identity","GET","/auth/me",token=tok["admin_rt"]); check("auth","refreshToken نباید به‌جای accessToken پذیرفته شود",s==401,f"status={s}")
s,b=call("identity","POST","/auth/refresh",{"refreshToken":tok["admin"]}); check("auth","accessToken نباید به‌جای refreshToken پذیرفته شود",s==401,f"status={s}")
s,b=call("identity","POST","/auth/refresh",{"refreshToken":tok["admin_rt"]}); check("auth","refresh معتبر",s in(200,201),s)
# ── ۲. سوپرادمین
s,b=call("identity","GET","/platform/buildings",token=tok["sa"]); check("platform","لیست ساختمان‌ها",s==200,s)
s,b=call("identity","GET","/platform/buildings",token=tok["admin"]); check("platform","ادمین ساختمان → 403",s==403,s)
sub="t"+uuid.uuid4().hex[:8]
s,b=call("identity","POST","/platform/buildings",{"name":"برج تست","subdomain":sub,"tier":"professional","unitCount":40,"adminEmail":f"Admin@{sub}.test","adminPassword":"Str0ngPass!"},token=tok["sa"]); check("platform","ساخت ساختمان جدید + مدیر اولیه",s in(200,201),(s,b))
bid=b.get("id") if isinstance(b,dict) else None
s,b=call("identity","POST","/platform/buildings",{"name":"برج تست","subdomain":sub,"tier":"professional","unitCount":40},token=tok["sa"]); check("platform","subdomain تکراری → 409",s==409,s)
s,b=call("identity","POST","/platform/buildings",{"name":"x","subdomain":"t"+uuid.uuid4().hex[:8],"tier":"simple","unitCount":4,"adminEmail":"a@b.test","adminPassword":"123"},token=tok["sa"]); check("platform","رمز کوتاه مدیر → 400",s==400,s)
if bid:
    s,b=call("identity","PATCH",f"/platform/buildings/{bid}/settle",token=tok["sa"]); check("platform","تسویه",s==200,(s,b))
s,b=call("identity","POST","/auth/login",{"email":f"admin@{sub}.test","password":"Str0ngPass!","tenantSubdomain":sub}); check("platform","مدیر مجتمع تازه‌ساخته می‌تواند وارد شود",s in(200,201) and b["user"]["role"]=="admin",(s,b))
s,b=call("property","GET","/units",token=b.get("accessToken") if isinstance(b,dict) else None); check("platform","مجتمع جدید هیچ داده‌ای از مجتمع دیگر نمی‌بیند (RLS)",s==200 and b==[],(s,b))
# ── ۳. واحدها
s,b=call("property","GET","/units",token=tok["admin"]); check("property","لیست واحدها (ادمین)",s==200 and len(b)==3,(s,b if s!=200 else len(b)))
s,b=call("property","POST","/units",{"unitNumber":"999","floor":9,"areaSqm":80},token=tok["resident"]); check("property","ساکن نمی‌تواند واحد بسازد",s==403,s)
s,b=call("property","GET","/units/not-a-uuid",token=tok["admin"]); check("property","شناسه نامعتبر → 400 نه 500",s in(400,404),s)
# ── ۴. رزرو
U1="bbbbbbbb-0000-0000-0000-000000000001"; U3="bbbbbbbb-0000-0000-0000-000000000003"; AM="dddddddd-0000-0000-0000-000000000001"
s,b=call("facility","GET","/amenities",token=tok["resident"]); check("facility","لیست مشاعات",s==200 and len(b)>=3,s)
import random
start=(dt.datetime.utcnow()+dt.timedelta(days=random.randint(2,6))).replace(hour=random.randint(8,20),minute=0,second=0,microsecond=0)
s,b=call("facility","POST",f"/amenities/{AM}/reservations",{"unitId":U1,"startAt":start.isoformat()+"Z","endAt":(start+dt.timedelta(hours=1)).isoformat()+"Z"},token=tok["resident"]); check("facility","رزرو معتبر",s in(200,201),(s,b))
s,b=call("facility","POST",f"/amenities/{AM}/reservations",{"unitId":U3,"startAt":start.isoformat()+"Z","endAt":(start+dt.timedelta(hours=1)).isoformat()+"Z"},token=tok["guard"]); check("facility","رزرو هم‌پوشان → 409",s==409,(s,b))
s,b=call("facility","GET",f"/amenities/xyz/calendar?from=a&to=b",token=tok["resident"]); check("facility","پارامتر نامعتبر تقویم → 400 نه 500",s==400,s)
# ── ۵. مالی
CH="b1b1b1b1-0000-0000-0000-000000000001"
s,b=call("finance","GET",f"/units/{U1}/charges",token=tok["resident"]); check("finance","شارژهای واحد",s==200,s)
s,b=call("finance","POST","/payments/initiate",{"chargeId":CH},token=tok["resident"],headers={"Idempotency-Key":str(uuid.uuid4())}); check("finance","شروع پرداخت",s in(200,201),(s,b)); pid=b.get("id") if isinstance(b,dict) else None
TID="11111111-1111-1111-1111-111111111111"
if pid:
    s,b=call("finance","POST",f"/payments/webhook/zarinpal/{TID}",{"paymentId":pid,"success":True}); check("finance","webhook بدون امضا → 401",s==401,(s,b))
    sig=hmac.new(os.environ.get("PAYMENT_WEBHOOK_SECRET","local_webhook_secret").encode(),f"{TID}:{pid}:true".encode(),hashlib.sha256).hexdigest()
    s,b=call("finance","POST",f"/payments/webhook/zarinpal/{TID}",{"paymentId":pid,"success":True},headers={"X-Webhook-Signature":sig}); check("finance","webhook امضاشده → پرداخت موفق",s in(200,201) and b.get("status")=="success",(s,b))
    s,b=call("finance","GET",f"/units/{U1}/charges",token=tok["resident"]); check("finance","شارژ بعد از پرداخت «paid» شد",any(c["id"]==CH and c["status"]=="paid" for c in b),b)
    s,b=call("finance","POST","/payments/initiate",{"chargeId":CH},token=tok["resident"]); check("finance","پرداخت دوباره‌ی شارژ پرداخت‌شده → 409",s==409,s)
s,b=call("finance","POST","/charges/generate-monthly",{"period":"2026-11","formulaId":"a1a1a1a1-0000-0000-0000-000000000001"},token=tok["admin"]); check("finance","صدور شارژ ماهانه (gRPC به property)",s in(200,201) and b.get("generatedCount",0)>0,(s,b))
# ── ۶. نگهبانی
s,b=call("guard","GET","/guest-passes/verify?code=PMS-DEMO-001",token=tok["guard"]); check("guard","بررسی کد مهمان",s==200 and b.get("ok"),(s,b))
s,b=call("guard","POST",f"/units/{U1}/guest-passes",{"guestName":"مهمان تست","validUntil":(dt.datetime.utcnow()+dt.timedelta(hours=5)).isoformat()+"Z"},token=tok["resident"]); check("guard","ساکن برای واحد خودش کد مهمان صادر می‌کند",s in(200,201),(s,b)); gp=b.get("id") if isinstance(b,dict) else None
if gp:
    s,b=call("guard","POST",f"/guest-passes/{gp}/check-in",token=tok["guard"]); check("guard","نگهبان ورود مهمان را ثبت می‌کند",s in(200,201),(s,b))
    s,b=call("guard","POST",f"/guest-passes/{gp}/check-in",token=tok["guard"]); check("guard","استفاده‌ی دوباره از کد یک‌بارمصرف → 400",s==400,(s,b))
s,b=call("guard","POST",f"/units/{U3}/guest-passes",{"guestName":"x","validUntil":(dt.datetime.utcnow()+dt.timedelta(days=1)).isoformat()+"Z"},token=tok["resident"]); check("guard","ساکن نباید برای واحد دیگران کد مهمان صادر کند",s==403,f"status={s}")
s,b=call("guard","POST","/guest-passes/d1d1d1d1-0000-0000-0000-000000000001/check-in",token=tok["resident"]); check("guard","ساکن نباید بتواند ورود مهمان را ثبت کند (فقط نگهبان)",s==403,f"status={s}")
s,b=call("guard","GET","/guest-passes/verify?code=PMS-DEMO-001",token=tok["resident"]); check("guard","ساکن نباید کد مهمان را استعلام کند",s==403,s)
s,b=call("guard","POST","/parcels",{"unitId":U1,"courierCompany":"پست"},token=tok["guard"]); check("guard","ثبت مرسوله توسط نگهبان",s in(200,201),(s,b)); parcel=b.get("id") if isinstance(b,dict) else None
if parcel:
    s,b=call("guard","POST",f"/parcels/{parcel}/pickup-confirm",token=tok["guard"]); check("guard","تحویل مرسوله",s in(200,201),(s,b))
    s,b=call("guard","POST",f"/parcels/{parcel}/pickup-confirm",token=tok["guard"]); check("guard","تحویل دوباره → 404",s==404,s)
s,b=call("guard","POST","/parcels",{"unitId":U1,"courierCompany":"پست"},token=tok["resident"]); check("guard","ساکن نباید مرسوله ثبت کند",s==403,f"status={s}")
# ── ۷. رستوران
V=None
s,b=call("fnb","GET","/fnb/venues",token=tok["resident"]); check("fnb","لیست رستوران‌ها",s==200,s); V=b[0]["id"] if s==200 and b else None
if V:
    s,b=call("fnb","POST","/fnb/orders",{"venueId":V,"unitId":U1,"deliveryType":"in_unit","items":[{"itemId":"f3f3f3f3-0000-0000-0000-000000000001","quantity":2}]},token=tok["resident"]); check("fnb","ثبت سفارش",s in(200,201),(s,b)); oid=b.get("id") if isinstance(b,dict) else None
    s,b=call("fnb","POST","/fnb/orders",{"venueId":V,"unitId":U1,"deliveryType":"in_unit","items":[{"itemId":"f3f3f3f3-0000-0000-0000-000000000002","quantity":-5}]},token=tok["resident"]); check("fnb","تعداد منفی باید رد شود",s==400,f"status={s} total={b.get('total') if isinstance(b,dict) else b}")
    s,b=call("fnb","GET","/fnb/kitchen/queue",token=tok["staff"]); check("fnb","صف آشپزخانه (کارمند)",s==200,s)
    s,b=call("fnb","GET","/fnb/kitchen/queue",token=tok["resident"]); check("fnb","صف آشپزخانه برای ساکن → 403",s==403,s)
    if oid:
        s,b=call("fnb","PATCH",f"/fnb/orders/{oid}/status",{"status":"accepted"},token=tok["staff"]); check("fnb","تغییر وضعیت سفارش",s==200,(s,b))
        s,b=call("fnb","PATCH",f"/fnb/orders/{oid}/status",{"status":"delivered"},token=tok["staff"]); check("fnb","پرش غیرمجاز وضعیت → 409/400",s in(400,409),(s,b))
    s,b=call("fnb","POST","/fnb/orders",{"venueId":V,"unitId":U1,"deliveryType":"in_unit","items":[{"itemId":"f3f3f3f3-0000-0000-0000-000000000001","quantity":1}]},token=tok["resident"]); o2=b.get("id") if isinstance(b,dict) else None
    if o2:
        s,b=call("fnb","POST",f"/fnb/orders/{o2}/cancel",{},token=tok["guard"]); check("fnb","کاربر دیگر نمی‌تواند سفارش ساکن را لغو کند",s==404,s)
        s,b=call("fnb","POST",f"/fnb/orders/{o2}/cancel",{},token=tok["resident"]); check("fnb","ساکن سفارش خودش را لغو می‌کند",s in(200,201),(s,b))
# ── ۸. لاگ
s,b=call("audit","POST","/audit/client-batch",{"entries":[{"level":"info","event":"test","message":"hi"}]},token=tok["resident"]); check("audit","ارسال لاگ کلاینت",s in(200,201,202),(s,b))
s,b=call("audit","GET","/audit/logs",token=tok["admin"]); check("audit","مشاهده لاگ (ادمین)",s==200,s)
s,b=call("audit","GET","/audit/logs",token=tok["resident"]); check("audit","مشاهده لاگ برای ساکن → 403",s==403,s)
# ── ۹. ایزوله‌سازی
s,b=call("identity","POST","/auth/login",{"email":"admin@borj-aftab.test","password":"Passw0rd!","tenantSubdomain":T})
p=sum(1 for r in results if r[2]); f=len(results)-p
print(f"\nنتیجه: {p} قبول / {f} رد")
json.dump(results,open(os.environ.get("OUT","/tmp/e2e.json"),"w"),ensure_ascii=False,indent=1)
