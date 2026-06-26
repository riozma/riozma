-- Artworks (Kunst-Galerie)
create table if not exists public.artworks (
  id text primary key,
  title text not null default '',
  year text,
  size text,
  medium text,
  available boolean not null default false,
  image_path text not null,
  thumb_path text,
  source text not null default 'supabase' check (source in ('local', 'supabase')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Politik-Blog
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  excerpt text,
  content text not null default '',
  cover_image_path text,
  published boolean not null default false,
  published_at timestamptz,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_at_idx on public.blog_posts (published_at desc nulls last);
create index if not exists blog_posts_slug_idx on public.blog_posts (slug);

alter table public.artworks enable row level security;
alter table public.blog_posts enable row level security;

-- Öffentlich: veröffentlichte Blog-Posts lesen
create policy "blog_posts_public_read"
  on public.blog_posts for select
  using (published = true);

-- Öffentlich: alle Kunstwerke lesen
create policy "artworks_public_read"
  on public.artworks for select
  using (true);

-- Authentifiziert: auch Entwürfe lesen
create policy "blog_posts_auth_read_drafts"
  on public.blog_posts for select
  to authenticated
  using (true);

-- Authentifiziert: Blog-Posts verwalten
create policy "blog_posts_auth_all"
  on public.blog_posts for all
  to authenticated
  using (true)
  with check (true);

-- Authentifiziert: Kunstwerke verwalten
create policy "artworks_auth_all"
  on public.artworks for all
  to authenticated
  using (true)
  with check (true);

-- Storage Buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('artworks', 'artworks', true, 52428800, array['image/jpeg', 'image/png', 'image/webp']),
  ('blog-images', 'blog-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Storage: öffentliches Lesen
create policy "artworks_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'artworks');

create policy "blog_images_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'blog-images');

-- Storage: authentifiziertes Schreiben
create policy "artworks_storage_auth_write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'artworks')
  with check (bucket_id = 'artworks');

create policy "blog_images_storage_auth_write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'blog-images')
  with check (bucket_id = 'blog-images');

-- updated_at Trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();
