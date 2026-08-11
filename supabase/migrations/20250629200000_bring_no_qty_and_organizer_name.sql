-- Allow bring items without a tracked quantity ("wer bringt's mit" ohne Menge)
-- and let organizers show their name to guests.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organizer_name text;

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.event_bring_items'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%quantity_mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.event_bring_items DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.event_bring_items
  ADD CONSTRAINT event_bring_items_quantity_mode_check
  CHECK (quantity_mode IN ('fixed', 'per_guest', 'none'));

ALTER TABLE public.event_bring_items ALTER COLUMN quantity_value DROP NOT NULL;
