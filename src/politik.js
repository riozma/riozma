let currentSession = null;
let editingPostId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthUI({
    mode: "discreet",
    onAuthChange: (session) => {
      currentSession = session;
      const panel = document.getElementById("admin-panel");
      if (session && isSiteAdmin(session)) {
        panel.classList.remove("d-none");
        loadAdminPosts();
      } else {
        panel.classList.add("d-none");
      }
    },
  });

  await loadPublishedPosts();
  setupPostForm();
});

let feedItems = [];
let feedFilter = "alle";

async function loadPublishedPosts() {
  const container = document.getElementById("posts-list");
  feedItems = await loadPolitikFeed();
  setupFeedFilter();
  renderFeed(container);
}

function setupFeedFilter() {
  const bar = document.getElementById("posts-filter");
  if (!bar || bar.dataset.ready) return;
  bar.dataset.ready = "1";
  bar.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      feedFilter = btn.dataset.filter;
      bar.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderFeed(document.getElementById("posts-list"));
    });
  });
}

function renderFeed(container) {
  const items = feedFilter === "alle" ? feedItems : feedItems.filter((i) => i.type === feedFilter);
  if (!items.length) {
    container.innerHTML = `<p class="text-muted">Noch keine Beiträge in dieser Kategorie. Schau solange beim <a href="${PODCAST_SITE_URL}" target="_blank" rel="noopener">Podcast</a> vorbei.</p>`;
    return;
  }
  container.innerHTML = items.map(renderPostTeaser).join("");
}

function renderPostTeaser(item) {
  const date = formatDateDE(item.date);
  const ext = item.external ? ` target="_blank" rel="noopener"` : "";
  return `
    <a href="${escapeHtml(item.href)}" class="post-teaser post-teaser-${item.type}"${ext}>
      ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" class="post-teaser-img" loading="lazy">` : `<div class="post-teaser-img post-teaser-placeholder"></div>`}
      <div class="post-teaser-body">
        <p class="post-teaser-date"><span class="post-type-badge post-type-${item.type}">${POLITIK_TYPE_LABELS[item.type] || ""}</span> ${date}${item.duration ? ` · ${escapeHtml(item.duration)}` : ""}</p>
        <h2 class="post-teaser-title">${escapeHtml(item.title)}</h2>
        ${item.text ? `<p class="post-teaser-excerpt">${escapeHtml(item.text)}</p>` : ""}
        <span class="post-teaser-link">${POLITIK_TYPE_CTA[item.type] || "Mehr"} →</span>
      </div>
    </a>
  `;
}

async function loadAdminPosts() {
  const container = document.getElementById("admin-posts-list");
  const client = getSupabase();
  if (!client || !currentSession || !isSiteAdmin(currentSession)) return;

  const { data, error } = await client
    .from("blog_posts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = `<p class="text-muted">Noch keine Beiträge.</p>`;
    return;
  }

  container.innerHTML = data
    .map(
      (post) => `
    <div class="admin-post-row">
      <div>
        <strong>${escapeHtml(post.title)}</strong>
        <span class="badge ${post.published ? "bg-success" : "bg-secondary"}">${post.published ? "Veröffentlicht" : "Entwurf"}</span>
      </div>
      <div class="admin-post-actions">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-edit-post="${post.id}">Bearbeiten</button>
        ${post.published ? `<a href="/politik/artikel.html?slug=${encodeURIComponent(post.slug)}" class="btn btn-sm btn-outline-primary">Ansehen</a>` : ""}
        <button type="button" class="btn btn-sm btn-outline-success" data-toggle-publish="${post.id}" data-published="${post.published}">${post.published ? "Zurückziehen" : "Veröffentlichen"}</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-delete-post="${post.id}">Löschen</button>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll("[data-edit-post]").forEach((btn) => {
    btn.addEventListener("click", () => loadPostIntoForm(btn.dataset.editPost, data));
  });
  container.querySelectorAll("[data-toggle-publish]").forEach((btn) => {
    btn.addEventListener("click", () => togglePublish(btn, btn.dataset.togglePublish, btn.dataset.published === "true"));
  });
  container.querySelectorAll("[data-delete-post]").forEach((btn) => {
    btn.addEventListener("click", () => deletePost(btn, btn.dataset.deletePost));
  });
}

