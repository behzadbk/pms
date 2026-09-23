# مشخصات فنی — سه ویژگی متمایزکننده PMS

نسخه ۱.۰ — تکمیل‌کننده docs/SPEC.md، با تمرکز بر:
۱) قوانین رزرو هوشمند مشاعات، ۲) تقویم بصری زنده، ۳) تسهیل نگهبانی و شفافیت مالی

---

## ۷.۱ سیستم قوانین رزرو هوشمند مشاعات (Smart Booking Constraints)

### مدل داده

```
amenities                       (تکمیل جدول amenities در SPEC.md اصلی)
  id, building_id -> buildings, name, type enum(pool, hall, roof_garden, gym, other),
  capacity, requires_approval boolean, color_hex

booking_rules                   -- یک رکورد فعال به‌ازای هر amenity (نسخه‌دار برای تاریخچه تغییرات)
  id, amenity_id -> amenities,
  max_bookings_per_unit_per_period int,       -- سقف تعداد رزرو هر واحد
  period_type enum(day, week, month),         -- بازه محاسبه سقف
  min_advance_hours int,                      -- حداقل فاصله تا لحظه رزرو
  max_advance_days int,                       -- حداکثر فاصله (سقف رزرو زودهنگام)
  min_slot_minutes int, max_slot_minutes int, -- محدوده طول هر بازه رزرو
  cancellation_window_hours int,              -- مهلت کنسلی بدون جریمه
  deposit_amount decimal,
  deposit_refund_policy enum(full_if_cancelled_in_window, partial_50, non_refundable),
  effective_from timestamp, is_active boolean

amenity_sessions                -- سانس‌بندی (مردانه/زنانه/خانوادگی) در روزهای هفته
  id, amenity_id -> amenities, day_of_week smallint(0-6),
  start_time time, end_time time,
  session_type enum(general, male_only, female_only, family),
  max_occupancy int

reservations                    (تکمیل amenity_reservations در SPEC.md اصلی)
  id, amenity_id -> amenities, unit_id -> units, requested_by -> users,
  start_at timestamp, end_at timestamp, session_id -> amenity_sessions (nullable),
  status enum(pending_approval, confirmed, cancelled, rejected, completed),
  deposit_payment_id -> payments (nullable),
  deposit_status enum(not_required, held, refunded, forfeited),
  applied_rule_id -> booking_rules,           -- کدام نسخه قانون در لحظه رزرو اعمال شد (Audit)
  cancelled_at, cancellation_reason
```

نکته طراحی: `applied_rule_id` باعث می‌شود اگر مدیر بعداً قانون را تغییر دهد، رزروهای قبلی همچنان طبق قانونی که در لحظه ثبت اعمال شده بود قابل توضیح باشند (بدون این فیلد، تغییر قانون می‌تواند تاریخچه را غیرقابل‌تفسیر کند).

### منطق تجاری — الگوریتم بررسی قبل از نهایی‌شدن رزرو

```
function validateReservation(unit, amenity, requestedSlot, sessionType):
    rule = getActiveBookingRule(amenity.id)

    # ۱) سقف تعداد رزرو در بازه
    countInPeriod = countReservations(
        unit.id, amenity.id,
        periodStart = startOf(rule.period_type, now),
        periodEnd   = endOf(rule.period_type, now),
        statuses = [pending_approval, confirmed]
    )
    if countInPeriod >= rule.max_bookings_per_unit_per_period:
        reject("سقف رزرو این واحد برای این بازه تکمیل شده است")

    # ۲) بازه پیش‌سفارش (حداقل / حداکثر فاصله)
    hoursUntilSlot = hoursBetween(now, requestedSlot.start)
    if hoursUntilSlot < rule.min_advance_hours:
        reject("این بازه باید زودتر رزرو شود")
    if hoursUntilSlot > rule.max_advance_days * 24:
        reject("رزرو این مشاع فقط تا X روز آینده امکان‌پذیر است")

    # ۳) طول بازه درخواستی
    duration = minutesBetween(requestedSlot.start, requestedSlot.end)
    if duration < rule.min_slot_minutes or duration > rule.max_slot_minutes:
        reject("طول بازه رزرو خارج از محدوده مجاز است")

    # ۴) تداخل زمانی و ظرفیت سانس (اگر amenity سانس‌بندی دارد)
    session = matchSession(amenity.id, requestedSlot, sessionType)
    if session exists:
        concurrentCount = countActiveReservations(amenity.id, session.id, requestedSlot)
        if concurrentCount >= session.max_occupancy:
            reject("ظرفیت این سانس تکمیل شده است")
    else:
        overlap = anyOverlappingReservation(amenity.id, requestedSlot, statuses=[confirmed, pending_approval])
        if overlap:
            reject("این بازه قبلاً رزرو شده است")   # جلوگیری از Double Booking

    # ۵) تعیین مسیر ادامه (رد نمی‌کند؛ فقط مسیر بعدی را مشخص می‌کند)
    requiresApproval = amenity.requires_approval
    depositRequired  = rule.deposit_amount

    return { ok: true, requiresApproval, depositRequired }
```

