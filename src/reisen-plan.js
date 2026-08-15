let tripId = null;
let tripData = null;
let tripDays = [];
let accommodations = [];
let transportOptions = [];
let usefulLinks = [];

document.addEventListener("DOMContentLoaded", async () => {
  tripId = tripIdFromUrl();
  const client = getSupabase();
  if (!client || !tripId) {
    document.getElementById("plan-loading").textContent = "Ungültige Anfrage — bitte vom Dashboard eine Reise wählen.";
    return;
  }

  try {
    await completeAuthFromUrl(client);
    const session = await waitForAuthSession(client);
    if (!session) {
      redirectToReisenLogin(`/reisen/plan.html?id=${encodeURIComponent(tripId)}`);
      return;
    }

    const access = await loadTripAccess(client, tripId, session.user.id);
    if (!access.trip || !access.isMember) {
      document.getElementById("plan-loading").textContent = "Kein Zugriff auf diese Reise.";
      return;
    }

    tripData = access.trip;
    setTripTitle(tripTitle());
    document.title = `Plan – ${tripTitle()}`;

    await loadPlanData(client);
    renderTripHeader();
    renderTripDetails();
    renderUsefulLinks();
    renderDays();
    wireTripDetailFields();
    wireAddLinkButton();

    document.getElementById("plan-loading").classList.add("d-none");
    document.getElementById("plan-content").classList.remove("d-none");
  } catch (err) {
    document.getElementById("plan-loading").textContent = err?.message || "Reiseplan konnte nicht geladen werden.";
  }
});

function tripTitle() {
  return tripData.name?.trim() || `${tripData.start_location} – ${tripData.end_location}`;
}

