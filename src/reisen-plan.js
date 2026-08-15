let tripId = null;
let tripData = null;
let tripDays = [];
let accommodations = [];
let transportOptions = [];
let usefulLinks = [];
let tripMembers = [];

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
    wireViewToggle();
    setViewMode("overview");

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
  const [daysRes, accRes, transRes, linksRes, membersRes] = await Promise.all([
    client.from("trip_days").select("*").eq("trip_id", tripId).order("day_date"),
    client.from("trip_accommodations").select("*").eq("trip_id", tripId).order("sort_order"),
    client.from("trip_transport_options").select("*").eq("trip_id", tripId).order("leg_order").order("sort_order"),
    client.from("trip_useful_links").select("*").eq("trip_id", tripId).order("sort_order"),
    client.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at"),
  ]);
  for (const res of [daysRes, accRes, transRes, linksRes, membersRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  tripDays = daysRes.data || [];
  accommodations = accRes.data || [];
  transportOptions = transRes.data || [];
  usefulLinks = linksRes.data || [];
  tripMembers = membersRes.data || [];
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

// ---------------------------------------------------------------------------
// Übersicht (read-only Ansicht)
// ---------------------------------------------------------------------------

function wireViewToggle() {
  document.getElementById("btn-view-overview").addEventListener("click", () => setViewMode("overview"));
  document.getElementById("btn-view-edit").addEventListener("click", () => setViewMode("edit"));
}

function setViewMode(mode) {
  const overviewBtn = document.getElementById("btn-view-overview");
  const editBtn = document.getElementById("btn-view-edit");
  const isOverview = mode === "overview";
  if (isOverview) renderOverview();
  document.getElementById("plan-overview").classList.toggle("d-none", !isOverview);
  document.getElementById("plan-edit").classList.toggle("d-none", isOverview);
  overviewBtn.className = `btn btn-sm ${isOverview ? "btn-primary" : "btn-outline-secondary"}`;
  editBtn.className = `btn btn-sm ${isOverview ? "btn-outline-secondary" : "btn-primary"}`;
}

function formatTimeShort(iso, dayDate) {
  if (!iso) return "–";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const isoDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (dayDate && isoDay !== dayDate) {
    return `${time} (${d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })})`;
  }
  return time;
}

function linkButtonHtml(url, label) {
  if (!url) return "";
  return `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)} ↗</a>`;
}

function renderOverview() {
  const el = document.getElementById("plan-overview");
  const ridingDays = tripDays.filter((d) => Number(d.distance_km) > 0);
  const totalKm = ridingDays.reduce((s, d) => s + Number(d.distance_km || 0), 0);
  const totalHm = tripDays.reduce((s, d) => s + Number(d.elevation_gain_m || 0), 0);
  const nights = Math.max(0, tripDays.length - 1);
  const coverUrl = tripData.cover_map_image_path ? storagePublicUrl("trip-images", tripData.cover_map_image_path) : "";
  const routePlaces = [];
  tripDays.forEach((d) => {
    [d.start_place, d.end_place].forEach((p) => {
      if (p && routePlaces[routePlaces.length - 1] !== p) routePlaces.push(p);
    });
  });
  const memberNames = tripMembers.map((m) => memberLabel(m)).filter(Boolean);

  el.innerHTML = `
    <div class="reisen-ov-stats">
      <div class="reisen-ov-stat"><span class="reisen-ov-stat-value">${totalKm ? Math.round(totalKm) + " km" : "–"}</span><span class="reisen-ov-stat-label">Distanz</span></div>
      <div class="reisen-ov-stat"><span class="reisen-ov-stat-value">${totalHm ? Math.round(totalHm).toLocaleString("de-CH") + " m" : "–"}</span><span class="reisen-ov-stat-label">Höhenmeter</span></div>
      <div class="reisen-ov-stat"><span class="reisen-ov-stat-value">${ridingDays.length || "–"}</span><span class="reisen-ov-stat-label">Fahrtage</span></div>
      <div class="reisen-ov-stat"><span class="reisen-ov-stat-value">${nights || "–"}</span><span class="reisen-ov-stat-label">Übernachtungen</span></div>
    </div>

    ${tripData.description ? `<p class="reisen-ov-description">${escapeHtml(tripData.description)}</p>` : ""}
    <div class="reisen-ov-meta">
      ${routePlaces.length ? `<p><strong>Route:</strong> ${routePlaces.map(escapeHtml).join(" → ")}</p>` : ""}
      <p><strong>Zeitraum:</strong> ${escapeHtml(formatTripDateRange(tripData))}</p>
      ${memberNames.length ? `<p><strong>Mitreisende:</strong> ${memberNames.map(escapeHtml).join(" & ")}</p>` : ""}
      ${tripData.komoot_url ? `<p>${linkButtonHtml(tripData.komoot_url, "Gesamtroute auf Komoot")}</p>` : ""}
    </div>

    ${coverUrl ? `
    <details class="reisen-ov-section" open>
      <summary>🗺️ Gesamtroute</summary>
      <div class="reisen-ov-section-body">
        <img src="${escapeHtml(coverUrl)}" alt="Gesamtroute" class="reisen-ov-map">
      </div>
    </details>` : ""}

    <details class="reisen-ov-section" open>
      <summary>📋 Überblick – Alle Orte &amp; Nächte</summary>
      <div class="reisen-ov-section-body reisen-ov-table-wrap">
        <table class="reisen-ov-table">
          <thead><tr><th>Tag</th><th>Datum</th><th>Route</th><th>km / HM</th><th>Unterkunft</th></tr></thead>
          <tbody>
            ${tripDays.map((d, i) => {
              const acc = accommodations.find((a) => a.day_id === d.id && a.is_selected)
                || accommodations.find((a) => a.day_id === d.id);
              const route = d.start_place && d.end_place && d.start_place !== d.end_place
                ? `${escapeHtml(d.start_place)} → ${escapeHtml(d.end_place)}`
                : escapeHtml(d.end_place || d.start_place || "–");
              const kmHm = d.distance_km ? `${d.distance_km} km / ${d.elevation_gain_m ?? "–"} m` : "–";
              return `<tr>
                <td>${i + 1}</td>
                <td>${new Date(`${d.day_date}T00:00:00`).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                <td>${route}</td>
                <td>${kmHm}</td>
                <td>${acc ? `${escapeHtml(acc.name || "–")} ${statusBadgeHtml(acc.status)}` : "–"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </details>

    <details class="reisen-ov-section" open>
      <summary>📅 Tag-für-Tag Details</summary>
      <div class="reisen-ov-section-body">
        ${tripDays.map((d, i) => renderOverviewDay(d, i)).join("")}
      </div>
    </details>

    ${usefulLinks.filter((l) => l.url).length ? `
    <details class="reisen-ov-section">
      <summary>📱 Nützliche Links</summary>
      <div class="reisen-ov-section-body">
        <ul class="reisen-ov-links">
          ${usefulLinks.filter((l) => l.url).map((l) => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)} ↗</a></li>`).join("")}
        </ul>
      </div>
    </details>` : ""}
  `;
}

function renderOverviewDay(day, index) {
  const dayAccs = accommodations.filter((a) => a.day_id === day.id);
  const dayTrans = transportOptions.filter((t) => t.day_id === day.id);
  const mapUrl = day.map_image_path ? storagePublicUrl("trip-images", day.map_image_path) : "";
  const dateStr = new Date(`${day.day_date}T00:00:00`).toLocaleDateString("de-CH", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const routeLabel = day.start_place && day.end_place && day.start_place !== day.end_place
    ? `${day.start_place} → ${day.end_place}`
    : (day.end_place || day.start_place || "");

  const infoRows = [
    day.distance_km ? `<div class="reisen-ov-info-row"><span>Distanz</span><span>${day.distance_km} km</span></div>` : "",
    day.elevation_gain_m ? `<div class="reisen-ov-info-row"><span>Höhenmeter</span><span>${day.elevation_gain_m} m ⬆️</span></div>` : "",
    day.ride_time_estimate ? `<div class="reisen-ov-info-row"><span>Fahrzeit</span><span>${escapeHtml(day.ride_time_estimate)}</span></div>` : "",
  ].filter(Boolean).join("");

  return `
    <details class="reisen-ov-day">
      <summary><strong>Tag ${index + 1}</strong> · ${escapeHtml(dateStr)}${routeLabel ? ` · ${escapeHtml(routeLabel)}` : ""}</summary>
      <div class="reisen-ov-day-body">
        ${infoRows}
        ${day.komoot_url ? `<p class="mt-2">${linkButtonHtml(day.komoot_url, "Route auf Komoot")}</p>` : ""}
        ${renderOverviewTransport(day, dayTrans)}
        ${renderOverviewAccommodations(dayAccs)}
        ${mapUrl ? `<img src="${escapeHtml(mapUrl)}" alt="Karte Tag ${index + 1}" class="reisen-ov-map">` : ""}
        ${day.notes ? `<p class="reisen-ov-notes">${escapeHtml(day.notes)}</p>` : ""}
      </div>
    </details>`;
}

function renderOverviewTransport(day, dayTrans) {
  if (!dayTrans.length) return "";
  const groups = new Map();
  dayTrans.forEach((t) => {
    const key = t.leg_label || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  return [...groups.entries()].map(([label, rows]) => {
    const selected = rows.filter((r) => r.is_selected);
    const shown = selected.length ? selected : rows;
    const alternatives = rows.filter((r) => !shown.includes(r));
    return `
      <div class="reisen-ov-transport">
        <h4 class="reisen-ov-subheading">🚆 ${escapeHtml(label || "Transport")}</h4>
        <div class="reisen-ov-table-wrap">
          <table class="reisen-ov-table">
            <thead><tr><th>Strecke</th><th>Abfahrt</th><th>Ankunft</th><th>Preis</th><th></th></tr></thead>
            <tbody>
              ${shown.map((t) => `
                <tr>
                  <td>${escapeHtml([t.from_place, t.to_place].filter(Boolean).join(" → ") || TRANSPORT_MODE_LABELS[t.mode] || "")}${t.provider ? ` <span class="text-muted">(${escapeHtml(t.provider)})</span>` : ""}</td>
                  <td>${formatTimeShort(t.departure_at, day.day_date)}</td>
                  <td>${formatTimeShort(t.arrival_at, day.day_date)}</td>
                  <td>${formatMoney(t.price, t.currency) || "–"}</td>
                  <td>${statusBadgeHtml(t.status)} ${t.booking_url ? `<a href="${escapeHtml(t.booking_url)}" target="_blank" rel="noopener">Link ↗</a>` : ""}</td>
                </tr>
                ${t.notes ? `<tr class="reisen-ov-note-row"><td colspan="5">${escapeHtml(t.notes)}</td></tr>` : ""}`).join("")}
            </tbody>
          </table>
        </div>
        ${alternatives.length ? `
        <details class="reisen-ov-alternatives">
          <summary>Weitere Optionen (${alternatives.length})</summary>
          ${alternatives.map((t) => `
            <div class="reisen-ov-alt-row">
              ${escapeHtml([t.from_place, t.to_place].filter(Boolean).join(" → "))} ·
              ${formatTimeShort(t.departure_at, day.day_date)}–${formatTimeShort(t.arrival_at, day.day_date)} ·
              ${formatMoney(t.price, t.currency) || "–"} ${statusBadgeHtml(t.status)}
              ${t.booking_url ? `<a href="${escapeHtml(t.booking_url)}" target="_blank" rel="noopener">Link ↗</a>` : ""}
            </div>`).join("")}
        </details>` : ""}
      </div>`;
  }).join("");
}

function renderOverviewAccommodations(dayAccs) {
  if (!dayAccs.length) return "";
  const selected = dayAccs.find((a) => a.is_selected) || dayAccs[0];
  const alternatives = dayAccs.filter((a) => a !== selected);
  const anySelected = dayAccs.some((a) => a.is_selected);

  return `
    <div class="reisen-ov-accommodation">
      <h4 class="reisen-ov-subheading">🏨 Übernachtung${anySelected ? "" : " (noch keine Option gewählt)"}</h4>
      ${renderOverviewAccCard(selected, anySelected)}
      ${alternatives.length ? `
      <details class="reisen-ov-alternatives"${anySelected ? "" : " open"}>
        <summary>Weitere Optionen (${alternatives.length})</summary>
        ${alternatives.map((a) => renderOverviewAccCard(a, false)).join("")}
      </details>` : ""}
    </div>`;
}

function renderOverviewAccCard(a, isSelected) {
  const imgUrl = a.image_path ? storagePublicUrl("trip-images", a.image_path) : "";
  return `
    <div class="reisen-ov-acc-card${isSelected ? " reisen-ov-acc-selected" : ""}">
      ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(a.name || "Unterkunft")}" class="reisen-ov-acc-img">` : ""}
      <div class="reisen-ov-acc-info">
        <p class="reisen-ov-acc-name">${escapeHtml(a.name || "Unbenannt")} ${statusBadgeHtml(a.status)}</p>
        ${a.price != null ? `<p class="reisen-ov-acc-price">${formatMoney(a.price, a.currency)}${a.place_note ? ` · ${escapeHtml(a.place_note)}` : ""}</p>` : (a.place_note ? `<p class="reisen-ov-acc-price">${escapeHtml(a.place_note)}</p>` : "")}
        ${a.notes ? `<p class="reisen-ov-acc-notes">${escapeHtml(a.notes)}</p>` : ""}
        ${a.booking_url ? `<p class="mb-0">${linkButtonHtml(a.booking_url, "Zur Buchung")}</p>` : ""}
      </div>
    </div>`;
}
