#!/usr/bin/env python3
"""بازخورد ساکن از نظافت منزل (facility :3003 + identity :3001، دیتابیس seed‌شده، بعد از e2e_cleaning.py یا مستقل).
اجرا:  DB_NAME=pms_clean python3 tests/e2e_cleaning_feedback.py
"""
import json, os, subprocess, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

ID = os.environ.get('IDENTITY', 'http://localhost:3001')
FAC = os.environ.get('FACILITY', 'http://localhost:3003')
DB = os.environ.get('DB_NAME', 'pms')
ok = bad = 0

def call(method, url, body=None, token=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def check(name, cond, extra=''):
    global ok, bad
    if cond: ok += 1; print(f'  ✓ {name}')
    else: bad += 1; print(f'  ✗ {name} {extra}')

def login(user):
    s, r = call('POST', f'{ID}/auth/login', {'email': user, 'password': 'Passw0rd!', 'tenantSubdomain': 'borj-aftab'})
    assert s in (200, 201), (user, s, r)
    return r['accessToken']

def sql(q): return subprocess.run(['su', 'postgres', '-c', f'psql -d {DB} -At -q'], input=q, capture_output=True, text=True).stdout.strip()
iso = lambda d: d.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
C = f'{FAC}/entitlements/cleaning'

admin = login('admin@borj-aftab.test'); cleaner = login('cleaner'); boss = login('cleanboss'); lobby = login('lobby'); resident = login('resident@borj-aftab.test')
CLEANER_ID = sql("select id from identity.users where username='cleaner'")
def task_for(unit_id, token=None):
    """مسئول نظافت کار «نظافت منزل» را می‌چیند و به نظافتچی می‌سپارد"""
    s, r = call('POST', f'{C}/tasks', {'kind': 'unit', 'unitId': unit_id, 'assigneeId': CLEANER_ID}, token or boss)
    assert s == 201, (s, r)
    return r['id']
def manual(unit_id, st, en, note=None):
    tid = task_for(unit_id)
    return call('POST', f'{C}/tasks/{tid}/manual', {'startedAt': iso(st), 'endedAt': iso(en), **({'note': note} if note else {})}, cleaner)
def start(unit_id):
    tid = task_for(unit_id)
    return call('POST', f'{C}/tasks/{tid}/start', None, cleaner)

call('POST', f'{FAC}/entitlements/config/apply-template', {'template': 'baran3', 'overwrite': False}, admin)

s, me = call('GET', f'{FAC}/entitlements/me', None, resident)
unit_id = me['unit']['id']
sql('delete from entitlement.cleaning_tasks; delete from entitlement.cleaning_feedback; delete from entitlement.cleaning_sessions; delete from entitlement.usage_events')  # دیتابیس تست تمیز (نظافتچی بازهٔ هم‌پوشان ندارد)
sql("delete from notification.inbox where kind='cleaning_feedback'")

def clean(hours_ago_start):
    st = now - timedelta(hours=hours_ago_start)
    s, r = manual(unit_id, st, st + timedelta(minutes=45))
    assert s == 201, (s, r)
    return r['session']['id']

print('— ساکن: نظافتِ در انتظار نمره')
s1 = clean(10); s2 = clean(6); s3 = clean(3)
s, p = call('GET', f'{C}/me/pending', None, resident)
check('سه نظافت در انتظار نمره + فهرست دلیل‌های آماده', s == 200 and len(p['pending']) == 3 and len(p['reasons']) >= 5, (s, p))
s, _ = call('GET', f'{C}/me/pending', None, cleaner); check('نظافتچی به این بخش دسترسی ندارد (403)', s == 403, s)
s, _ = call('GET', f'{C}/me/pending'); check('بدون توکن 401', s == 401, s)

print('— نمره‌ی خوب: فقط ستاره')
s, r = call('POST', f'{C}/me/{s1}/feedback', {'rating': 5}, resident)
check('۵ ستاره بدون دلیل ثبت می‌شود', s == 201 and r['ok'], (s, r))
s, r = call('POST', f'{C}/me/{s1}/feedback', {'rating': 4}, resident)
check('نمره‌ی دوباره برای همان نظافت ⇒ 409', s == 409, (s, r))
inbox0 = sql("select count(*) from notification.inbox where kind='cleaning_feedback'")
check('نمره‌ی خوب اعلان بد نمی‌سازد', inbox0 == '0', inbox0)

print('— نمره‌ی بد: دلیل آماده یا نوشتنی')
s, r = call('POST', f'{C}/me/{s2}/feedback', {'rating': 2}, resident)
check('۲ ستاره بدون دلیل ⇒ 400 با پیام فارسی', s == 400 and 'دلیل' in json.dumps(r, ensure_ascii=False), (s, r))
s, r = call('POST', f'{C}/me/{s2}/feedback', {'rating': 2, 'reasons': ['hack']}, resident)
check('دلیل ناشناخته ⇒ 400', s == 400, (s, r))
s, r = call('POST', f'{C}/me/{s2}/feedback', {'rating': 7}, resident); check('نمره‌ی ۷ ⇒ 400', s == 400, (s, r))
s, r = call('POST', f'{C}/me/{s2}/feedback', {'rating': 2, 'reasons': ['not_clean', 'late']}, resident)
check('۲ ستاره با دو دلیل آماده', s == 201, (s, r))
s, r = call('POST', f'{C}/me/{s3}/feedback', {'rating': 1, 'comment': 'پنجره‌ها شسته نشد'}, resident)
check('۱ ستاره با دلیل نوشتنی', s == 201, (s, r))
n = sql("select count(*) from notification.inbox where kind='cleaning_feedback'")
check('هر بازخورد بد اعلان به مدیر و مسئول نظافت (۲ بازخورد × ۲ گیرنده)', n == '4', n)
roles = sql("select string_agg(distinct recipient_role, ',' order by recipient_role) from notification.inbox where kind='cleaning_feedback'")
check('گیرندگان: مدیر و مسئول نظافت', roles == 'admin,perm:cleaning_supervisor', roles)
s, p = call('GET', f'{C}/me/pending', None, resident); check('بعد از نمره‌دادن، موردی در انتظار نمی‌ماند', s == 200 and p['pending'] == [], p)

print('— امنیت: نظافت واحد دیگر / نظافت باطل / مهلت')
other = sql(f"select id from property.units where id <> '{unit_id}' limit 1")
st = now - timedelta(hours=2)
s, r = manual(other, st, st + timedelta(minutes=40))
s, x = call('POST', f'{C}/me/{r["session"]["id"]}/feedback', {'rating': 5}, resident)
check('نمره دادن به نظافت واحد دیگر ⇒ 404', s == 404, (s, x))
v = clean(20)
call('POST', f'{C}/{v}/void', None, cleaner)
s, x = call('POST', f'{C}/me/{v}/feedback', {'rating': 5}, resident); check('نظافت باطل‌شده نمره نمی‌گیرد ⇒ 409', s == 409, (s, x))
old = clean(30)
sql(f"update entitlement.cleaning_sessions set started_at=started_at - interval '20 days', ended_at=ended_at - interval '20 days' where id='{old}'")
s, x = call('POST', f'{C}/me/{old}/feedback', {'rating': 5}, resident); check('بعد از ۱۴ روز ⇒ 403', s == 403, (s, x))
s, x = call('POST', f'{C}/me/not-a-uuid/feedback', {'rating': 5}, resident); check('شناسه نامعتبر ⇒ 400', s == 400, (s, x))

print('— مسئول نظافت و مدیر')
s, L = call('GET', f'{C}/feedback', None, boss)
check('مسئول نظافت بازخوردها را می‌بیند', s == 200 and len(L['items']) == 3, (s, L))
check('میانگین نظافتچی: (۵+۲+۱)/۳ ≈ ۲٫۶۷ و ۲ بازخورد بد', len(L['summary']) == 1 and abs(L['summary'][0]['average'] - 2.67) < 0.01 and L['summary'][0]['low_count'] == 2, L['summary'])
check('دلیل‌ها و متن آزاد و نام نظافتچی', any(i['reasons'] == ['not_clean', 'late'] for i in L['items']) and any(i['comment'] == 'پنجره‌ها شسته نشد' for i in L['items']) and L['items'][0]['cleaner_name'], L['items'])
s, L2 = call('GET', f'{C}/feedback?low=1', None, admin); check('مدیر فقط بدها را فیلتر می‌کند (۲)', s == 200 and len(L2['items']) == 2, (s, L2))
s, _ = call('GET', f'{C}/feedback', None, cleaner); check('خود نظافتچی نمره‌ها را نمی‌بیند (403)', s == 403, s)
s, _ = call('GET', f'{C}/feedback', None, lobby); check('لابی‌من نمی‌بیند (403)', s == 403, s)
s, _ = call('GET', f'{C}/feedback', None, resident); check('ساکن فهرست کل را نمی‌بیند (403)', s == 403, s)
s, _ = call('GET', f'{C}/feedback?cleanerId=zzz', None, admin); check('cleanerId نامعتبر ⇒ 400', s == 400, s)
s, h = call('GET', f'{C}/home', None, boss); check('مسئول نظافت هم عضو دپارتمان است و پنل ثبت ساعت را دارد (200)', s == 200, s)

print(f'\n{ok} موفق · {bad} ناموفق'); sys.exit(1 if bad else 0)
