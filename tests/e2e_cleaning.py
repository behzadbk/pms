#!/usr/bin/env python3
"""سناریوی واقعیِ پنل «نظافت منازل» (facility :3003 + identity :3001، دیتابیس seed‌شده).
اجرا روی دیتابیس تازه:  DB_NAME=pms_clean python3 tests/e2e_cleaning.py
"""
import json, os, subprocess, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

ID = os.environ.get('IDENTITY', 'http://localhost:3001')
FAC = os.environ.get('FACILITY', 'http://localhost:3003')
DB = os.environ.get('DB_NAME', 'pms')
PW = 'Passw0rd!'
ok = bad = 0

def call(method, url, body=None, token=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def check(name, cond, extra=''):
    global ok, bad
    if cond: ok += 1; print(f'  ✓ {name}')
    else: bad += 1; print(f'  ✗ {name} {extra}')

def login(user):
    s, r = call('POST', f'{ID}/auth/login', {'email': user, 'password': PW, 'tenantSubdomain': 'borj-aftab'})
    assert s in (200, 201), (user, s, r)
    return r['accessToken'] if 'accessToken' in r else r['access_token']

def sql(q):
    return subprocess.run(['su', 'postgres', '-c', f'psql -d {DB} -At -q'], input=q, capture_output=True, text=True).stdout.strip()

iso = lambda d: d.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
C = f'{FAC}/entitlements/cleaning'

sql('delete from entitlement.cleaning_feedback; delete from entitlement.cleaning_sessions; delete from entitlement.usage_events')  # دیتابیس تست تمیز
print('— آماده‌سازی: الگوی آفرها (خدمت «خانه‌داری») توسط مدیر')
admin = login('admin@borj-aftab.test')
s, r = call('POST', f'{FAC}/entitlements/config/apply-template', {'template': 'baran3', 'overwrite': False}, admin)
check('apply-template', s in (200, 201), (s, r))

cleaner = login('cleaner'); hub = login('cleanhub'); lobby = login('lobby')

print('— دسترسی')
s, _ = call('GET', f'{C}/home', None, hub); check('نظافت مجموعه به پنل منازل دسترسی ندارد (403)', s == 403, s)
s, _ = call('GET', f'{C}/home', None, lobby); check('لابی‌من دسترسی ندارد (403)', s == 403, s)
s, _ = call('GET', f'{C}/home', None); check('بدون توکن 401', s == 401, s)
s, home = call('GET', f'{C}/home', None, cleaner); check('نظافتچی منازل home را می‌بیند', s == 200 and home['service']['configured'] and home['active'] is None, (s, home))

print('— انتخاب واحد')
s, units = call('GET', f'{C}/units', None, cleaner); check('فهرست واحدها', s == 200 and len(units) > 0, (s, units))
# واحدی با ساکن فعال (تا اعلان هم تست شود)؛ دومی هر واحد دیگری
res_unit = sql("select unit_id from residency.memberships where status='active' and role in ('head','adult','senior') limit 1")
u = next((x for x in units if x['id'] == res_unit), units[0])
units = [u] + [x for x in units if x['id'] != u['id']]
s, info = call('GET', f'{C}/units/{u["id"]}', None, cleaner)
line = info['line']
check('کارت سهمیه‌ی خانه‌داری', s == 200 and line and line['code'] == 'housekeeping', (s, info))
# سهمیه‌ی این سطح را کوچک می‌کنیم (مدیر از «آفرها و خدمات») تا سناریوی مازاد در سقف ۱۲ ساعت بیاید
s, cat = call('GET', f'{FAC}/entitlements/catalog', None, admin)
hk = next(x for x in cat['services'] if x['code'] == 'housekeeping')
s, q = call('PUT', f'{FAC}/entitlements/config/quotas', {'tierId': info['tier']['id'], 'serviceId': hk['id'], 'included': 3}, admin)
check('مدیر سهمیه‌ی سطح را ۳ ساعت می‌کند', s == 200, (s, q))
s, info = call('GET', f'{C}/units/{u["id"]}', None, cleaner); line = info['line']
check('کارت سهمیه فوراً ۳ ساعت را نشان می‌دهد', line['included'] == 3, line)
included = line['included']; print(f'    واحد {u["unit_number"]} · سهمیه {included} ساعت · مصرف {line["used"]}')
s, none = call('GET', f'{C}/units?q=zzzz', None, cleaner); check('جست‌وجوی بی‌نتیجه ⇒ لیست خالی', s == 200 and none == [])
s, _ = call('GET', f'{C}/units/not-a-uuid', None, cleaner); check('شناسه نامعتبر 400', s == 400, s)

print('— ثبت دستی داخل سهمیه (۲ ساعت، ظهر دیروز)')
yday_noon = (now - timedelta(days=1)).replace(hour=9, minute=0)   # ۹:۰۰ UTC ≈ ۱۲:۳۰ تهران ⇒ شیفت day
s, pv = call('POST', f'{C}/preview', {'unitId': u['id'], 'startedAt': iso(yday_noon), 'endedAt': iso(yday_noon + timedelta(hours=2))}, cleaner)
check('پیش‌نمایش: ۲ ساعت رایگان و بدون مبلغ', s == 200 and pv['free_qty'] == 2 and pv['overage_qty'] == 0 and pv['amount'] == 0 and pv['shift'] == 'day', (s, pv))
s, m1 = call('POST', f'{C}/manual', {'unitId': u['id'], 'startedAt': iso(yday_noon), 'endedAt': iso(yday_noon + timedelta(hours=2)), 'note': 'آشپزخانه و سالن'}, cleaner)
check('ثبت دستی موفق', s == 201 and m1['session']['status'] == 'done' and m1['result']['amount'] == 0, (s, m1))
s, info2 = call('GET', f'{C}/units/{u["id"]}', None, cleaner)
check('سهمیه ۲ ساعت کم شد', abs(info2['line']['used'] - line['used'] - 2) < 1e-6, info2['line'])
s, ov = call('POST', f'{C}/manual', {'unitId': u['id'], 'startedAt': iso(yday_noon + timedelta(hours=1)), 'endedAt': iso(yday_noon + timedelta(hours=3))}, cleaner)
check('هم‌پوشانی با نظافت قبلی ⇒ 409 با پیام فارسی', s == 409 and 'هم‌پوشانی' in json.dumps(ov, ensure_ascii=False), (s, ov))

print('— تایمر: شروع، شروع دوباره، پایان با مازاد (شیفت اضافه‌کاری)')
s, st = call('POST', f'{C}/start', {'unitId': u['id']}, cleaner)
check('شروع نظافت', s == 201 and st['status'] == 'running', (s, st))
sid = st['id']
s, again = call('POST', f'{C}/start', {'unitId': units[1]['id']}, cleaner)
check('شروع همزمان دوم ⇒ 409', s == 409 and 'در جریان' in json.dumps(again, ensure_ascii=False), (s, again))
s, h2 = call('GET', f'{C}/home', None, cleaner); check('home نظافتِ در جریان را برمی‌گرداند', h2['active'] and h2['active']['id'] == sid)
s, early = call('POST', f'{C}/{sid}/finish', {}, cleaner)
check('پایان زیر ۵ دقیقه ⇒ 400 روشن', s == 400 and 'کمتر از' in json.dumps(early, ensure_ascii=False), (s, early))
# شروع را به ۱۷:۳۰ تهران (۱۴:۰۰ UTC) امروز/دیروز می‌بریم تا شیفت overtime شود؛ مدت ۳ ساعت
over_start = (now - timedelta(days=1)).replace(hour=14, minute=0)
sql(f"update entitlement.cleaning_sessions set started_at='{iso(over_start)}' where id='{sid}'")
# سهمیه را تقریباً پر می‌کنیم: مصرف قبلی + ۲ ساعت = X ⇒ باقی‌مانده = included - X
rest = included - (line['used'] + 2)
s, pv2 = call('POST', f'{C}/preview', {'unitId': u['id'], 'startedAt': iso(over_start), 'endedAt': iso(over_start + timedelta(hours=rest + 1))}, cleaner)
check('پیش‌نمایش: ۱ ساعت مازاد با نرخ اضافه‌کاری ۱۸۰٬۰۰۰', s == 200 and pv2['overage_qty'] == 1 and pv2['amount'] == 180000 and pv2['shift'] == 'overtime', (s, pv2))
s, fin = call('POST', f'{C}/{sid}/finish', {'endedAt': iso(over_start + timedelta(hours=rest + 1)), 'note': 'ظرف‌ها هم شسته شد'}, cleaner)
check('پایان: ثبت و مازاد دقیقاً مثل پیش‌نمایش', s == 200 and fin['result']['amount'] == 180000 and fin['result']['overage_qty'] == 1 and fin['session']['status'] == 'done', (s, fin))
s, again2 = call('POST', f'{C}/{sid}/finish', {}, cleaner); check('پایان دوباره ⇒ 409', s == 409, s)

print('— صورت‌حساب و ریشه‌ی مالی (همان موتور آفرها)')
n = sql(f"select count(*) from entitlement.usage_events where unit_id='{u['id']}' and service_id=(select id from entitlement.services where code='housekeeping') and status='active' and source='cleaner'")
check('دو مصرف با منبع cleaner در موتور آفرها', n == '2', n)
amt = sql(f"select coalesce(sum(amount),0) from entitlement.usage_events where unit_id='{u['id']}' and status='active'")
check('مجموع مازاد واحد = ۱۸۰٬۰۰۰', float(amt) == 180000, amt)
notif = sql("select count(*) from notification.inbox where kind='entitlement_cleaning'") if sql("select to_regclass('notification.inbox')") else '0'
check('اعلان «نظافت منزل انجام شد» برای ساکن', int(notif or 0) >= 1, notif)

print('— لغو و ابطال')
s, st2 = call('POST', f'{C}/start', {'unitId': units[1]['id']}, cleaner)
s, c = call('POST', f'{C}/{st2["id"]}/cancel', None, cleaner)
check('لغو شروع اشتباه ⇒ هیچ مصرفی ثبت نمی‌شود', s == 200 and c['status'] == 'cancelled' and sql(f"select count(*) from entitlement.usage_events where unit_id='{units[1]['id']}' and source='cleaner'") == '0', (s, c))
s, v = call('POST', f'{C}/{fin["session"]["id"]}/void', None, cleaner)
check('ابطال نظافتِ ثبت‌شده', s == 200 and v['status'] == 'void', (s, v))
amt2 = sql(f"select coalesce(sum(amount),0) from entitlement.usage_events where unit_id='{u['id']}' and status='active'")
check('بعد از ابطال مازاد صفر می‌شود', float(amt2) == 0, amt2)
s, hist = call('GET', f'{C}/mine', None, cleaner); check('تاریخچه', s == 200 and len(hist) >= 2, (s, hist))

print('— اعتبارسنجی ورودی')
fut = now + timedelta(hours=3)
s, f = call('POST', f'{C}/manual', {'unitId': u['id'], 'startedAt': iso(now - timedelta(hours=1)), 'endedAt': iso(fut)}, cleaner); check('پایان در آینده ⇒ 400', s == 400, (s, f))
s, f = call('POST', f'{C}/manual', {'unitId': u['id'], 'startedAt': iso(now - timedelta(days=5)), 'endedAt': iso(now - timedelta(days=5) + timedelta(hours=1))}, cleaner); check('ثبت دستی بیش از ۴۸ ساعت قبل ⇒ 400', s == 400, (s, f))
s, f = call('POST', f'{C}/manual', {'unitId': u['id'], 'startedAt': iso(now - timedelta(hours=20)), 'endedAt': iso(now - timedelta(hours=40))}, cleaner); check('پایان قبل از شروع ⇒ 400', s == 400, (s, f))
s, f = call('POST', f'{C}/start', {'unitId': '00000000-0000-0000-0000-000000000000'}, cleaner); check('واحد ناموجود ⇒ 404', s == 404, (s, f))

print('— مدیر هم می‌تواند')
s, h = call('GET', f'{C}/home', None, admin); check('مدیر دسترسی دارد', s == 200)

print(f'\n{ok} موفق · {bad} ناموفق'); sys.exit(1 if bad else 0)
