document.addEventListener("DOMContentLoaded", async () => {
  const content = document.getElementById("werk-content");
  const id = new URLSearchParams(window.location.search).get("id");
  const all = await loadAllArtworks();
  const idx = all.findIndex((a) => a.id === id);

  if (idx < 0) {
    content.innerHTML = `<p class="text-muted">Dieses Kunstwerk wurde nicht gefunden. <a href="/kunst/">Zur Galerie</a></p>`;
    return;
  }

  const art = all[idx];
  const avail = isArtworkAvailable(art);
  const prev = all[(idx - 1 + all.length) % all.length];
  const next = all[(idx + 1) % all.length];
  document.title = `${art.title || "Kunstwerk"} – riozmart`;

  content.innerHTML = `
    <div class="werk-image-wrap">
      <img src="${escapeHtml(art.high_res_url)}" alt="${escapeHtml(art.title || "")}" class="werk-image" id="werk-image">
    </div>
    <div class="werk-info">
      <h1 class="werk-title">\u201e${escapeHtml(art.title || "")}\u201c${avail ? "*" : ""}</h1>
      <dl class="werk-meta">
        ${art.year ? `<div><dt>Jahr</dt><dd>${escapeHtml(art.year)}</dd></div>` : ""}
        ${art.size ? `<div><dt>Grösse</dt><dd>${escapeHtml(art.size)}</dd></div>` : ""}
        ${art.medium ? `<div><dt>Medium</dt><dd>${escapeHtml(art.medium)}</dd></div>` : ""}
        <div><dt>Status</dt><dd>${avail ? "verfügbar *" : "nicht verfügbar"}</dd></div>
      </dl>
      <div class="werk-actions">
        <a href="${escapeHtml(art.high_res_url)}" download="${escapeHtml(art.id)}.jpg" class="btn btn-secondary">herunterladen</a>
      </div>
      <nav class="werk-nav" aria-label="Weitere Kunstwerke">
        <a href="${artworkPageUrl(prev.id)}">← ${escapeHtml(prev.title || "Zurück")}</a>
        <a href="${artworkPageUrl(next.id)}">${escapeHtml(next.title || "Weiter")} →</a>
      </nav>
    </div>`;

  document.getElementById("werk-image").addEventListener("click", (e) => e.currentTarget.classList.toggle("is-zoomed"));
});
