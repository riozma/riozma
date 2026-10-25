// Politik-Feed: Artikel aus Supabase, Videos aus politik/beitraege.json, Podcastfolgen aus politik/podcast.json
// (wird von scripts/politik-podcast-build.mjs aus dem RSS-Feed gebaut). Alles zusammen, neuster Beitrag zuerst.
const PODCAST_RSS_URL = "https://esschlohtoeufi.ch/feed/podcast/es-schloht-oeufi/";
const PODCAST_SITE_URL = "https://esschlohtoeufi.ch";
const POLITIK_TYPE_LABELS = { artikel: "Artikel", video: "Video", podcast: "Podcast" };
const POLITIK_TYPE_CTA = { artikel: "Weiterlesen", video: "Video ansehen", podcast: "Folge hören" };

async function fetchPolitikJson(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadPolitikArticles() {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client) return [];
  const { data, error } = await client
    .from("blog_posts")
    .select("slug,title,excerpt,subtitle,cover_image_path,published_at,created_at")
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (error || !data) return [];
  return data.map((p) => ({
    type: "artikel",
    title: p.title,
    text: p.excerpt || p.subtitle || "",
    date: p.published_at || p.created_at,
    href: `/politik/artikel.html?slug=${encodeURIComponent(p.slug)}`,
    image: p.cover_image_path ? storagePublicUrl("blog-images", p.cover_image_path) : "",
    external: false,
  }));
}

async function loadPolitikFeed({ limit } = {}) {
  const [articles, beitraege, podcast] = await Promise.all([
    loadPolitikArticles(),
    fetchPolitikJson("/politik/beitraege.json"),
    fetchPolitikJson("/politik/podcast.json"),
  ]);

  const local = (beitraege?.items || []).map((b) => ({
    type: b.type || "video",
    title: b.title,
    text: b.excerpt || "",
    date: b.date,
    href: b.href,
    image: b.image || "",
    duration: b.duration || "",
    external: false,
  }));

  const episodes = (podcast?.items || []).map((e) => ({
    type: "podcast",
    title: e.title,
    text: e.excerpt || "",
    date: e.date,
    href: e.link || PODCAST_SITE_URL,
    image: e.image || "/src/img/podcast-logo.png",
    duration: e.duration || "",
    external: true,
  }));

  const all = [...articles, ...local, ...episodes]
    .filter((i) => i.title && i.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return limit ? all.slice(0, limit) : all;
}
