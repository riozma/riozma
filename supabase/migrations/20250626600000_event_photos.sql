-- Event-Fotos via externem Dienst (Dropbox, Google Drive, …)

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photos_show_preview boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photos_preview_text text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photos_upload_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photos_upload_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photos_gallery_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS photos_closes_at date;