async function loadPlanData(client) {
  const [daysRes, accRes, transRes, linksRes] = await Promise.all([
    client.from("trip_days").select("*").eq("trip_id", tripId).order("day_date"),
    client.from("trip_accommodations").select("*").eq("trip_id", tripId).order("sort_order"),
    client.from("trip_transport_options").select("*").eq("trip_id", tripId).order("leg_order").order("sort_order"),
    client.from("trip_useful_links").select("*").eq("trip_id", tripId).order("sort_order"),
  ]);
  for (const res of [daysRes, accRes, transRes, linksRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  tripDays = daysRes.data || [];
  accommodations = accRes.data || [];
  transportOptions = transRes.data || [];
  usefulLinks = linksRes.data || [];
}

function renderTripHeader() {
  document.getElementById("plan-trip-title").textContent = tripTitle();
  document.getElementById("plan-trip-meta").textContent =
    `${formatTripDateRange(tripData)} · ${tripData.start_location} → ${tripData.end_location}`;
}

function renderTripDetails() {
  document.getElementById("trip-field-name").value = tripData.name || "";
  document.getElementById("trip-field-komoot").value = tripData.komoot_url || "";
  document.getElementById("trip-field-description").value = tripData.description || "";
}

function wireTripDetailFields() {
  const fields = [
    { id: "trip-field-name", column: "name" },
    { id: "trip-field-komoot", column: "komoot_url" },
    { id: "trip-field-description", column: "description" },
  ];
  fields.forEach(({ id, column }) => {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
      const value = el.value.trim();
      tripData[column] = value;
      debouncedSave(`trip.${column}`, async (client) => {
        const { error } = await client.from("trips").update({ [column]: value || (column === "komoot_url" ? null : "") }).eq("id", tripId);
        if (error) throw new Error(formatDbError(error.message));
      });
      if (column === "name") {
        setTripTitle(tripTitle());
        renderTripHeader();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Auto-Save
// ---------------------------------------------------------------------------

const saveTimers = new Map();

function debouncedSave(key, fn) {
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => runSave(fn), 600));
}

async function runSave(fn) {
  const client = getSupabase();
  showAutoSaveFeedback(null, "pending");
  try {
    await fn(client);
    showAutoSaveFeedback(null, "ok");
  } catch (err) {
    showAutoSaveFeedback(null, "error", err?.message || "Speichern fehlgeschlagen.");
  }
}

// ---------------------------------------------------------------------------
// Nützliche Links
// ---------------------------------------------------------------------------

function renderUsefulLinks() {
  const el = document.getElementById("useful-links-list");
  el.innerHTML = usefulLinks.length
    ? usefulLinks.map((link) => `
        <div class="builder-row reisen-link-row" data-link-id="${link.id}">
          <input type="text" class="form-control form-control-sm reisen-link-label" placeholder="Bezeichnung" value="${escapeHtml(link.label || "")}">
          <input type="text" class="form-control form-control-sm reisen-link-url" placeholder="https://…" value="${escapeHtml(link.url || "")}">
          ${link.url ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">↗</a>` : ""}
          <button type="button" class="btn btn-sm btn-outline-danger" data-remove-link="${link.id}" title="Entfernen">×</button>
        </div>`).join("")
    : `<p class="text-muted small planning-empty">Noch keine Links.</p>`;

  el.querySelectorAll(".reisen-link-row").forEach((row) => {
    const id = row.dataset.linkId;
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        const label = row.querySelector(".reisen-link-label").value.trim();
        const url = row.querySelector(".reisen-link-url").value.trim();
        const link = usefulLinks.find((l) => l.id === id);
        if (link) { link.label = label; link.url = url; }
        debouncedSave(`link.${id}`, async (client) => {
          const { error } = await client.from("trip_useful_links").update({ label, url }).eq("id", id);
          if (error) throw new Error(formatDbError(error.message));
        });
      });
    });
  });

  el.querySelectorAll("[data-remove-link]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.removeLink;
      await runSave(async (client) => {
        const { error } = await client.from("trip_useful_links").delete().eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
        usefulLinks = usefulLinks.filter((l) => l.id !== id);
        renderUsefulLinks();
      });
    });
  });
}

function wireAddLinkButton() {
  document.getElementById("btn-add-link").addEventListener("click", async () => {
    await runSave(async (client) => {
      const { data, error } = await client
        .from("trip_useful_links")
        .insert({ trip_id: tripId, label: "", url: "", sort_order: usefulLinks.length })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      usefulLinks.push(data);
      renderUsefulLinks();
      document.querySelector(`[data-link-id="${data.id}"] .reisen-link-label`)?.focus();
    });
  });
}

// ---------------------------------------------------------------------------
// Tage
// ---------------------------------------------------------------------------

function renderDays() {
  const el = document.getElementById("days-list");
  if (!tripDays.length) {
    el.innerHTML = `<p class="text-muted">Keine Tage vorhanden.</p>`;
    return;
  }
  el.innerHTML = tripDays.map((day, i) => renderDayCard(day, i)).join("");
  tripDays.forEach((day) => bindDayCard(day));
}

function renderDayCard(day, index) {
  const dayAccs = accommodations.filter((a) => a.day_id === day.id);
  const dayTrans = transportOptions.filter((t) => t.day_id === day.id);
  const mapUrl = day.map_image_path ? storagePublicUrl("trip-images", day.map_image_path) : "";
  const isLast = index === tripDays.length - 1;

  return `
    <article class="reisen-day-card" data-day-id="${day.id}">
      <div class="reisen-day-header">
        <span class="reisen-day-number">Tag ${index + 1}</span>
        <span class="reisen-day-date">${formatDayDate(day.day_date)}</span>
      </div>

      <div class="reisen-day-route-grid">
        <div>
          <label class="form-label form-label-sm">Start</label>
          <input type="text" class="form-control form-control-sm" data-day-field="start_place" value="${escapeHtml(day.start_place || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Ziel</label>
          <input type="text" class="form-control form-control-sm" data-day-field="end_place" value="${escapeHtml(day.end_place || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Distanz (km)</label>
          <input type="number" step="0.1" class="form-control form-control-sm" data-day-field="distance_km" value="${day.distance_km ?? ""}">
        </div>
        <div>
          <label class="form-label form-label-sm">Höhenmeter</label>
          <input type="number" step="1" class="form-control form-control-sm" data-day-field="elevation_gain_m" value="${day.elevation_gain_m ?? ""}">
        </div>
        <div>
          <label class="form-label form-label-sm">Fahrzeit</label>
          <input type="text" class="form-control form-control-sm" data-day-field="ride_time_estimate" placeholder="z.B. 5-6 Stunden" value="${escapeHtml(day.ride_time_estimate || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Routen-Link (Komoot)</label>
          <input type="text" class="form-control form-control-sm" data-day-field="komoot_url" placeholder="https://…" value="${escapeHtml(day.komoot_url || "")}">
        </div>
      </div>

      <div class="mb-2">
        <label class="form-label form-label-sm">Notizen</label>
        <textarea class="form-control form-control-sm" data-day-field="notes" rows="2">${escapeHtml(day.notes || "")}</textarea>
      </div>

      <div class="reisen-day-map">
        ${mapUrl
          ? `<img src="${escapeHtml(mapUrl)}" alt="Karte Tag ${index + 1}" class="reisen-day-map-img">
             <button type="button" class="btn btn-sm btn-outline-danger reisen-day-map-remove" data-remove-map>Karte entfernen</button>`
          : ""}
        <label class="btn btn-sm btn-outline-secondary reisen-upload-btn">
          ${mapUrl ? "Karte ersetzen" : "+ Karten-Screenshot"}
          <input type="file" accept="image/*" class="d-none" data-upload-map>
        </label>
      </div>

      <div class="reisen-day-sub">
        <h3 class="planning-subheading">Transport</h3>
        ${renderTransportGroups(day, dayTrans)}
        <div class="builder-add-row">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-add-transport>+ Transport-Option</button>
        </div>
      </div>

      ${isLast ? "" : `
      <div class="reisen-day-sub">
        <h3 class="planning-subheading">Übernachtung</h3>
        ${dayAccs.length
          ? dayAccs.map((a) => renderAccommodationRow(a, dayAccs.length > 1)).join("")
          : `<p class="text-muted small planning-empty">Noch keine Unterkunft erfasst.</p>`}
        <div class="builder-add-row">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-add-accommodation>+ Unterkunfts-Option</button>
        </div>
      </div>`}
    </article>`;
}

function renderTransportGroups(day, dayTrans) {
  if (!dayTrans.length) return `<p class="text-muted small planning-empty">Kein Transport erfasst.</p>`;

  const groups = new Map();
  dayTrans.forEach((t) => {
    const key = t.leg_label || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  return [...groups.entries()].map(([label, rows]) => `
    <div class="reisen-transport-group">
      ${label ? `<p class="reisen-transport-group-label">${escapeHtml(label)}</p>` : ""}
      ${rows.map((t) => renderTransportRow(t, rows.length > 1)).join("")}
    </div>`).join("");
}

function renderTransportRow(t, hasAlternatives) {
  const dep = t.departure_at ? datetimeLocalFromIso(t.departure_at) : "";
  const arr = t.arrival_at ? datetimeLocalFromIso(t.arrival_at) : "";
  return `
    <div class="reisen-option-row${t.is_selected ? " reisen-option-selected" : ""}" data-transport-id="${t.id}">
      <div class="reisen-option-grid reisen-transport-grid">
        <div>
          <label class="form-label form-label-sm">Etappe/Gruppe</label>
          <input type="text" class="form-control form-control-sm" data-t-field="leg_label" placeholder="z.B. Anreise Manuel" value="${escapeHtml(t.leg_label || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Wer</label>
          <input type="text" class="form-control form-control-sm" data-t-field="traveler_name" value="${escapeHtml(t.traveler_name || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Modus</label>
          <select class="form-select form-select-sm" data-t-field="mode">${transportModeOptionsHtml(t.mode)}</select>
        </div>
        <div>
          <label class="form-label form-label-sm">Anbieter</label>
          <input type="text" class="form-control form-control-sm" data-t-field="provider" placeholder="z.B. SBB" value="${escapeHtml(t.provider || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Von</label>
          <input type="text" class="form-control form-control-sm" data-t-field="from_place" value="${escapeHtml(t.from_place || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Nach</label>
          <input type="text" class="form-control form-control-sm" data-t-field="to_place" value="${escapeHtml(t.to_place || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Abfahrt</label>
          <input type="datetime-local" class="form-control form-control-sm" data-t-field="departure_at" value="${dep}">
        </div>
        <div>
          <label class="form-label form-label-sm">Ankunft</label>
          <input type="datetime-local" class="form-control form-control-sm" data-t-field="arrival_at" value="${arr}">
        </div>
        <div>
          <label class="form-label form-label-sm">Preis</label>
          <input type="number" step="0.01" class="form-control form-control-sm" data-t-field="price" value="${t.price ?? ""}">
        </div>
        <div>
          <label class="form-label form-label-sm">Währung</label>
          <input type="text" class="form-control form-control-sm" data-t-field="currency" value="${escapeHtml(t.currency || "CHF")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Buchungslink</label>
          <input type="text" class="form-control form-control-sm" data-t-field="booking_url" placeholder="https://…" value="${escapeHtml(t.booking_url || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Status</label>
          <select class="form-select form-select-sm" data-t-field="status">${statusOptionsHtml(t.status)}</select>
        </div>
      </div>
      <div class="reisen-option-footer">
        ${t.booking_url ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(t.booking_url)}" target="_blank" rel="noopener">Link öffnen ↗</a>` : ""}
        ${hasAlternatives ? `
          <label class="reisen-selected-toggle">
            <input type="radio" name="transport-selected-${escapeHtml(t.day_id)}-${escapeHtml(t.leg_label || "x")}" data-t-select ${t.is_selected ? "checked" : ""}>
            Gewählte Option
          </label>` : ""}
        <button type="button" class="btn btn-sm btn-outline-danger" data-remove-transport title="Entfernen">×</button>
      </div>
    </div>`;
}

function renderAccommodationRow(a, hasAlternatives) {
  const imgUrl = a.image_path ? storagePublicUrl("trip-images", a.image_path) : "";
  return `
    <div class="reisen-option-row${a.is_selected ? " reisen-option-selected" : ""}" data-accommodation-id="${a.id}">
      ${imgUrl ? `<div class="reisen-acc-image"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(a.name || "Unterkunft")}"></div>` : ""}
      <div class="reisen-option-grid reisen-acc-grid">
        <div>
          <label class="form-label form-label-sm">Name</label>
          <input type="text" class="form-control form-control-sm" data-a-field="name" value="${escapeHtml(a.name || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Ort/Hinweis</label>
          <input type="text" class="form-control form-control-sm" data-a-field="place_note" value="${escapeHtml(a.place_note || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Preis</label>
          <input type="number" step="0.01" class="form-control form-control-sm" data-a-field="price" value="${a.price ?? ""}">
        </div>
        <div>
          <label class="form-label form-label-sm">Währung</label>
          <input type="text" class="form-control form-control-sm" data-a-field="currency" value="${escapeHtml(a.currency || "CHF")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Buchungslink</label>
          <input type="text" class="form-control form-control-sm" data-a-field="booking_url" placeholder="https://…" value="${escapeHtml(a.booking_url || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Status</label>
          <select class="form-select form-select-sm" data-a-field="status">${statusOptionsHtml(a.status)}</select>
        </div>
        <div class="reisen-acc-notes">
          <label class="form-label form-label-sm">Notizen</label>
          <textarea class="form-control form-control-sm" data-a-field="notes" rows="2">${escapeHtml(a.notes || "")}</textarea>
        </div>
      </div>
      <div class="reisen-option-footer">
        ${statusBadgeHtml(a.status)}
        ${a.booking_url ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(a.booking_url)}" target="_blank" rel="noopener">Zur Buchung ↗</a>` : ""}
        <label class="btn btn-sm btn-outline-secondary reisen-upload-btn">
          ${imgUrl ? "Bild ersetzen" : "+ Bild"}
          <input type="file" accept="image/*" class="d-none" data-upload-acc-image>
        </label>
        ${hasAlternatives ? `
          <label class="reisen-selected-toggle">
            <input type="radio" name="acc-selected-${escapeHtml(a.day_id)}" data-a-select ${a.is_selected ? "checked" : ""}>
            Gewählte Option
          </label>` : ""}
        <button type="button" class="btn btn-sm btn-outline-danger" data-remove-accommodation title="Entfernen">×</button>
      </div>
    </div>`;
}

function bindDayCard(day) {
  const card = document.querySelector(`[data-day-id="${day.id}"]`);
  if (!card) return;

  card.querySelectorAll("[data-day-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.dataset.dayField;
      let value = input.value.trim();
      if (field === "distance_km" || field === "elevation_gain_m") {
        value = value === "" ? null : Number(value);
      } else if (field === "komoot_url") {
        value = value || null;
      }
      day[field] = value;
      debouncedSave(`day.${day.id}.${field}`, async (client) => {
        const { error } = await client.from("trip_days").update({ [field]: value }).eq("id", day.id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });
  });

  card.querySelector("[data-upload-map]")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runSave(async (client) => {
      const compressed = await compressImageFile(file, { maxEdge: 1600, quality: 0.85 });
      const path = `${tripId}/day-map/${day.id}.jpg`;
      const { error } = await client.storage.from("trip-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (error) throw storageUploadError(error);
      const { error: dbErr } = await client.from("trip_days").update({ map_image_path: path }).eq("id", day.id);
      if (dbErr) throw new Error(formatDbError(dbErr.message));
      day.map_image_path = path;
      rerenderDay(day);
    });
  });

  card.querySelector("[data-remove-map]")?.addEventListener("click", async () => {
    await runSave(async (client) => {
      if (day.map_image_path) {
        await client.storage.from("trip-images").remove([day.map_image_path]);
      }
      const { error } = await client.from("trip_days").update({ map_image_path: null }).eq("id", day.id);
      if (error) throw new Error(formatDbError(error.message));
      day.map_image_path = null;
      rerenderDay(day);
    });
  });

  card.querySelector("[data-add-transport]")?.addEventListener("click", async () => {
    await runSave(async (client) => {
      const dayTrans = transportOptions.filter((t) => t.day_id === day.id);
      const { data, error } = await client
        .from("trip_transport_options")
        .insert({ trip_id: tripId, day_id: day.id, sort_order: dayTrans.length })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      transportOptions.push(data);
      rerenderDay(day);
    });
  });

  card.querySelector("[data-add-accommodation]")?.addEventListener("click", async () => {
    await runSave(async (client) => {
      const dayAccs = accommodations.filter((a) => a.day_id === day.id);
      const { data, error } = await client
        .from("trip_accommodations")
        .insert({
          trip_id: tripId,
          day_id: day.id,
          sort_order: dayAccs.length,
          is_selected: dayAccs.length === 0,
        })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      accommodations.push(data);
      rerenderDay(day);
    });
  });

  card.querySelectorAll("[data-transport-id]").forEach((row) => bindTransportRow(day, row));
  card.querySelectorAll("[data-accommodation-id]").forEach((row) => bindAccommodationRow(day, row));
}

function rerenderDay(day) {
  const index = tripDays.indexOf(day);
  const card = document.querySelector(`[data-day-id="${day.id}"]`);
  if (!card || index < 0) return;
  card.outerHTML = renderDayCard(day, index);
  bindDayCard(day);
}

function bindTransportRow(day, row) {
  const id = row.dataset.transportId;
  const t = transportOptions.find((x) => x.id === id);
  if (!t) return;

  row.querySelectorAll("[data-t-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.dataset.tField;
      let value = input.value.trim();
      if (field === "price") value = value === "" ? null : Number(value);
      else if (field === "departure_at" || field === "arrival_at") value = isoFromDatetimeLocal(value);
      t[field] = value;
      debouncedSave(`transport.${id}.${field}`, async (client) => {
        const { error } = await client.from("trip_transport_options").update({ [field]: value }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });
  });

  row.querySelector("[data-t-select]")?.addEventListener("change", async () => {
    await runSave(async (client) => {
      const { error } = await client.from("trip_transport_options").update({ is_selected: true }).eq("id", id);
      if (error) throw new Error(formatDbError(error.message));
      transportOptions.forEach((x) => {
        if (x.day_id === t.day_id && x.leg_label === t.leg_label) x.is_selected = x.id === id;
      });
      rerenderDay(day);
    });
  });

  row.querySelector("[data-remove-transport]")?.addEventListener("click", async () => {
    if (!confirm("Transport-Option wirklich entfernen?")) return;
    await runSave(async (client) => {
      const { error } = await client.from("trip_transport_options").delete().eq("id", id);
      if (error) throw new Error(formatDbError(error.message));
      transportOptions = transportOptions.filter((x) => x.id !== id);
      rerenderDay(day);
    });
  });
}

function bindAccommodationRow(day, row) {
  const id = row.dataset.accommodationId;
  const a = accommodations.find((x) => x.id === id);
  if (!a) return;

  row.querySelectorAll("[data-a-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.dataset.aField;
      let value = input.value.trim();
      if (field === "price") value = value === "" ? null : Number(value);
      a[field] = value;
      debouncedSave(`acc.${id}.${field}`, async (client) => {
        const { error } = await client.from("trip_accommodations").update({ [field]: value }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });
  });

  row.querySelector("[data-a-select]")?.addEventListener("change", async () => {
    await runSave(async (client) => {
      const { error } = await client.from("trip_accommodations").update({ is_selected: true }).eq("id", id);
      if (error) throw new Error(formatDbError(error.message));
      accommodations.forEach((x) => {
        if (x.day_id === a.day_id) x.is_selected = x.id === id;
      });
      rerenderDay(day);
    });
  });

  row.querySelector("[data-upload-acc-image]")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runSave(async (client) => {
      const compressed = await compressImageFile(file, { maxEdge: 1600, quality: 0.85 });
      const path = `${tripId}/accommodation/${id}.jpg`;
      const { error } = await client.storage.from("trip-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (error) throw storageUploadError(error);
      const { error: dbErr } = await client.from("trip_accommodations").update({ image_path: path }).eq("id", id);
      if (dbErr) throw new Error(formatDbError(dbErr.message));
      a.image_path = path;
      rerenderDay(day);
    });
  });

  row.querySelector("[data-remove-accommodation]")?.addEventListener("click", async () => {
    if (!confirm("Unterkunfts-Option wirklich entfernen?")) return;
    await runSave(async (client) => {
      if (a.image_path) {
        await client.storage.from("trip-images").remove([a.image_path]);
      }
      const { error } = await client.from("trip_accommodations").delete().eq("id", id);
      if (error) throw new Error(formatDbError(error.message));
      accommodations = accommodations.filter((x) => x.id !== id);
      rerenderDay(day);
    });
  });
}
