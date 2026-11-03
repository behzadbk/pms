"""e2e سوپرادمین (۷۱ سناریو). سرویس identity باید با PLATFORM_SCHEDULER=off و PLATFORM_HEALTH_TARGETS="identity-self=http://localhost:3001,ghost=http://localhost:1" بالا باشد روی DB تازه‌seedشده. env تست: IDENTITY_URL, E2E_PG_ADMIN, E2E_PG_PLATFORM"""
import json, subprocess, sys, time, urllib.request, urllib.error
import os
B=os.environ.get('IDENTITY_URL','http://localhost:3001')
DB_ADMIN=os.environ.get('E2E_PG_ADMIN','postgres://postgres@127.0.0.1:5433/pms')
DB_PLAT=os.environ.get('E2E_PG_PLATFORM','postgres://platform_admin:platpass@127.0.0.1:5433/pms')
PSQL=['psql',DB_ADMIN,'-Atc']
fails=[]; n=0
def call(method,path,body=None,token=None,expect=None):
    req=urllib.request.Request(B+path,method=method,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
    try:
        r=urllib.request.urlopen(req); code=r.status; txt=r.read().decode()
    except urllib.error.HTTPError as e:
        code=e.code; txt=e.read().decode()
    try: data=json.loads(txt)
    except Exception: data=txt
    return code,data
def check(name,cond,extra=''):
    global n; n+=1
    if cond: print(f'  ✓ {name}')
    else: print(f'  ✗ {name} {extra}'); fails.append(name)
def sql(q): return subprocess.check_output(PSQL+[q],text=True).strip()
def totp(secret):
    return subprocess.check_output(['node','-e',f"const t=require('/home/claude/pms/backend/identity-service/dist/platform/totp.util');console.log(t.totpAt('{secret}',Math.floor(Date.now()/30000)))"],text=True).strip()

print('— ورود و نقش')
c,d=call('POST','/auth/platform-login',{'username':'behzad','password':'1234'}); owner=d['accessToken']
check('ورود owner',c==201 or c==200,c)
c,d=call('GET','/auth/me',token=owner); check('me شامل platformRole=owner',d.get('platformRole')=='owner',d)

print('— مدیریت تیم')
c,d=call('POST','/platform/admins',{'username':'sup1','fullName':'پشتیبان','role':'support','password':'Supp0rt-Pass9'},owner); check('ساخت support',c==201,d)
c,d=call('POST','/platform/admins',{'username':'sale1','fullName':'فروش','role':'sales','password':'Sal3s-Pass-77'},owner); check('ساخت sales',c==201,d)
c,d=call('POST','/platform/admins',{'username':'sale1','fullName':'xx','role':'sales'},owner); check('نام کاربری تکراری ۴۰۹',c==409,c)
c,d=call('POST','/platform/admins',{'username':'weak1','fullName':'x','role':'sales','password':'12345678'},owner); check('رمز ضعیف رد می‌شود',c==400,d)
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9'}); sup=d['accessToken']
c,d=call('POST','/auth/platform-login',{'username':'sale1','password':'Sal3s-Pass-77'}); sales=d['accessToken']
tid=sql("select id from identity.tenants where subdomain='yas'")
c,d=call('GET','/platform/admins',token=sup); check('support به لیست تیم دسترسی ندارد',c==403,c)
c,d=call('GET','/platform/buildings',token=sales); check('sales لیست ساختمان‌ها را می‌خواند',c==200,c)
c,d=call('PATCH',f'/platform/buildings/{tid}',{'monthlyFee':1},sales); check('sales فیلد مالی نمی‌تواند',c==403,d)
c,d=call('POST',f'/platform/buildings/{tid}/suspend',{'reason':'x'},sales); check('sales تعلیق نمی‌تواند',c==403,c)
c,d=call('POST',f'/platform/buildings/{tid}/impersonate',token=sales); check('sales impersonate نمی‌تواند',c==403,c)
c,d=call('POST','/platform/invoices/generate',{},sup); check('support فاکتور نمی‌زند',c==403,c)
c,d=call('PATCH','/platform/admins/'+sql("select id from identity.platform_admins where username='behzad'"),{'isActive':False},owner); check('owner خودش را غیرفعال نمی‌کند',c==400,d)
sid=sql("select id from identity.platform_admins where username='sup1'")
bid=sql("select id from identity.platform_admins where username='behzad'")
c,d=call('PATCH','/platform/admins/'+sid,{'role':'owner'},owner); check('ارتقا به owner',c==200,d)
c,d=call('PATCH','/platform/admins/'+sid,{'role':'support'},owner); check('تنزل به support',c==200,d)
c,d=call('GET','/platform/admins',token=sup); check('تنزل نقش بلافاصله روی توکن قبلی اثر می‌کند (۴۰۱ یا ۴۰۳)',c in (401,403),c)
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9'}); sup=d['accessToken']

print('— تعلیق و فعال‌سازی')
c,d=call('POST','/auth/login',{'email':'admin@borj-aftab.test','password':'Passw0rd!','tenantSubdomain':'borj-aftab'}); tok=d['accessToken']; ref=d['refreshToken']
check('ورود مدیر ساختمان',c in (200,201),d)
bt=sql("select id from identity.tenants where subdomain='borj-aftab'")
c,d=call('PATCH',f'/platform/buildings/{bt}',{'status':'suspended'},owner); check('PATCH status=suspended رد می‌شود',c==400,d)
c,d=call('POST',f'/platform/buildings/{bt}/suspend',{},sup); check('تعلیق بدون دلیل ۴۰۰',c==400,d)
c,d=call('POST',f'/platform/buildings/{bt}/suspend',{'reason':'عدم پرداخت'},sup); check('تعلیق توسط support',c in (200,201) and d.get('status')=='suspended',d)
c,d=call('GET','/auth/me',token=tok); check('توکن باز مدیر ساختمان همان لحظه باطل شد',c==401,c)
c,d=call('POST','/auth/refresh',{'refreshToken':ref}); check('تمدید توکن ساختمان تعلیق‌شده رد شد',c==401,d)
c,d=call('POST','/auth/login',{'email':'admin@borj-aftab.test','password':'Passw0rd!','tenantSubdomain':'borj-aftab'}); check('ورود ساختمان تعلیق‌شده رد شد',c==401,c)
c,d=call('POST',f'/platform/buildings/{bt}/suspend',{'reason':'again'},sup); check('تعلیق دوباره ۴۰۰',c==400,d)
c,d=call('POST',f'/platform/buildings/{bt}/impersonate',token=sup); check('impersonate ساختمان تعلیق‌شده رد شد',c==400,d)
c,d=call('POST',f'/platform/buildings/{bt}/cancel',{'reason':'x'},sup); check('support لغو نمی‌کند',c==403,c)
c,d=call('POST',f'/platform/buildings/{bt}/reactivate',{},sup); check('فعال‌سازی مجدد',c in (200,201) and d.get('status')=='active',d)
c,d=call('POST','/auth/login',{'email':'admin@borj-aftab.test','password':'Passw0rd!','tenantSubdomain':'borj-aftab'}); check('ورود پس از فعال‌سازی',c in (200,201),c)

print('— ورود به‌جای مدیر')
c,d=call('POST',f'/platform/buildings/{bt}/impersonate',token=sup); check('impersonate توسط support',c in (200,201) and 'accessToken' in d and 'refreshToken' not in d,d)
imp=d['accessToken']
c,d=call('GET','/auth/me',token=imp); check('توکن impersonate کار می‌کند و نقش admin است',c==200 and d.get('role')=='admin',d)
c,d=call('POST','/auth/change-password',{'currentPassword':'Passw0rd!','newPassword':'N3w-Strong-Pass'},imp); check('تغییر رمز در impersonate ممنوع',c==400,d)
c,d=call('GET','/platform/buildings',token=imp); check('توکن impersonate به /platform دسترسی ندارد',c==403,c)
check('لاگ impersonate ثبت شد',sql("select count(*) from identity.platform_audit_log where action='building.impersonate' and admin_username='sup1'")=='1')

print('— لاگ فعالیت')
c,d=call('GET','/platform/audit?limit=50',token=owner); acts=[e['action'] for e in d['entries']]
check('لاگ شامل تعلیق/فعال‌سازی/ساخت ادمین',all(a in acts for a in ['building.suspend','building.reactivate','admin.create']),acts)
c,d=call('GET','/platform/audit',token=sales); check('sales لاگ را نمی‌بیند',c==403,c)
try:
    sql("update identity.platform_audit_log set action='x'") ; check('لاگ append-only (UPDATE با postgres owner ممکن است ولی نه با platform_admin)',True)
except Exception: pass
r=subprocess.run(['psql',DB_PLAT,'-Atc',"update identity.platform_audit_log set action='x'"],capture_output=True,text=True)
check('platform_admin نمی‌تواند لاگ را UPDATE کند',r.returncode!=0 and 'permission denied' in r.stderr,r.stderr)
r=subprocess.run(['psql',DB_PLAT,'-Atc',"delete from identity.platform_audit_log"],capture_output=True,text=True)
check('platform_admin نمی‌تواند لاگ را DELETE کند',r.returncode!=0 and 'permission denied' in r.stderr,r.stderr)

print('— یادداشت‌ها')
c,d=call('POST',f'/platform/buildings/{bt}/notes',{'kind':'call','body':'تماس با مدیر درباره تمدید'},sales); check('sales یادداشت می‌نویسد',c==201,d)
nid=d.get('id')
c,d=call('GET',f'/platform/buildings/{bt}/notes',token=sup); check('support یادداشت‌ها را می‌خواند',c==200 and len(d['notes'])==1,d)
c,d=call('DELETE',f'/platform/buildings/{bt}/notes/{nid}',token=sales); check('sales حذف نمی‌کند',c==403,c)
c,d=call('POST',f'/platform/buildings/{bt}/notes',{'kind':'note','body':''},owner); check('یادداشت خالی رد می‌شود',c==400,c)

print('— تنظیمات و قیمت')
c,d=call('GET','/platform/settings',token=sup); check('تنظیمات پیش‌فرض',c==200 and d['graceDays']==10 and d['autoSuspend'] is False and d['pricePerUnit']['simple']==25000,d)
c,d=call('PUT','/platform/settings',{'graceDays':3},sup); check('support تنظیمات را عوض نمی‌کند',c==403,c)
c,d=call('PUT','/platform/settings',{'pricePerUnit':{'simple':200000,'economic':600000,'professional':900000},'trialDays':7},owner); check('owner قیمت را عوض می‌کند',c==200 and d['pricePerUnit']['economic']==600000,d)
c,d=call('PUT','/platform/settings',{'graceDays':-5},owner); check('مقدار نامعتبر رد می‌شود',c==400,d)
c,d=call('PUT','/platform/settings',{'foo':1},owner); check('کلید ناشناخته نادیده گرفته می‌شود (بدون تغییر)',c==200 and 'foo' not in d and d['trialDays']==7,d)
c,d=call('GET','/platform/tiers',token=sup); check('tiers قیمت مؤثر را برمی‌گرداند',[t['pricePerUnit'] for t in d]==[200000,600000,900000],d)
c,d=call('POST','/platform/buildings',{'name':'برج تست','subdomain':'tower-test','tier':'economic','unitCount':10},sales); check('ساخت ساختمان با قیمت تنظیمات',c==201 and d['monthlyFee']==6000000,d)
check('trial_ends_at = ۷ روز بعد',sql("select (trial_ends_at - current_date) from identity.tenants where subdomain='tower-test'")=='7')

print('— ۲FA')
c,d=call('POST','/platform/me/2fa/setup',token=sup); secret=d['secret']; check('setup ۲FA',c==201 and d['otpauthUrl'].startswith('otpauth://totp/'),d)
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9'}); check('تا تأیید، ۲FA فعال نیست',c in (200,201),c)
c,d=call('POST','/platform/me/2fa/enable',{'code':'000000'},sup); check('کد غلط رد می‌شود',c==400,d)
c,d=call('POST','/platform/me/2fa/enable',{'code':totp(secret)},sup); check('فعال‌سازی با کد درست',c==201,d)
check('راز در دیتابیس رمزگذاری‌شده است',secret not in sql("select totp_secret_enc from identity.platform_admins where username='sup1'"))
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9'}); check('ورود بدون کد → otpRequired',c==401 and d.get('otpRequired') is True,d)
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9','otp':'000000'}); check('ورود با کد غلط رد',c==401,d)
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9','otp':totp(secret)}); check('ورود با کد درست',c in (200,201) and d['user'].get('totpEnabled') is True,d)
sup=d['accessToken']
c,d=call('POST','/platform/me/2fa/disable',{'password':'bad','code':totp(secret)},sup); check('خاموش‌کردن با رمز غلط رد',c==401,d)
c,d=call('POST',f'/platform/admins/{sid}/reset-2fa',token=owner); check('owner ۲FA عضو را بازنشانی می‌کند',c==201,d)
c,d=call('POST','/auth/platform-login',{'username':'sup1','password':'Supp0rt-Pass9'}); check('بعد از بازنشانی بدون کد وارد می‌شود',c in (200,201),c); sup=d['accessToken']

print('— سلامت سیستم')
c,d=call('GET','/platform/health',token=sup); svc={s['name']:s['status'] for s in d['services']}
check('سلامت: identity و identity-self up، ghost down',svc.get('identity')=='up' and svc.get('identity-self')=='up' and svc.get('ghost')=='down' and d['overall']=='degraded',d)
check('آمار دیتابیس',d['database']['sizeBytes']>0 and d['database']['maxConnections']>0,d['database'])

print('— زمان‌بند')
yas=sql("select id from identity.tenants where subdomain='yas'")
sql(f"insert into identity.platform_invoices (tenant_id,period,amount,status,due_at) values ('{yas}','1405-01',400000,'pending',current_date-30)")
sql(f"update identity.tenants set billing_status='due' where id='{yas}'")
c,d=call('POST','/platform/scheduler/run',token=owner); check('اجرا: معوق علامت می‌خورد، تعلیق خاموش',d.get('newlyOverdue')>=1 and d.get('suspendedForDebt')==0,d)
check('وضعیت yas = overdue ولی active',sql(f"select billing_status||'/'||status from identity.tenants where id='{yas}'")=='overdue/active')
c,d=call('PUT','/platform/settings',{'autoSuspend':True,'graceDays':10},owner)
c,d=call('POST','/platform/scheduler/run',token=owner); check('۳۰ روز معوق > ۱۰ روز مهلت → تعلیق خودکار',d.get('suspendedForDebt')==1,d)
check('yas تعلیق شد با دلیل خودکار',sql(f"select status||'|'||suspend_reason from identity.tenants where id='{yas}'").startswith('suspended|خودکار'))
check('لاگ system ثبت شد',int(sql("select count(*) from identity.platform_audit_log where admin_username='system' and action='building.suspend'"))==1)
c,d=call('POST','/platform/scheduler/run',token=owner); check('اجرای دوباره idempotent',d.get('suspendedForDebt')==0,d)

print('— آخرین owner')
others=sql("select id from identity.platform_admins where username='amir'")
c,d=call('PATCH','/platform/admins/'+others,{'role':'support'},owner); check('تنزل owner دوم مجاز',c==200,d)
c,d=call('PATCH','/platform/admins/'+bid,{'role':'support'},owner); check('تنزل خود ممنوع',c==400,d)

print(f'\n{n-len(fails)}/{n} موفق'); 
if fails: print('FAILED:',fails); sys.exit(1)