**نکته اجراییِ حیاتی (جلوگیری از Double Booking):** چک شماره ۴ باید در سطح دیتابیس هم با یک **Unique/Exclusion Constraint** پشتیبانی شود (مثلاً `EXCLUDE USING gist` روی بازه زمانی در PostgreSQL)، نه فقط در application layer؛ چون دو درخواست هم‌زمان می‌توانند از race condition عبور کنند. الگوریتم بالا تجربه کاربری خوب می‌دهد (پیام خطای فوری)، ولی محدودیت دیتابیس تضمین صحت نهایی است.

### جریان تکمیل رزرو پس از عبور از validateReservation

```
if requiresApproval:
    reservation.status = pending_approval
else:
    reservation.status = confirmed

if depositRequired > 0:
    create payment intent (amount = depositRequired, purpose = deposit)
    reservation.deposit_status = held  (پس از پرداخت موفق)

on cancellation:
    hoursBeforeStart = hoursBetween(now, reservation.start_at)
    if hoursBeforeStart >= rule.cancellation_window_hours:
        deposit_status = refunded
    else:
        apply rule.deposit_refund_policy:
            full_if_cancelled_in_window -> refunded (چون در این مسیر یعنی داخل مهلت بودیم، این حالت تئوریک نیست)
            partial_50                 -> refund 50%, forfeit 50%
            non_refundable              -> forfeited
```

---

## ۷.۲ تقویم بصری زنده مشاعات (Live Calendar)

### مدل داده تکمیلی

```
calendar_slots        -- View/Materialized محاسبه‌شده، نه لزوماً جدول مستقل؛
                          می‌تواند به‌صورت query روی reservations + maintenance_windows ساخته شود
  amenity_id, start_at, end_at,
  status (محاسبه‌شده) enum(available, pending_approval, confirmed, maintenance, past)

maintenance_windows    -- بازه‌های خارج از سرویس (برای وضعیت خاکستری/سیاه)
  id, amenity_id -> amenities, start_at, end_at, reason, created_by -> users
```

منطق تعیین `status` هر Slot (اولویت از بالا به پایین):
```
if slot.end <= now:                         status = past
elif overlaps(maintenance_windows):         status = maintenance
elif overlaps(reservations where status=confirmed):        status = confirmed
elif overlaps(reservations where status=pending_approval):  status = pending_approval
else:                                        status = available
```

### به‌روزرسانی آنی (Real-Time)

- اتصال WebSocket (Socket.io) با یک Room به‌ازای هر `amenity_id` (مثلاً `room:amenity:{id}`).
- رویدادهایی که باعث broadcast به Room می‌شوند: `reservation.created`, `reservation.cancelled`, `reservation.approved`, `maintenance_window.created`.
- کلاینت (وب/موبایل) با ورود به صفحه تقویم یک amenity، به Room مربوطه subscribe می‌شود و Slot تغییر‌یافته را بدون رفرش صفحه به‌روزرسانی می‌کند.
- **Fallback بدون WebSocket:** polling هر ۱۵-۲۰ ثانیه روی `GET /amenities/{id}/calendar` برای کلاینت‌هایی که اتصال realtime ندارند (مثلاً پنل نگهبانی روی شبکه ضعیف).
- برای جلوگیری قطعی از Double Booking، حتی اگر UI به‌روز نباشد، تلاش برای رزرو یک Slot که هم‌زمان توسط شخص دیگری گرفته شده، در سمت سرور توسط همان Exclusion Const>در بخش ۷.۱ رد می‌شود و کلاینت پیام "این بازه لحظاتی پیش رزرو شد، لطفاً بازه دیگری انتخاب کنید" را نمایش می‌دهد.

