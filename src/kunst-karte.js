// Kunst-Karte: wo sich die Bilder befinden. Nur für den Site-Admin sichtbar.
// Daten liegen in Supabase (public.artwork_locations, RLS nur für manuelzeltner@gmail.com),
// nicht im öffentlichen Code.

const STATUS_LABEL = { ok: "", unknown: "Standort unbekannt", gone: "existiert nicht mehr" };
let karteMap = null;
let karteLayer = null;
let karteArtworks = [];
let karteLocations = new Map();

document.addEventListener("DOMContentLoaded", async () => {
  karteArtworks = await loadAllArtworks();
  await initAuthUI({
    mode: "discreet",
    leadText: "Melde dich an, um die Karte zu sehen.",
    onAuthChange: (session) => showKarte(session),
  });
  if (!getSupabase()) document.getElementById("karte-locked").textContent = "Anmeldung momentan nicht verfügbar.";
});

async function showKarte(session) {
  const locked = document.getElementById("karte-locked");
  const content = document.getElementById("karte-content");
  if (!session || !isSiteAdmin(session)) {
    content.classList.add("d-none");
    locked.classList.remove("d-none");
    locked.textContent = session ? "Diese Seite ist privat." : "Diese Seite ist privat. Bitte anmelden.";
    return;
  }

  const { data, error } = await getSupabase().from("artwork_locations").select("*");
  if (error) {
    locked.textContent = `Standorte konnten nicht geladen werden: ${error.message}`;
    return;
  }
  karteLocations = new Map(data.map((l) => [l.artwork_id, l]));
  locked.classList.add("d-none");
  content.classList.remove("d-none");
  renderKarte();
}

function locOf(art) {
  return karteLocations.get(art.id) || { artwork_id: art.id, status: "unknown" };
}

// Gruppen: ein Punkt je Ort, darin die Bilder nach "bei wem"
function groupByPlace() {
  const places = new Map();
  const rest = [];
  karteArtworks.forEach((art) => {
    const loc = locOf(art);
    if (loc.status === "ok" && loc.lat != null && loc.lng != null) {
      const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
      if (!places.has(key)) places.set(key, { place: loc.place, lat: loc.lat, lng: loc.lng, items: [] });
      places.get(key).items.push({ art, loc });
    } else {
      rest.push({ art, loc });
    }
  });
  return { places: [...places.values()].sort((a, b) => b.items.length - a.items.length), rest };
}

