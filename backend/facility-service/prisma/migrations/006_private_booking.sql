-- 006: رزرو خصوصی + تفکیک جنسیتی روز/ساعت مشاعات (idempotent)
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS private_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS private_rules text;
-- {mode:'parity',even:'women'|'men',odd:..} | {mode:'weekday',days:{"0":'women',...}} | {mode:'hours',ranges:[{from,to,gender}]}
ALTER TABLE facility.amenities ADD COLUMN IF NOT EXISTS gender_split jsonb;
ALTER TABLE facility.reservations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_kind_chk') THEN
    ALTER TABLE facility.reservations ADD CONSTRAINT reservations_kind_chk CHECK (kind IN ('general','private'));
  END IF;
END $$;