### رنگ‌بندی وضعیت (برای پیاده‌سازی UI)
| وضعیت | رنگ | معنی |
|---|---|---|
| available | سبز | قابل رزرو |
| pending_approval | نارنجی | رزروشده، منتظر تایید مدیر |
| confirmed | قرمز | رزرو قطعی |
| maintenance | خاکستری | خارج از سرویس |
| past | خاکستری کم‌رنگ | گذشته |

---

## ۷.۳ تسهیل نگهبانی و شفافیت مالی

### مدل داده تکمیلی

```
guard_logs             -- خلاصه یکپارچه همه فعالیت‌های نگهبانی برای فید زنده و گزارش‌گیری
  id, building_id -> buildings, type enum(guest_entry, parcel, vehicle_in, vehicle_out),
  ref_table, ref_id,               -- اشاره به guest_visit_logs / parcels / vehicle_traffic_logs
  actor_id -> users (نگهبان),      summary_text, occurred_at

  -- این جدول برای سادگی «فید زنده» و گزارش‌های تجمیعی است؛
  -- جزئیات کامل هر رویداد همچنان در جداول تخصصی خودش (بخش ۵ سند اصلی) ذخیره می‌شود.

charge_line_items      -- تفکیک هر شارژ به اجزای قابل انتساب به مالک/مستأجر (برای شفافیت مالی)
  id, monthly_charge_id -> monthly_charges,
  category enum(base_maintenance, utility_shared, reserve_fund, penalty, amenity_fee),
  amount, payer_type enum(owner, tenant),   -- بر اساس قرارداد یا قانون پیش‌فرض ساختمان
  rule_note text                            -- توضیح کوتاه چرا این سهم به این نفر تعلق گرفت

owner_tenant_split_rules    -- قانون پیش‌فرض تفکیک هزینه (قابل override در سطح lease_contract)
  id, building_id -> buildings, category, default_payer enum(owner, tenant, shared_50_50)
```

### منطق تجاری — تفکیک شارژ بین مالک و مستأجر

```
function splitCharge(unit, monthlyCharge):
    contract = getActiveLeaseContract(unit.id)   # اگر nullable باشد یعنی ساکن مالک است
    lineItems = []
    for category in [base_maintenance, utility_shared, reserve_fund, amenity_fee]:
        amount = computeCategoryAmount(monthlyCharge, category)
        payer = contract?.category_overrides[category]
                ?? owner_tenant_split_rules[category].default_payer
                ?? 'owner'   # پیش‌فرض ایمن در نبود هر قانونی

        if payer == shared_50_50:
            lineItems.append({category, amount: amount/2, payer: owner})
            lineItems.append({category, amount: amount/2, payer: tenant})
        else:
            lineItems.append({category, amount, payer})

    return lineItems
```

این خروجی مستقیماً به داشبورد «شفافیت مالی» ساکن می‌رود تا هر ریال هزینه با دسته و مقصد آن (مالک/مستأجر) قابل رصد باشد — دقیقاً همان چیزی که سوءظن مالی ساکنین را برطرف می‌کند.

### منطق تجاری — پنل فوق‌ساده نگهبانی (یک کلیک تا تایید)

