let showAvailable = false;
let allArtworks = [];
let currentSession = null;

document.addEventListener("DOMContentLoaded", async () => {
  allArtworks = await loadAllArtworks();

  await initAuthUI({
    mode: "discreet",
    onAuthChange: (session) => {
      currentSession = session;
      const panel = document.getElementById("kunst-admin");
      if (session && isSiteAdmin(session) && panel) {
        panel.classList.remove("d-none");
      } else if (panel) {
        panel.classList.add("d-none");
      }
      renderGallery(showAvailable ? allArtworks.filter((a) => a.available === true || a.available === "True") : allArtworks);
    },
  });

  renderGallery(allArtworks);

  document.getElementById("filter-button").addEventListener("click", () => {
    if (showAvailable) {
      showAvailable = false;
      document.getElementById("filter-button").innerHTML = "verfüegbari azeige";
      renderGallery(allArtworks);
    } else {
      showAvailable = true;
      document.getElementById("filter-button").innerHTML = "Alle anzeigen";
      renderGallery(allArtworks.filter((a) => a.available === true || a.available === "True"));
    }
  });

  setupArtworkUpload();
  bindDeleteButtons();
  bindAvailabilityToggles();
});

function renderGallery(data) {
  const container = document.getElementById("artwork-preview");
  container.innerHTML = "";

  let loadMoreButton = document.getElementById("load-more-button");
  if (loadMoreButton) loadMoreButton.remove();

  loadMoreButton = document.createElement("button");
  loadMoreButton.id = "load-more-button";
  loadMoreButton.innerHTML = "Weitere laden";
  loadMoreButton.classList.add("btn", "btn-primary", "load-more-btn");
  container.parentNode.appendChild(loadMoreButton);

  let currentIndex = 0;
  const itemsPerPage = 9;

  function renderBatch() {
    const items = data.slice(currentIndex, currentIndex + itemsPerPage);
    container.innerHTML += items.map(artworkCardHtml).join("");
    currentIndex += itemsPerPage;
    loadMoreButton.style.display = currentIndex >= data.length ? "none" : "block";
    bindArtCards();
    bindDeleteButtons();
    bindAvailabilityToggles();
  }

  loadMoreButton.addEventListener("click", renderBatch);
  renderBatch();
}

function artworkCardHtml(artwork) {
  const avail = artwork.available === true || artwork.available === "True";
  const canAdmin = currentSession && isSiteAdmin(currentSession) && artwork.source === "supabase";
  const canDelete = canAdmin;
  return `
    <div class="col-md-4 col-sm-6 col-12 artwork-col">
      <div class="card artCard" id="${artwork.id}" year="${artwork.year || ""}" title="${escapeHtml(artwork.title || "")}" size="${artwork.size || ""}" medium="${artwork.medium || ""}" available="${avail}" data-source="${artwork.source || "local"}">
        ${canAdmin ? `<button type="button" class="artwork-avail-toggle ${avail ? "is-available" : ""}" data-toggle-avail="${artwork.id}" aria-label="Verfügbarkeit umschalten">${avail ? "verfügbar *" : "nicht verfügbar"}</button>` : ""}
        ${canDelete ? `<button type="button" class="artwork-delete-btn" data-delete-art="${artwork.id}" aria-label="Löschen" title="Löschen">×</button>` : ""}
        <img class="card-img-top" src="${artwork.image_url}" alt="${escapeHtml(artwork.title || "")}">
        <div class="card-body">
          <h5 class="card-title">"${escapeHtml(artwork.title || "")}"${avail ? "*" : ""}</h5>
          <p class="card-text">${artwork.year || ""}</p>
          <p class="card-text">${artwork.size || ""}</p>
          <p class="card-text">${artwork.medium || ""}</p>
        </div>
      </div>
    </div>`;
}

function bindArtCards() {
  document.querySelectorAll(".artCard").forEach((artCard) => {
    if (artCard.dataset.bound) return;
    artCard.dataset.bound = "1";
    artCard.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-art]") || e.target.closest("[data-toggle-avail]")) return;
      window.location.href = artworkPageUrl(artCard.id);
    });
  });
}

function bindDeleteButtons() {
  document.querySelectorAll("[data-delete-art]").forEach((btn) => {
    if (btn.dataset.deleteBound) return;
    btn.dataset.deleteBound = "1";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteArtwork(btn.dataset.deleteArt, btn);
    });
  });
}

