document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const container = document.getElementById("article-content");

  if (!slug) {
    container.innerHTML = `<p>Kein Artikel angegeben. <a href="/politik/">Zurück zur Übersicht</a></p>`;
    return;
  }

  const client = getSupabase();
  if (!client) {
    container.innerHTML = `<p>Supabase nicht konfiguriert.</p>`;
    return;
  }

  const { data, error } = await client
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  if (error || !data) {
    container.innerHTML = `<p>Artikel nicht gefunden. <a href="/politik/">Zurück zur Übersicht</a></p>`;
    return;
  }

  document.title = `${data.title} – Politik`;
  const cover = data.cover_image_path ? storagePublicUrl("blog-images", data.cover_image_path) : "";
  const date = formatDateDE(data.published_at || data.created_at);

  container.innerHTML = `
    <header class="article-header">
      <p class="article-kicker">Politik · Meinung</p>
      <h1 class="article-headline">${escapeHtml(data.title)}</h1>
      ${data.subtitle ? `<p class="article-lead">${escapeHtml(data.subtitle)}</p>` : ""}
      <div class="article-byline">
        <span class="article-author">Manuel Rio Zeltner</span>
        <span class="article-sep">|</span>
        <time datetime="${data.published_at || data.created_at}">${date}</time>
      </div>
      <hr class="article-rule">
    </header>
    ${cover ? `<figure class="article-figure"><img src="${cover}" alt="" class="article-figure-img"><figcaption class="article-figcaption">Bild zum Artikel</figcaption></figure>` : ""}
    <div class="article-body">${renderParagraphs(data.content)}</div>
  `;
});