```
function guardQuickCheckIn(inputCode):
    pass = findGuestPassByCode(inputCode)          # هم QR و هم کد عددی به یک جدول guest_passes می‌رسند
    if pass is null:
        return { ok: false, reason: "کد نامعتبر" }
    if pass.status != active:
        return { ok: false, reason: "کد منقضی یا قبلاً استفاده‌شده" }
    if now < pass.valid_from or now > pass.valid_until:
        return { ok: false, reason: "خارج از بازه اعتبار" }
    if pass.uses_count >= pass.max_uses:
        return { ok: false, reason: "سقف استفاده از این کد تکمیل شده" }

    # نکته UX: تمام این بررسی‌ها قبل از نمایش دکمه «ثبت ورود» انجام می‌شود
    # تا نگهبان فقط با یک تاییدیه نهایی (یک کلیک) کار را تمام کند —
    # نه با پر کردن فرم؛ خطای انسانی و زمان انتظار در لابی کاهش می‌یابد.
    return { ok: true, guestName: pass.guest_name, unit: pass.unit_id }

function guardConfirmCheckIn(passId, guardId):
    create guest_visit_logs { guest_pass_id: passId, entry_at: now, checked_in_by: guardId }
    increment guest_passes.uses_count
    if uses_count == max_uses: guest_passes.status = used
    append guard_logs { type: guest_entry, ... }
    notify(unit.residents, "مهمان [نام] وارد شد")   # Push/WebSocket فوری
```

مشابه همین الگو برای مرسولات: اسکن بارکد فقط `tracking_code` را پر می‌کند؛ نگهبان صرفاً واحد را انتخاب/تایپ می‌کند و یک دکمه «ثبت» باقی می‌ماند — نه فرم چندمرحله‌ای.

---

## ۸. طراحی API (تکمیلی)

### تقویم زنده
```
GET  /amenities/{id}/calendar?from=2026-09-01&to=2026-09-07
     -> { data: [ { start_at, end_at, status, unit_label? } ... ] }
     -- برای کلاینت‌های بدون WebSocket، همین Endpoint هر ۱۵-۲۰ ثانیه poll می‌شود

WS   room: amenity:{id}
     events: reservation.created | reservation.cancelled | reservation.approved | maintenance_window.created
```

### رزرو با اعمال قوانین هوشمند
```
POST /amenities/{id}/reservations
     body: { unit_id, start_at, end_at, session_id? }
     -- سرور validateReservation() را اجرا می‌کند؛
     -- پاسخ ۴۰۹ Conflict با { reasons: [...] } در صورت رد قانون
     -- پاسخ ۲۰۱ با { status: pending_approval|confirmed, deposit_required } در صورت موفقیت

POST /reservations/{id}/pay-deposit        body: { gateway }
POST /reservations/{id}/cancel             -- منطق بازگشت بیعانه طبق بخش ۷.۱ اجرا می‌شود
POST /reservations/{id}/approve            -- Admin
POST /reservations/{id}/reject             -- Admin

GET  /buildings/{buildingId}/amenities/{id}/booking-rules
PUT  /buildings/{buildingId}/amenities/{id}/booking-rules   -- نسخه جدید قانون (نسخه قبلی is_active=false می‌شود)
GET  /amenities/{id}/sessions
POST /amenities/{id}/sessions
```

### پنل نگهبانی
```
GET  /guest-passes/verify?code=XXXXXX      -- فقط بررسی، بدون ثبت (برای نمایش پیش از تایید نهایی)
POST /guest-passes/{id}/check-in           -- ثبت نهایی با یک درخواست
GET  /vehicles/lookup?plate=XXXXX          -- جستجوی سریع پلاک
POST /parcels                              body: { unit_id, courier, tracking_code? }
GET  /buildings/{buildingId}/guard-logs?from=&to=&type=     -- فید زنده و گزارش‌گیری
```

### شفافیت مالی
```
GET  /units/{unitId}/charges/{chargeId}/line-items     -- تفکیک دسته‌بندی‌شده + payer_type
GET  /buildings/{buildingId}/expenses/breakdown?period=2026-09   -- برای نمودار دسته‌بندی هزینه
GET  /units/{unitId}/invoices                                    -- لیست رسید/فاکتور با لینک دانلود PDF
GET  /buildings/{buildingId}/owner-tenant-split-rules
PUT  /buildings/{buildingId}/owner-tenant-split-rules
```

قواعد کلی (auth، pagination، idempotency، فرمت خطا) همان قواعدی است که در بخش ۵ سند اصلی (`docs/SPEC.md`) تعریف شده و برای این Endpointها هم عیناً اعمال می‌شود.