function bindAvailabilityToggles() {
  document.querySelectorAll("[data-toggle-avail]").forEach((btn) => {
    if (btn.dataset.availBound) return;
    btn.dataset.availBound = "1";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const artwork = allArtworks.find((a) => a.id === btn.dataset.toggleAvail);
      if (!artwork) return;
      const next = !(artwork.available === true || artwork.available === "True");
      setArtworkAvailability(artwork.id, next, btn);
    });
  });
}

async function setArtworkAvailability(id, available, triggerBtn) {
  if (!currentSession || !isSiteAdmin(currentSession)) return;
  const artwork = allArtworks.find((a) => a.id === id);
  if (!artwork || artwork.source !== "supabase") return;

  const client = getSupabase();
  const msg = document.getElementById("artwork-upload-message");

  await withActionFeedback({
    button: triggerBtn,
    messageEl: msg,
    loadingLabel: "…",
    successLabel: available ? "✓ verfügbar" : "✓ gespeichert",
    successMessage: available ? "Als verfügbar markiert." : "Als nicht verfügbar markiert.",
    run: async () => {
      const { error } = await client.from("artworks").update({ available }).eq("id", id);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: async () => {
      allArtworks = await loadAllArtworks();
      renderGallery(showAvailable ? allArtworks.filter((a) => a.available === true || a.available === "True") : allArtworks);
    },
  });
}

async function deleteArtwork(id, triggerBtn) {
  if (!currentSession || !isSiteAdmin(currentSession)) return;
  const artwork = allArtworks.find((a) => a.id === id);
  if (!artwork || artwork.source !== "supabase") return;
  if (!confirm(`«${artwork.title}» wirklich löschen?`)) return;

  const client = getSupabase();
  const msg = document.getElementById("artwork-upload-message");

  await withActionFeedback({
    button: triggerBtn,
    messageEl: msg,
    loadingLabel: "…",
    successLabel: "✓",
    successMessage: "Kunstwerk gelöscht.",
    run: async () => {
      const paths = [artwork.image_path, artwork.thumb_path].filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await client.storage.from("artworks").remove(paths);
        if (storageError) throw new Error(storageError.message);
      }
      const { error } = await client.from("artworks").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: async () => {
      allArtworks = await loadAllArtworks();
      renderGallery(showAvailable ? allArtworks.filter((a) => a.available === true || a.available === "True") : allArtworks);
    },
  });
}

function setupArtworkUpload() {
  const form = document.getElementById("artwork-upload-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("artwork-upload-message");
    const submitBtn = form.querySelector("button[type='submit']");
    const client = getSupabase();

    if (!client || !currentSession) {
      showStatus(msg, "Bitte anmelden.", "error");
      return;
    }
    if (!isSiteAdmin(currentSession)) {
      showStatus(msg, "Nur der Administrator kann Kunstwerke hochladen.", "error");
      return;
    }

    const file = document.getElementById("artwork-file").files[0];
    const title = document.getElementById("artwork-title-input").value.trim();
    const year = document.getElementById("artwork-year-input").value.trim();
    const size = document.getElementById("artwork-size-input").value.trim();
    const medium = document.getElementById("artwork-medium-input").value.trim();
    const available = document.getElementById("artwork-available-input").checked;

    if (!file || !title) {
      showStatus(msg, "Bild und Titel sind Pflicht.", "error");
      return;
    }

    await withActionFeedback({
      button: submitBtn,
      messageEl: msg,
      loadingLabel: "Hochladen…",
      successLabel: "✓ Hinzugefügt",
      successMessage: "Kunstwerk erfolgreich hinzugefügt!",
      run: async () => {
        const id = slugify(title) + "-" + Date.now().toString(36);
        const { full, thumb } = await prepareArtworkImages(file);
        const imagePath = `${id}/full.jpg`;
        const thumbPath = `${id}/thumb.jpg`;

        const { error: uploadError } = await client.storage.from("artworks").upload(imagePath, full, {
          upsert: true,
          contentType: "image/jpeg",
        });
        if (uploadError) throw storageUploadError(uploadError, uploadError.message);

        const { error: thumbError } = await client.storage.from("artworks").upload(thumbPath, thumb, {
          upsert: true,
          contentType: "image/jpeg",
        });
        if (thumbError) throw storageUploadError(thumbError, thumbError.message);

        const { error: dbError } = await client.from("artworks").insert({
          id,
          title,
          year,
          size,
          medium,
          available,
          image_path: imagePath,
          thumb_path: thumbPath,
          source: "supabase",
        });

        if (dbError) throw new Error(dbError.message);
        return true;
      },
      onSuccess: async () => {
        form.reset();
        allArtworks = await loadAllArtworks();
        renderGallery(showAvailable ? allArtworks.filter((a) => a.available) : allArtworks);
      },
    });
  });
}
