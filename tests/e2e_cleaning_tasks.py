#!/usr/bin/env python3
"""دپارتمان نظافت با مسئول: درخواست ساکن ← مسئول ← واگذاری ← نظافتچی (identity :3001 + facility :3003).
اجرا:  DB_NAME=pms_clean python3 tests/e2e_cleaning_tasks.py
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
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def check(name, cond, extra=''):
    global ok, bad
    if cond: ok += 1; print(f'  ✓ {name}')
    else: bad += 1; print(f'  ✗ {name} {extra}')

def login(user, pw=PW):
    s, r = call('POST', f'{ID}/auth/login', {'email': user, 'password': pw, 'tenantSubdomain': 'borj-aftab'})
    assert s in (200, 201), (user, s, r)
    return r['accessToken'] if 'accessToken' in r else r['access_token']

def sql(q): return subprocess.run(['su', 'postgres', '-c', f'psql -d {DB} -At -q'], input=q, capture_output=True, text=True).stdout.strip()

iso = lambda d: d.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
C = f'{FAC}/entitlements/cleaning'
tomorrow = (datetime.now(timezone(timedelta(hours=3, minutes=30))) + timedelta(days=1)).strftime('%Y-%m-%d')

sql('delete from entitlement.cleaning_tasks; delete from entitlement.cleaning_feedback; delete from entitlement.cleaning_sessions; delete from entitlement.usage_events')
sql("delete from notification.inbox where kind in ('cleaning_request','cleaning_task')")
admin = login('admin@borj-aftab.test')
call('POST', f'{FAC}/entitlements/config/apply-template', {'template': 'baran3', 'overwrite': False}, admin)
cleaner = login('cleaner'); hub = login('cleanhub'); boss = login('cleanboss'); lobby = login('lobby'); resident = login('resident@borj-aftab.test')
CLEANER_ID = sql("select id from identity.users where username='cleaner'")
HUB_ID = sql("select id from identity.users where username='cleanhub'")
s, me = call('GET', f'{FAC}/entitlements/me', None, resident); unit_id = me['unit']['id']

print('— دپارتمان و مسئول (هویت)')
s, staff = call('GET', f'{ID}/users/staff', None, admin)
rows = staff if isinstance(staff, list) else staff.get('items', staff)
byname = {x['username']: x for x in rows}
check('هر سه نفر در یک دپارتمان «cleaning» هستند', all(byname[u]['department'] == 'cleaning' for u in ('cleaner', 'cleanhub', 'cleanboss')), [byname[u]['department'] for u in ('cleaner', 'cleanhub', 'cleanboss')])
check('مسئول: isDeptHead و دسترسی cleaning_supervisor', byname['cleanboss']['isDeptHead'] and 'cleaning_supervisor' in byname['cleanboss']['effectivePermissions'], byname['cleanboss'])
check('کادر: دسترسی housekeeping، بدون cleaning_supervisor', 'housekeeping' in byname['cleaner']['effectivePermissions'] and 'cleaning_supervisor' not in byname['cleaner']['effectivePermissions'])
s, r = call('PATCH', f'{ID}/users/staff/{byname["cleaner"]["id"]}', {'department': 'cleaning_homes'}, admin); check('بخش «نظافت منازل» دیگر وجود ندارد (400)', s == 400, s)
s, r = call('PATCH', f'{ID}/users/staff/{byname["lobby"]["id"]}', {'isDeptHead': True}, admin); check('مسئول کردن عضو بخشی که مسئول ندارد ⇒ 400', s == 400, (s, r))
s, r = call('PATCH', f'{ID}/users/staff/{byname["cleanhub"]["id"]}', {'isDeptHead': True}, admin)
heads = sql("select string_agg(username, ',' order by username) from identity.users where department='cleaning' and is_dept_head")
check('مسئول جدید ⇒ مسئول قبلی خودکار برکنار (فقط یک مسئول)', s == 200 and heads == 'cleanhub', (s, heads))
s, r = call('PATCH', f'{ID}/users/staff/{byname["cleanboss"]["id"]}', {'isDeptHead': True}, admin); check('بازگرداندن مسئولیت', s == 200 and sql("select username from identity.users where department='cleaning' and is_dept_head") == 'cleanboss', (s, r))
boss = login('cleanboss'); hub = login('cleanhub')

print('— ساکن درخواست نظافت می‌دهد')
s, r = call('POST', f'{C}/me/requests', {'wantDate': '2020-01-01'}, resident); check('تاریخ گذشته ⇒ 400', s == 400, (s, r))
s, r = call('POST', f'{C}/me/requests', {'wantSlot': 'midnight'}, resident); check('بازه‌ی نامعتبر ⇒ 400', s == 400, (s, r))
s, req = call('POST', f'{C}/me/requests', {'wantDate': tomorrow, 'wantSlot': 'morning', 'note': 'لطفاً آشپزخانه را بیشتر'}, resident)
check('درخواست ثبت شد (جدید، بدون مسئول واگذاری)', s == 201 and req['status'] == 'new' and req['source'] == 'resident' and req['assignee_id'] is None, (s, req))
n = sql("select string_agg(recipient_role, ',' order by recipient_role) from notification.inbox where kind='cleaning_request'")
check('اعلان به مسئول نظافت و مدیر', n == 'admin,perm:cleaning_supervisor', n)
s, mine = call('GET', f'{C}/me/requests', None, resident); check('ساکن درخواستش را می‌بیند', s == 200 and len(mine['requests']) == 1, (s, mine))
s, _ = call('POST', f'{C}/me/requests', {}, cleaner); check('نظافتچی نمی‌تواند به‌جای ساکن درخواست دهد (403)', s == 403, s)
call('POST', f'{C}/me/requests', {}, resident); call('POST', f'{C}/me/requests', {}, resident)
s, r = call('POST', f'{C}/me/requests', {}, resident); check('سقف ۳ درخواست باز ⇒ 409', s == 409, (s, r))
s, c = call('POST', f'{C}/me/requests/{mine["requests"][0]["id"]}/cancel', None, resident); check('ساکن درخواست شروع‌نشده را لغو می‌کند', s == 200 and c['status'] == 'cancelled', (s, c))
sql("update entitlement.cleaning_tasks set status='cancelled' where source='resident' and id <> '%s'" % req['id'])
s, req = call('POST', f'{C}/me/requests', {'wantDate': tomorrow, 'wantSlot': 'morning', 'note': 'آشپزخانه'}, resident)

print('— مسئول نظافت: تابلو و واگذاری')
s, _ = call('GET', f'{C}/tasks/board', None, cleaner); check('نظافتچی تابلوی مسئول را نمی‌بیند (403)', s == 403, s)
s, _ = call('GET', f'{C}/tasks/board', None, lobby); check('لابی‌من نمی‌بیند (403)', s == 403, s)
s, _ = call('GET', f'{C}/tasks/board', None, resident); check('ساکن نمی‌بیند (403)', s == 403, s)
s, board = call('GET', f'{C}/tasks/board', None, boss)
check('مسئول: ۱ درخواست جدید + کادر نظافت (۳ نفر)', s == 200 and board['counts']['new'] == 1 and len(board['team']) == 3, (s, board['counts'], len(board['team'])))
check('مسئول سرگروه تیم است', board['team'][0]['full_name'] and board['team'][0]['is_dept_head'], board['team'][0])
s, bad_ = call('POST', f'{C}/tasks/{req["id"]}/assign', {'assigneeId': byname['lobby']['id']}, boss); check('واگذاری به غیر نظافتچی ⇒ 400', s == 400, (s, bad_))
s, a = call('POST', f'{C}/tasks/{req["id"]}/assign', {'assigneeId': CLEANER_ID}, boss)
check('واگذاری به نظافتچی', s == 200 and a['status'] == 'assigned' and a['assignee_id'] == CLEANER_ID, (s, a))
n = sql(f"select count(*) from notification.inbox where kind='cleaning_task' and recipient_login='{CLEANER_ID}'")
check('اعلان «کار جدید» به نظافتچی', n == '1', n)
n = sql("select count(*) from notification.inbox where kind='cleaning_request' and recipient_person is not null")
check('اعلان به ساکن که درخواستش در برنامه قرار گرفت', int(n) >= 1, n)

print('— کارهای دیگر: مشاعات و موردی')
s, r = call('POST', f'{C}/tasks', {'kind': 'common', 'title': ' '}, boss); check('مشاعات بدون محل ⇒ 400', s == 400, (s, r))
s, lob = call('POST', f'{C}/tasks', {'kind': 'common', 'title': 'لابی', 'assigneeId': HUB_ID, 'wantSlot': 'morning'}, boss)
check('کار مشاعات «نظافت لابی» به همکار سپرده شد', s == 201 and lob['title'] == 'نظافت لابی' and lob['status'] == 'assigned', (s, lob))
s, cus = call('POST', f'{C}/tasks', {'kind': 'custom', 'title': 'شست‌وشوی شیشه‌ها', 'details': 'سمت شمال'}, boss)
check('کار موردی بدون واگذاری در صف می‌ماند', s == 201 and cus['status'] == 'new', (s, cus))
s, r = call('POST', f'{C}/tasks', {'kind': 'unit'}, boss); check('کار منزل بدون واحد ⇒ 400', s == 400, (s, r))

print('— نظافتچی فقط کارهای خودش را می‌بیند')
s, my = call('GET', f'{C}/tasks/mine', None, cleaner)
check('فهرست کارهای من: فقط درخواست منزل', s == 200 and [t['id'] for t in my] == [req['id']], (s, my))
s, hmy = call('GET', f'{C}/tasks/mine', None, hub); check('همکار فقط کار لابی را می‌بیند', [t['id'] for t in hmy] == [lob['id']], hmy)
s, r = call('POST', f'{C}/tasks/{req["id"]}/start', None, hub); check('شروع کارِ دیگری ⇒ 404', s == 404, (s, r))
s, r = call('POST', f'{C}/tasks/{cus["id"]}/start', None, cleaner); check('شروع کارِ واگذارنشده ⇒ 404', s == 404, (s, r))

print('— اجرای کار منزل (ساعت ← سهمیه آفر)')
s, st = call('POST', f'{C}/tasks/{req["id"]}/start', None, cleaner)
check('شروع: کار در جریان و نظافت (جلسه) ساخته شد', s == 200 and st['status'] == 'in_progress' and st['session_id'], (s, st))
s, r = call('POST', f'{C}/tasks/{lob["id"]}/start', None, cleaner); check('شروع کار دیگران برای من ⇒ 404', s == 404, s)
sess = st['session_id']
sql(f"update entitlement.cleaning_sessions set started_at = now() - interval '50 minutes' where id='{sess}'")
s, fin = call('POST', f'{C}/{sess}/finish', {'note': 'انجام شد'}, cleaner)
check('پایان نظافت ⇒ جلسه done و ثبت مصرف', s == 200 and fin['session']['status'] == 'done', (s, fin))
status = sql(f"select status from entitlement.cleaning_tasks where id='{req['id']}'")
check('کار هم خودکار «انجام‌شده» شد', status == 'done', status)
s, r = call('POST', f'{C}/tasks/{req["id"]}/cancel', None, boss); check('کارِ انجام‌شده قابل لغو نیست ⇒ 409', s == 409, (s, r))
s, pend = call('GET', f'{C}/me/pending', None, resident); check('ساکن می‌تواند به همین نظافت نمره دهد', s == 200 and len(pend['pending']) == 1, pend)
s, v = call('POST', f'{C}/{sess}/void', None, cleaner)
status = sql(f"select status from entitlement.cleaning_tasks where id='{req['id']}'")
check('ابطال نظافت ⇒ کار دوباره در فهرست نظافتچی', s == 200 and status == 'assigned', (s, status))

print('— اجرای کار مشاعات (فقط زمان، بدون شارژ)')
s, st = call('POST', f'{C}/tasks/{lob["id"]}/start', None, hub); check('شروع لابی', s == 200 and st['status'] == 'in_progress' and st['session_id'] is None, (s, st))
s, r = call('POST', f'{C}/tasks/{lob["id"]}/start', None, hub); check('شروع دوباره ⇒ 409', s == 409, s)
s, r = call('POST', f'{C}/tasks/{lob["id"]}/undo', None, hub); check('برگرداندن شروع اشتباه', s == 200 and r['status'] == 'assigned', (s, r))
call('POST', f'{C}/tasks/{lob["id"]}/start', None, hub)
s, d = call('POST', f'{C}/tasks/{lob["id"]}/finish', {'note': 'تمیز شد'}, hub)
check('پایان: انجام‌شده با یادداشت', s == 200 and d['status'] == 'done' and d['done_note'] == 'تمیز شد', (s, d))
n = sql(f"select count(*) from entitlement.usage_events where source='cleaner' and status='active'")
check('هیچ مصرف/شارژی برای مشاعات ثبت نشد', n == '0', n)

print('— لغو و واگذاری دوباره')
s, a2 = call('POST', f'{C}/tasks/{cus["id"]}/assign', {'assigneeId': HUB_ID}, boss); check('کار موردی واگذار شد', s == 200 and a2['assignee_id'] == HUB_ID, (s, a2))
s, a3 = call('POST', f'{C}/tasks/{cus["id"]}/assign', {'assigneeId': CLEANER_ID}, boss); check('تغییر مسئول اجرا قبل از شروع', s == 200 and a3['assignee_id'] == CLEANER_ID, (s, a3))
s, cc = call('POST', f'{C}/tasks/{cus["id"]}/cancel', {'reason': 'دیگر لازم نیست'}, boss); check('لغو توسط مسئول', s == 200 and cc['status'] == 'cancelled', (s, cc))
s, r = call('POST', f'{C}/tasks/{cus["id"]}/assign', {'assigneeId': CLEANER_ID}, boss); check('کار لغوشده را نمی‌توان واگذار کرد ⇒ 409', s == 409, (s, r))
s, h = call('GET', f'{C}/tasks/board', None, admin); check('مدیر هم تابلو را می‌بیند', s == 200)

print(f'\n{ok} موفق · {bad} ناموفق'); sys.exit(1 if bad else 0)
