-- ============================================================================
-- 902 — ایندکس روی کلیدهای خارجیِ بدون ایندکس (issue #16)
-- ============================================================================
-- بدون ایندکس روی ستون FK، حذف/ویرایش ردیف والد (ON DELETE CASCADE) و JOINها باید کل جدول فرزند را بخوانند.
-- idempotent (IF NOT EXISTS). CONCURRENTLY لازم نیست: جدول‌ها هنوز کوچک‌اند و migrate.sh هر فایل را در
-- یک transaction ضمنی اجرا می‌کند؛ اگر جدولی بزرگ شد، این ایندکس‌ها را دستی با CONCURRENTLY بسازید.
-- فقط ایندکس اضافه می‌شود (بدون تغییر داده/اسکیما)؛ مایگریشن‌های قبلی ویرایش نشده‌اند.
-- ============================================================================
CREATE INDEX IF NOT EXISTS orders_venue_id_idx                ON fnb.orders (venue_id);
CREATE INDEX IF NOT EXISTS orders_delivery_zone_id_idx        ON fnb.orders (delivery_zone_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx           ON fnb.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_item_id_idx            ON fnb.order_items (item_id);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx     ON fnb.order_status_history (order_id);
CREATE INDEX IF NOT EXISTS item_option_groups_item_idx        ON fnb.item_option_groups (item_id);
CREATE INDEX IF NOT EXISTS item_options_group_idx             ON fnb.item_options (group_id);

CREATE INDEX IF NOT EXISTS units_building_id_idx              ON property.units (building_id);
CREATE INDEX IF NOT EXISTS units_owner_user_id_idx            ON property.units (owner_user_id);
CREATE INDEX IF NOT EXISTS user_unit_links_unit_idx           ON property.user_unit_links (unit_id);

CREATE INDEX IF NOT EXISTS amenity_closures_amenity_idx       ON facility.amenity_closures (amenity_id);
CREATE INDEX IF NOT EXISTS booking_rules_amenity_idx          ON facility.booking_rules (amenity_id);
CREATE INDEX IF NOT EXISTS reservations_applied_rule_idx      ON facility.reservations (applied_rule_id);
CREATE INDEX IF NOT EXISTS maintenance_schedules_asset_idx    ON facility.maintenance_schedules (asset_id);
CREATE INDEX IF NOT EXISTS work_orders_asset_idx              ON facility.work_orders (asset_id);
CREATE INDEX IF NOT EXISTS work_orders_ticket_idx             ON facility.work_orders (ticket_id);
CREATE INDEX IF NOT EXISTS service_records_ticket_idx         ON facility.service_records (ticket_id);
CREATE INDEX IF NOT EXISTS service_records_work_order_idx     ON facility.service_records (work_order_id);

CREATE INDEX IF NOT EXISTS monthly_charges_formula_idx        ON finance.monthly_charges (formula_id);

CREATE INDEX IF NOT EXISTS guest_visit_logs_pass_idx          ON guard.guest_visit_logs (guest_pass_id);
CREATE INDEX IF NOT EXISTS vehicle_logs_vehicle_idx           ON guard.vehicle_logs (vehicle_id);

CREATE INDEX IF NOT EXISTS poll_votes_option_idx              ON notification.poll_votes (option_id);

CREATE INDEX IF NOT EXISTS child_spend_request_idx            ON residency.child_spend (request_id);
CREATE INDEX IF NOT EXISTS family_login_codes_membership_idx  ON residency.family_login_codes (membership_id);
CREATE INDEX IF NOT EXISTS residency_users_merged_into_idx    ON residency.users (merged_into);

-- entitlement (مایگریشن 005، PR #21)
CREATE INDEX IF NOT EXISTS ent_guest_tickets_service_idx      ON entitlement.guest_tickets (service_id);
CREATE INDEX IF NOT EXISTS ent_quotas_service_idx             ON entitlement.quotas (service_id);
CREATE INDEX IF NOT EXISTS ent_tariffs_service_idx            ON entitlement.tariffs (service_id);
CREATE INDEX IF NOT EXISTS ent_usage_events_service_idx       ON entitlement.usage_events (service_id);
CREATE INDEX IF NOT EXISTS ent_usage_events_tariff_idx        ON entitlement.usage_events (tariff_id);