function renderKarte() {
  const { places, rest } = groupByPlace();

  if (!karteMap) {
    karteMap = L.map("karte-map", { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(karteMap);
    karteLayer = L.layerGroup().addTo(karteMap);
  }
  karteLayer.clearLayers();

  places.forEach((p) => {
    const n = p.items.length;
    const icon = L.divIcon({
      className: "karte-marker",
      html: `<span>${n}</span>`,
      iconSize: [28 + Math.min(n, 12) * 2, 28 + Math.min(n, 12) * 2],
    });
    L.marker([p.lat, p.lng], { icon, title: p.place })
      .bindPopup(placePopupHtml(p), { minWidth: 220, maxWidth: 300 })
      .addTo(karteLayer);
  });
  if (places.length) {
    karteMap.fitBounds(places.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 11 });
  } else {
    karteMap.setView([46.8, 8.2], 7);
  }

  const located = places.reduce((s, p) => s + p.items.length, 0);
  document.getElementById("karte-summary").textContent =
    `${located} Bilder an ${places.length} Orten` + (rest.length ? `, ${rest.length} ohne Standort` : "");

  const list = document.getElementById("karte-list");
  list.innerHTML = [
    ...places.map((p) => placeSectionHtml(p.place, p.items)),
    rest.length ? placeSectionHtml("Ohne Standort", rest) : "",
  ].join("");
  bindEditForms(list);
}

function holdersOf(items) {
  return [...new Set(items.map((i) => i.loc.holder).filter(Boolean))];
}

function placePopupHtml(p) {
  const byHolder = new Map();
  p.items.forEach((i) => {
    const h = i.loc.holder || "";
    if (!byHolder.has(h)) byHolder.set(h, []);
    byHolder.get(h).push(i.art);
  });
  return `<div class="karte-popup"><strong>${escapeHtml(p.place || "")}</strong>
    ${[...byHolder].map(([h, arts]) => `
      ${h ? `<div class="karte-popup-holder">bei ${escapeHtml(h)}</div>` : ""}
      <div class="karte-popup-thumbs">
        ${arts.map((a) => `<a href="${artworkPageUrl(a.id)}" title="${escapeHtml(a.title || "ohne Titel")}"><img src="${escapeHtml(a.thumb_url)}" alt="${escapeHtml(a.title || "")}" loading="lazy"></a>`).join("")}
      </div>`).join("")}</div>`;
}

function placeSectionHtml(title, items) {
  const holders = holdersOf(items);
  return `
    <section class="karte-place">
      <h2>${escapeHtml(title || "")} <span class="karte-count">${items.length}</span></h2>
      ${holders.length ? `<p class="karte-holders">bei ${holders.map(escapeHtml).join(", ")}</p>` : ""}
      <ul class="karte-items">${items.map(itemHtml).join("")}</ul>
    </section>`;
}

function itemHtml({ art, loc }) {
  const statusText = STATUS_LABEL[loc.status] || "";
  return `
    <li class="karte-item" data-art="${escapeHtml(art.id)}">
      <a href="${artworkPageUrl(art.id)}" class="karte-item-thumb"><img src="${escapeHtml(art.thumb_url)}" alt="" loading="lazy"></a>
      <div class="karte-item-body">
        <div class="karte-item-title">${escapeHtml(art.title?.trim() || "ohne Titel")} <span class="text-muted">${escapeHtml(art.year || "")}</span></div>
        <div class="karte-item-where">${loc.status === "ok"
          ? `${escapeHtml(loc.place || "")}${loc.holder ? ` · bei ${escapeHtml(loc.holder)}` : ""}`
          : `<em>${escapeHtml(statusText)}</em>`}</div>
        <form class="karte-edit d-none">
          <input class="form-control form-control-sm" name="place" placeholder="Ort" value="${escapeHtml(loc.place || "")}">
          <input class="form-control form-control-sm" name="holder" placeholder="bei wem" value="${escapeHtml(loc.holder || "")}">
          <select class="form-select form-select-sm" name="status">
            <option value="ok"${loc.status === "ok" ? " selected" : ""}>bekannt</option>
            <option value="unknown"${loc.status === "unknown" ? " selected" : ""}>unbekannt</option>
            <option value="gone"${loc.status === "gone" ? " selected" : ""}>existiert nicht mehr</option>
          </select>
          <button type="submit" class="btn btn-primary btn-sm">Speichern</button>
          <span class="karte-edit-msg small"></span>
        </form>
      </div>
      <button type="button" class="karte-edit-toggle" aria-label="Standort bearbeiten" title="Standort bearbeiten">✎</button>
    </li>`;
}

function bindEditForms(root) {
  root.querySelectorAll(".karte-item").forEach((li) => {
    const form = li.querySelector(".karte-edit");
    li.querySelector(".karte-edit-toggle").addEventListener("click", () => form.classList.toggle("d-none"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector(".karte-edit-msg");
      const old = karteLocations.get(li.dataset.art) || {};
      const row = {
        artwork_id: li.dataset.art,
        place: form.place.value.trim() || null,
        holder: form.holder.value.trim() || null,
        status: form.status.value,
        lat: old.lat ?? null,
        lng: old.lng ?? null,
        updated_at: new Date().toISOString(),
      };
      if (row.status === "ok" && !row.place) {
        msg.textContent = "Bitte einen Ort angeben.";
        return;
      }
      if (row.status === "ok" && (row.place !== old.place || row.lat == null)) {
        msg.textContent = "Ort wird gesucht …";
        const geo = await geocode(row.place);
        if (!geo) {
          msg.textContent = "Ort nicht gefunden. Anders schreiben (z.B. «Zuchwil» statt Abkürzung)?";
          return;
        }
        row.lat = geo.lat;
        row.lng = geo.lng;
      }
      msg.textContent = "Speichert …";
      const { error } = await getSupabase().from("artwork_locations").upsert(row);
      if (error) {
        msg.textContent = `Fehler: ${error.message}`;
        return;
      }
      karteLocations.set(row.artwork_id, row);
      renderKarte();
    });
  });
}

async function geocode(place) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(place)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json();
    if (!data.length) return null;
    return { lat: Number(Number(data[0].lat).toFixed(4)), lng: Number(Number(data[0].lon).toFixed(4)) };
  } catch {
    return null;
  }
}