function loadPostIntoForm(id, posts) {
  const post = posts.find((p) => p.id === id);
  if (!post) return;
  editingPostId = post.id;
  document.getElementById("post-title").value = post.title;
  document.getElementById("post-slug").value = post.slug;
  document.getElementById("post-slug").dataset.manual = "1";
  document.getElementById("post-subtitle").value = post.subtitle || "";
  document.getElementById("post-excerpt").value = post.excerpt || "";
  document.getElementById("post-content").value = post.content || "";
  showStatus(document.getElementById("post-form-message"), "Beitrag zum Bearbeiten geladen.", "info");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupPostForm() {
  const titleInput = document.getElementById("post-title");
  const slugInput = document.getElementById("post-slug");

  titleInput.addEventListener("input", () => {
    if (!slugInput.dataset.manual) {
      slugInput.value = slugify(titleInput.value);
    }
  });
  slugInput.addEventListener("input", () => {
    slugInput.dataset.manual = slugInput.value ? "1" : "";
  });

  document.getElementById("post-form").addEventListener("submit", (e) => {
    e.preventDefault();
    savePost(false, e.submitter);
  });
  document.getElementById("post-publish").addEventListener("click", (e) => savePost(true, e.currentTarget));

  document.getElementById("post-form").addEventListener("reset", () => {
    editingPostId = null;
    slugInput.dataset.manual = "";
    showStatus(document.getElementById("post-form-message"), "", "info");
  });
}

async function savePost(publish, triggerBtn) {
  const client = getSupabase();
  const msg = document.getElementById("post-form-message");

  if (!client || !currentSession) {
    showStatus(msg, "Bitte zuerst anmelden.", "error");
    return;
  }
  if (!isSiteAdmin(currentSession)) {
    showStatus(msg, "Nur der Administrator kann Beiträge verwalten.", "error");
    return;
  }

  const title = document.getElementById("post-title").value.trim();
  const slug = document.getElementById("post-slug").value.trim() || slugify(title);
  const subtitle = document.getElementById("post-subtitle").value.trim();
  const excerpt = document.getElementById("post-excerpt").value.trim();
  const content = document.getElementById("post-content").value.trim();
  const coverFile = document.getElementById("post-cover").files[0];

  if (!title || !content) {
    showStatus(msg, "Titel und Text sind Pflicht.", "error");
    return;
  }

  const button = triggerBtn || (publish
    ? document.getElementById("post-publish")
    : document.querySelector("#post-form button[type='submit']"));

  await withActionFeedback({
    button,
    messageEl: msg,
    loadingLabel: publish ? "Veröffentlichen…" : "Speichern…",
    successLabel: publish ? "✓ Veröffentlicht" : "✓ Gespeichert",
    successMessage: publish ? "Beitrag erfolgreich veröffentlicht!" : "Entwurf gespeichert.",
    run: async () => {
      const user = await requireAuthUser(client);
      currentSession = { user };

      let coverPath = null;
      if (coverFile) {
        const compressed = await prepareBlogCover(coverFile);
        coverPath = `${slug}/${Date.now()}-cover.jpg`;
        const { error: uploadError } = await client.storage.from("blog-images").upload(coverPath, compressed, {
          upsert: true,
          contentType: "image/jpeg",
        });
        if (uploadError) throw storageUploadError(uploadError, `Bild-Upload fehlgeschlagen: ${uploadError.message}`);
      }

      const basePayload = {
        slug,
        title,
        subtitle,
        excerpt: excerpt || subtitle,
        content,
        author_id: user.id,
      };
      if (coverPath) basePayload.cover_image_path = coverPath;

      let error;

      if (editingPostId) {
        const updatePayload = { ...basePayload };
        if (publish) {
          updatePayload.published = true;
          updatePayload.published_at = new Date().toISOString();
        }
        ({ error } = await client.from("blog_posts").update(updatePayload).eq("id", editingPostId));
      } else {
        const insertPayload = {
          ...basePayload,
          published: publish,
          published_at: publish ? new Date().toISOString() : null,
        };
        const { data, error: insertError } = await client.from("blog_posts").insert(insertPayload).select("id").single();
        error = insertError;
        if (data) editingPostId = data.id;
      }

      if (error) throw new Error(formatDbError(error.message));
      return { slug, publish };
    },
    onSuccess: async (result) => {
      await loadAdminPosts();
      if (result.publish) {
        document.getElementById("post-form").reset();
        editingPostId = null;
        document.getElementById("post-slug").dataset.manual = "";
        await loadPublishedPosts();
      }
    },
    redirectTo: publish ? `/politik/artikel.html?slug=${encodeURIComponent(slug)}` : null,
  });
}

async function togglePublish(btn, id, isPublished) {
  if (!isSiteAdmin(currentSession)) return;
  const client = getSupabase();
  const msg = document.getElementById("post-form-message");

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: isPublished ? "Zurückziehen…" : "Veröffentlichen…",
    successLabel: isPublished ? "✓ Entwurf" : "✓ Live",
    successMessage: isPublished ? "Beitrag zurückgezogen." : "Beitrag veröffentlicht!",
    run: async () => {
      const { error } = await client
        .from("blog_posts")
        .update({
          published: !isPublished,
          published_at: !isPublished ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw new Error(formatDbError(error.message));
      return true;
    },
    onSuccess: async () => {
      await loadAdminPosts();
      await loadPublishedPosts();
    },
  });
}

async function deletePost(btn, id) {
  if (!confirm("Beitrag wirklich löschen?")) return;
  if (!isSiteAdmin(currentSession)) return;
  const client = getSupabase();
  const msg = document.getElementById("post-form-message");

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: "Löschen…",
    successLabel: "✓ Gelöscht",
    successMessage: "Beitrag gelöscht.",
    run: async () => {
      const { error } = await client.from("blog_posts").delete().eq("id", id);
      if (error) throw new Error(formatDbError(error.message));
      return true;
    },
    onSuccess: async () => {
      if (editingPostId === id) {
        editingPostId = null;
        document.getElementById("post-form").reset();
      }
      await loadAdminPosts();
      await loadPublishedPosts();
    },
  });
}
