let eventId = null;
let session = null;
let slugManual = false;
let eventCreatorId = null;
let isEventCreator = false;

const timetableTracks = [];
const regFields = [];
const bringItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  const client = getSupabase();
  if (!client) return;

  await completeAuthFromUrl(client);

  const authSession = await waitForAuthSession(client);
  if (!authSession) {
    redirectToTrouvoLogin("/trouvo/edit.html");
    return;
  }
  session = authSession;

  const params = new URLSearchParams(window.location.search);
  eventId = params.get("id");

  bindUI();
  if (eventId) await loadEvent();
  else {
    document.getElementById("edit-loading").classList.add("d-none");
    document.getElementById("edit-content").classList.remove("d-none");
    renderAllLists();
    syncMultiDayUI();
    applySectionOpenState();
  }

  document.getElementById("ev-name").addEventListener("input", (e) => {
    if (!slugManual) document.getElementById("ev-slug").value = slugify(e.target.value);
  });
  document.getElementById("ev-slug").addEventListener("input", (e) => {
    slugManual = !!e.target.value.trim();
  });
  document.getElementById("ev-open-end").addEventListener("change", (e) => {
    document.getElementById("ev-end").disabled = e.target.checked;
  });
  document.getElementById("ev-multi-day").addEventListener("change", syncMultiDayUI);
  document.getElementById("ev-date").addEventListener("change", () => {
    syncEndDateMin();
    renderTimetableTracks();
  });
  document.getElementById("ev-end-date").addEventListener("change", () => renderTimetableTracks());
  document.getElementById("ev-start").addEventListener("change", () => {
    /* timetable defaults use start time when adding entries */
  });

  ["ev-name", "ev-date", "ev-start", "ev-end-date"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      document.getElementById(id)?.classList.remove("is-invalid");
    });
  });
});

function bindUI() {
  document.getElementById("btn-save").addEventListener("click", (e) => saveEvent(false, e.currentTarget));
  document.getElementById("btn-publish").addEventListener("click", (e) => saveEvent(true, e.currentTarget));
  document.getElementById("btn-copy-link").addEventListener("click", copyGuestLink);
  document.getElementById("btn-delete-event").addEventListener("click", deleteEvent);
  document.getElementById("btn-add-co-org").addEventListener("click", addCoOrganizer);
  document.getElementById("btn-add-track").addEventListener("click", () => {
    collectFromDOM();
    document.getElementById("section-timetable").open = true;
    addTimetableTrack();
  });
  document.getElementById("btn-add-field").addEventListener("click", () => {
    collectFromDOM();
    document.getElementById("section-fields").open = true;
    regFields.push({ label: "", field_type: "text", required: false, visible_to_others: false });
    renderFields();
  });
  document.getElementById("btn-add-bring").addEventListener("click", () => {
    collectFromDOM();
    document.getElementById("section-bring").open = true;
    bringItems.push({ name: "", quantity_mode: "fixed", quantity_value: 1, visible_to_others: true });
    renderBring();
  });
}

async function loadEvent() {
  const client = getSupabase();
  const { data: event, error } = await client.from("events").select("*").eq("id", eventId).single();
  if (error || !event) {
    document.getElementById("edit-loading").textContent = "Veranstaltung nicht gefunden.";
    return;
  }

  const access = await userCanManageEvent(client, eventId, session.user.id);
  if (!access.canManage) {
    document.getElementById("edit-loading").textContent = "Kein Zugriff auf diese Veranstaltung.";
    return;
  }

  eventCreatorId = event.organizer_id;
  isEventCreator = access.isCreator;
  updateCreatorUI();

  document.getElementById("edit-title").textContent = event.name;
  document.getElementById("ev-name").value = event.name;
  document.getElementById("ev-slug").value = event.slug;
  slugManual = true;
  document.getElementById("ev-description").value = event.description || "";
  document.getElementById("ev-location").value = event.location || "";
  document.getElementById("ev-phone").value = event.organizer_phone || "";
  document.getElementById("ev-date").value = event.event_date;
  const multiDay = isMultiDayEvent(event);
  document.getElementById("ev-multi-day").checked = multiDay;
  document.getElementById("ev-end-date").value = multiDay ? event.end_date : "";
  syncMultiDayUI();
  document.getElementById("ev-start").value = (event.start_time || "").slice(0, 5);
  document.getElementById("ev-end").value = (event.end_time || "").slice(0, 5);
  document.getElementById("ev-open-end").checked = event.open_end;
  document.getElementById("ev-end").disabled = event.open_end;
  document.getElementById("ev-attendee-visibility").value = getAttendeeVisibility(event);
  document.getElementById("ev-photos-link").value = event.photos_upload_url || event.photos_gallery_url || "";

  const [tracks, tt, fields, bring] = await Promise.all([
    client.from("event_timetable_tracks").select("*").eq("event_id", eventId).order("sort_order"),
    client.from("event_timetable_items").select("*").eq("event_id", eventId).order("sort_order"),
    client.from("event_registration_fields").select("*").eq("event_id", eventId).order("sort_order"),
    client.from("event_bring_items").select("*").eq("event_id", eventId).order("sort_order"),
  ]);

  timetableTracks.length = 0;
  const trackRows = tracks.data || [];
  const itemRows = tt.data || [];
  if (trackRows.length) {
    trackRows.forEach((track) => {
      timetableTracks.push({
        name: track.name || "",
        items: itemRows
          .filter((r) => r.track_id === track.id)
          .map((r) => ({
            item_date: r.item_date || event.event_date,
            start_time: (r.start_time || "").slice(0, 5),
            title: r.title,
            description: r.description || "",
          })),
      });
    });
  } else if (itemRows.length) {
    timetableTracks.push({
      name: "",
      items: itemRows.map((r) => ({
        item_date: r.item_date || event.event_date,
        start_time: (r.start_time || "").slice(0, 5),
        title: r.title,
        description: r.description || "",
      })),
    });
  }
  sortAllTimetableItems();

  regFields.length = 0;
  (fields.data || []).forEach((r) => regFields.push({
    label: r.label,
    field_type: r.field_type,
    required: r.required,
    visible_to_others: r.visible_to_others,
  }));

  bringItems.length = 0;
  (bring.data || []).forEach((r) => bringItems.push({
    name: r.name,
    quantity_mode: r.quantity_mode,
    quantity_value: Number(r.quantity_value),
    visible_to_others: r.visible_to_others,
  }));

  document.getElementById("edit-loading").classList.add("d-none");
  document.getElementById("edit-content").classList.remove("d-none");
  renderAllLists();
  applySectionOpenState();
  updateGuestLink(event.slug, event.is_published);
  if (isEventCreator) await loadCoOrganizers();
  applySectionOpenState();
}

function updateCreatorUI() {
  document.getElementById("btn-delete-event").classList.toggle("d-none", !isEventCreator);
  document.getElementById("co-organizers-section").classList.toggle("d-none", !isEventCreator || !eventId);
}

async function loadCoOrganizers() {
  const client = getSupabase();
  const list = document.getElementById("co-organizers-list");
  if (!eventId || !isEventCreator) {
    list.innerHTML = "";
    return;
  }

  const { data, error } = await client.rpc("list_event_co_organizers", { p_event_id: eventId });
  if (error) {
    list.innerHTML = `<p class="text-danger small">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    list.innerHTML = `<p class="text-muted small">Noch keine weiteren Veranstalter.</p>`;
    return;
  }

  list.innerHTML = data.map((row) => `
    <div class="co-organizer-row">
      <span>${escapeHtml(row.email)}</span>
      <button type="button" class="btn btn-sm btn-outline-danger" data-remove-co-org="${row.user_id}">Entfernen</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-remove-co-org]").forEach((btn) => {
    btn.addEventListener("click", () => removeCoOrganizer(btn.dataset.removeCoOrg, btn));
  });
}

async function addCoOrganizer() {
  const client = getSupabase();
  const msg = document.getElementById("edit-message");
  const email = document.getElementById("co-org-email").value.trim();
  const btn = document.getElementById("btn-add-co-org");

  if (!eventId) {
    showStatus(msg, "Bitte zuerst speichern, bevor du Veranstalter hinzufügst.", "error");
    return;
  }
  if (!email) {
    showStatus(msg, "Bitte E-Mail angeben.", "error");
    return;
  }

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: "Hinzufügen…",
    successLabel: "✓ Hinzugefügt",
    successMessage: "Veranstalter hinzugefügt.",
    run: async () => {
      const { error } = await client.rpc("add_event_co_organizer_by_email", {
        p_event_id: eventId,
        p_email: email,
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: async () => {
      document.getElementById("co-org-email").value = "";
      await loadCoOrganizers();
    },
  });
}

async function removeCoOrganizer(userId, btn) {
  if (!confirm("Veranstalter wirklich entfernen?")) return;
  const client = getSupabase();
  const msg = document.getElementById("edit-message");

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: "…",
    successLabel: "✓ Entfernt",
    successMessage: "Veranstalter entfernt.",
    run: async () => {
      const { error } = await client.rpc("remove_event_co_organizer", {
        p_event_id: eventId,
        p_user_id: userId,
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: loadCoOrganizers,
  });
}

async function deleteEvent() {
  if (!isEventCreator || !eventId) return;
  const name = document.getElementById("ev-name").value.trim() || "diese Veranstaltung";
  if (!confirm(`«${name}» wirklich unwiderruflich löschen?`)) return;

  const client = getSupabase();
  const msg = document.getElementById("edit-message");
  const btn = document.getElementById("btn-delete-event");

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: "Löschen…",
    successLabel: "✓ Gelöscht",
    successMessage: "Veranstaltung gelöscht.",
    run: async () => {
      const { error } = await client.from("events").delete().eq("id", eventId);
      if (error) throw new Error(error.message);
      return true;
    },
    redirectTo: "/trouvo/",
  });
}

function renderAllLists() {
  renderTimetableTracks();
  renderFields();
  renderBring();
}

function isFormMultiDay() {
  return document.getElementById("ev-multi-day")?.checked;
}

function getFormEventDates() {
  const event = {
    event_date: document.getElementById("ev-date")?.value,
    end_date: isFormMultiDay() ? document.getElementById("ev-end-date")?.value : null,
  };
  return listEventDates(event);
}

function syncMultiDayUI() {
  const multi = isFormMultiDay();
  document.getElementById("ev-end-date-wrap")?.classList.toggle("d-none", !multi);
  syncEndDateMin();
  renderTimetableTracks();
}

function syncEndDateMin() {
  const start = document.getElementById("ev-date")?.value;
  const endEl = document.getElementById("ev-end-date");
  if (!endEl || !start) return;
  endEl.min = start;
  if (endEl.value && endEl.value < start) endEl.value = start;
  if (isFormMultiDay() && !endEl.value) endEl.value = start;
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = (timeStr || "19:00").slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total % (24 * 60)) / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function nextTimetableTime(track) {
  const startTime = document.getElementById("ev-start")?.value || "19:00";
  const dates = getFormEventDates();
  const defaultDate = dates[0] || document.getElementById("ev-date")?.value || "";
  if (!track.items.length) {
    return { item_date: defaultDate, start_time: startTime };
  }
  const last = track.items[track.items.length - 1];
  return {
    item_date: last.item_date || defaultDate,
    start_time: addMinutesToTime(last.start_time || startTime, 30),
  };
}

function sortTimetableItems(items) {
  items.sort((a, b) => {
    const dateA = a.item_date || "";
    const dateB = b.item_date || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.start_time || "").localeCompare(b.start_time || "");
  });
}

function sortAllTimetableItems() {
  timetableTracks.forEach((track) => sortTimetableItems(track.items));
}

function addTimetableTrack() {
  const index = timetableTracks.length + 1;
  timetableTracks.push({ name: `Zeitstrahl ${index}`, items: [] });
  renderTimetableTracks();
}

function addTimetableItem(trackIndex) {
  collectFromDOM();
  const track = timetableTracks[trackIndex];
  if (!track) return;
  document.getElementById("section-timetable").open = true;
  track.items.push(nextTimetableTime(track));
  sortTimetableItems(track.items);
  renderTimetableTracks();
}

function timetableHasContent() {
  return timetableTracks.some((track) => track.name.trim() || track.items.some((item) => item.title || item.description));
}

function sectionHasCoOrganizers() {
  const list = document.getElementById("co-organizers-list");
  return !!list?.querySelector(".co-organizer-row");
}

function applySectionOpenState() {
  setSectionOpen("section-timetable", timetableHasContent());
  setSectionOpen("section-fields", regFields.length > 0);
  setSectionOpen("section-bring", bringItems.length > 0);
  setSectionOpen("section-visibility", document.getElementById("ev-attendee-visibility")?.value !== "none");
  setSectionOpen("section-photos", !!document.getElementById("ev-photos-link")?.value.trim());
  setSectionOpen("co-organizers-section", sectionHasCoOrganizers());
}

function setSectionOpen(id, open) {
  const el = document.getElementById(id);
  if (el?.tagName === "DETAILS") el.open = !!open;
}

function photosPayloadFromForm() {
  const link = document.getElementById("ev-photos-link").value.trim();
  return {
    photos_upload_url: link || null,
    photos_upload_enabled: !!link,
    photos_show_preview: false,
    photos_preview_text: null,
    photos_gallery_url: null,
    photos_closes_at: null,
  };
}

function renderTimetableTracks() {
  const el = document.getElementById("timetable-tracks");
  const multiDay = isFormMultiDay();
  const dates = getFormEventDates();

  if (!timetableTracks.length) {
    el.innerHTML = `<p class="text-muted small">Noch keine Zeitstrahlen. Mit «+ Zeitstrahl» starten.</p>`;
    return;
  }

  el.innerHTML = timetableTracks.map((track, trackIndex) => `
    <div class="timetable-track-block" data-track="${trackIndex}">
      <div class="timetable-track-head">
        <input type="text" class="form-control form-control-sm track-name" placeholder="Name des Zeitstrahls" value="${escapeHtml(track.name)}">
        <div class="timetable-track-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary btn-add-tt-item" data-track="${trackIndex}">+ Eintrag</button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-remove-track" data-track="${trackIndex}">×</button>
        </div>
      </div>
      ${track.items.length ? track.items.map((item, itemIndex) => `
        <div class="builder-row timeline-row ${multiDay ? "timeline-row-multiday" : ""}" data-track="${trackIndex}" data-i="${itemIndex}">
          ${multiDay ? `<select class="form-select form-select-sm tt-date">${buildDateSelectOptions(item.item_date || dates[0])}</select>` : ""}
          <input type="time" class="form-control form-control-sm tt-time" value="${item.start_time}">
          <input type="text" class="form-control form-control-sm tt-title" placeholder="Titel" value="${escapeHtml(item.title)}">
          <input type="text" class="form-control form-control-sm tt-desc" placeholder="Beschreibung (optional)" value="${escapeHtml(item.description)}">
          <button type="button" class="btn btn-sm btn-outline-danger btn-remove-tt">×</button>
        </div>
      `).join("") : `<p class="text-muted small timetable-track-empty">Noch keine Einträge in diesem Zeitstrahl.</p>`}
    </div>
  `).join("");

  el.querySelectorAll(".btn-add-tt-item").forEach((btn) => {
    btn.addEventListener("click", () => addTimetableItem(Number(btn.dataset.track)));
  });

  el.querySelectorAll(".btn-remove-track").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      timetableTracks.splice(Number(btn.dataset.track), 1);
      renderTimetableTracks();
    });
  });

  el.querySelectorAll(".btn-remove-tt").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      const row = btn.closest(".timeline-row");
      timetableTracks[Number(row.dataset.track)].items.splice(Number(row.dataset.i), 1);
      renderTimetableTracks();
    });
  });
}

function buildDateSelectOptions(selectedDate) {
  const dates = getFormEventDates();
  const fallback = dates[0] || "";
  const selected = selectedDate || fallback;
  return dates.map((d) => `<option value="${d}"${d === selected ? " selected" : ""}>${escapeHtml(formatTimetableDay(d))}</option>`).join("");
}

function renderTimetable() {
  renderTimetableTracks();
}

function renderFields() {
  const el = document.getElementById("fields-list");
  if (!regFields.length) {
    el.innerHTML = `<p class="text-muted small">Keine zusätzlichen Felder.</p>`;
    return;
  }
  el.innerHTML = regFields.map((f, i) => `
    <div class="builder-row field-row" data-i="${i}">
      <input type="text" class="form-control form-control-sm f-label" placeholder="Feldname" value="${escapeHtml(f.label)}">
      <select class="form-select form-select-sm f-type">
        <option value="text" ${f.field_type === "text" ? "selected" : ""}>Text</option>
        <option value="textarea" ${f.field_type === "textarea" ? "selected" : ""}>Text (lang)</option>
        <option value="checkbox" ${f.field_type === "checkbox" ? "selected" : ""}>Checkbox</option>
      </select>
      <label class="form-check-label small"><input type="checkbox" class="form-check-input f-req" ${f.required ? "checked" : ""}> Pflicht</label>
      <label class="form-check-label small"><input type="checkbox" class="form-check-input f-vis" ${f.visible_to_others ? "checked" : ""}> Für Gäste sichtbar</label>
      <button type="button" class="btn btn-sm btn-outline-danger btn-remove-field">×</button>
    </div>
  `).join("");

  el.querySelectorAll(".btn-remove-field").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      regFields.splice(Number(btn.closest(".field-row").dataset.i), 1);
      renderFields();
    });
  });
}

function renderBring() {
  const el = document.getElementById("bring-list");
  if (!bringItems.length) {
    el.innerHTML = `<p class="text-muted small">Keine Mitbringsel-Items.</p>`;
    return;
  }
  el.innerHTML = bringItems.map((b, i) => `
    <div class="builder-row bring-row" data-i="${i}">
      <input type="text" class="form-control form-control-sm b-name" placeholder="z.B. Salat" value="${escapeHtml(b.name)}">
      <select class="form-select form-select-sm b-mode">
        <option value="fixed" ${b.quantity_mode === "fixed" ? "selected" : ""}>Fixe Menge</option>
        <option value="per_guest" ${b.quantity_mode === "per_guest" ? "selected" : ""}>Pro Anmeldung</option>
      </select>
      <input type="number" class="form-control form-control-sm b-qty" min="0.1" step="0.1" value="${b.quantity_value}">
      <label class="form-check-label small"><input type="checkbox" class="form-check-input b-vis" ${b.visible_to_others ? "checked" : ""}> Für Gäste sichtbar</label>
      <button type="button" class="btn btn-sm btn-outline-danger btn-remove-bring">×</button>
    </div>
  `).join("");

  el.querySelectorAll(".btn-remove-bring").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      bringItems.splice(Number(btn.closest(".bring-row").dataset.i), 1);
      renderBring();
    });
  });
}

function collectFromDOM() {
  document.querySelectorAll(".timetable-track-block").forEach((block, trackIndex) => {
    if (!timetableTracks[trackIndex]) return;
    timetableTracks[trackIndex].name = block.querySelector(".track-name")?.value.trim() || "";
    const defaultDate = getFormEventDates()[0] || document.getElementById("ev-date")?.value || "";
    block.querySelectorAll(".timeline-row").forEach((row, itemIndex) => {
      if (!timetableTracks[trackIndex].items[itemIndex]) return;
      const item = timetableTracks[trackIndex].items[itemIndex];
      item.item_date = row.querySelector(".tt-date")?.value || defaultDate;
      item.start_time = row.querySelector(".tt-time").value;
      item.title = row.querySelector(".tt-title").value.trim();
      item.description = row.querySelector(".tt-desc").value.trim();
    });
    sortTimetableItems(timetableTracks[trackIndex].items);
  });
  document.querySelectorAll(".field-row").forEach((row, i) => {
    if (!regFields[i]) return;
    regFields[i].label = row.querySelector(".f-label").value.trim();
    regFields[i].field_type = row.querySelector(".f-type").value;
    regFields[i].required = row.querySelector(".f-req").checked;
    regFields[i].visible_to_others = row.querySelector(".f-vis").checked;
  });
  document.querySelectorAll(".bring-row").forEach((row, i) => {
    if (!bringItems[i]) return;
    bringItems[i].name = row.querySelector(".b-name").value.trim();
    bringItems[i].quantity_mode = row.querySelector(".b-mode").value;
    bringItems[i].quantity_value = Number(row.querySelector(".b-qty").value) || 1;
    bringItems[i].visible_to_others = row.querySelector(".b-vis").checked;
  });
}

async function saveEvent(publish, triggerBtn) {
  collectFromDOM();
  const client = getSupabase();
  const msg = document.getElementById("edit-message");
  const btn = triggerBtn || document.getElementById(publish ? "btn-publish" : "btn-save");

  const name = document.getElementById("ev-name").value.trim();
  const slug = document.getElementById("ev-slug").value.trim() || slugify(name);
  const startTime = document.getElementById("ev-start").value;
  if (!validateEventForm(msg)) return;

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: publish ? "Veröffentlichen…" : "Speichern…",
    successLabel: publish ? "✓ Veröffentlicht" : "✓ Gespeichert",
    successMessage: publish ? "Veranstaltung veröffentlicht!" : "Veranstaltung gespeichert.",
    run: async () => {
      const { user } = await ensureWriteSession(client);
      session = { user };

      const multiDay = isFormMultiDay();
      const startDate = document.getElementById("ev-date").value;
      const endDateVal = multiDay ? document.getElementById("ev-end-date").value : null;

      const payload = {
        name,
        slug,
        description: document.getElementById("ev-description").value.trim(),
        location: document.getElementById("ev-location").value.trim(),
        organizer_phone: document.getElementById("ev-phone").value.trim() || null,
        event_date: startDate,
        end_date: multiDay && endDateVal && endDateVal !== startDate ? endDateVal : null,
        start_time: startTime,
        end_time: document.getElementById("ev-open-end").checked ? null : document.getElementById("ev-end").value || null,
        open_end: document.getElementById("ev-open-end").checked,
        attendee_visibility: document.getElementById("ev-attendee-visibility").value,
        show_attendee_list: document.getElementById("ev-attendee-visibility").value === "full",
        ...photosPayloadFromForm(),
        is_published: publish ? true : undefined,
      };

      let savedId = eventId;
      if (eventId) {
        const updatePayload = { ...payload };
        if (!publish) delete updatePayload.is_published;
        else updatePayload.is_published = true;
        const { error } = await client.from("events").update(updatePayload).eq("id", eventId);
        if (error) throw new Error(formatDbError(error.message));
      } else {
        const rpcPayload = {
          slug,
          name: payload.name,
          description: payload.description,
          location: payload.location,
          organizer_phone: payload.organizer_phone || "",
          event_date: payload.event_date,
          end_date: payload.end_date || "",
          start_time: payload.start_time,
          end_time: payload.end_time || "",
          open_end: payload.open_end,
          attendee_visibility: payload.attendee_visibility,
          show_attendee_list: payload.show_attendee_list,
          photos_show_preview: false,
          photos_preview_text: "",
          photos_upload_enabled: payload.photos_upload_enabled,
          photos_upload_url: payload.photos_upload_url || "",
          photos_gallery_url: "",
          photos_closes_at: "",
          is_published: publish,
        };
        const { data, error } = await client.rpc("create_trouvo_event", { p_payload: rpcPayload }).single();
        if (error) throw new Error(formatDbError(error.message));
        savedId = data.id;
        eventId = data.id;
        eventCreatorId = data.organizer_id;
        isEventCreator = true;
        history.replaceState({}, "", `?id=${savedId}`);
        updateCreatorUI();
      }

      await client.from("event_timetable_items").delete().eq("event_id", savedId);
      await client.from("event_timetable_tracks").delete().eq("event_id", savedId);

      collectFromDOM();
      sortAllTimetableItems();
      const multiDaySave = isFormMultiDay();

      for (let ti = 0; ti < timetableTracks.length; ti++) {
        const track = timetableTracks[ti];
        const hasItems = track.items.some((item) => item.title);
        if (!track.name.trim() && !hasItems) continue;

        const { data: trackRow, error: trackErr } = await client
          .from("event_timetable_tracks")
          .insert({ event_id: savedId, name: track.name.trim(), sort_order: ti })
          .select("id")
          .single();
        if (trackErr) throw new Error(formatDbError(trackErr.message));

        const ttRows = track.items
          .filter((item) => item.title)
          .map((item, ii) => ({
            event_id: savedId,
            track_id: trackRow.id,
            item_date: multiDaySave ? item.item_date : null,
            start_time: item.start_time,
            title: item.title,
            description: item.description,
            sort_order: ii,
          }));
        if (ttRows.length) {
          const { error } = await client.from("event_timetable_items").insert(ttRows);
          if (error) throw new Error(formatDbError(error.message));
        }
      }

      const fieldRows = regFields.filter((f) => f.label).map((f, i) => ({
        event_id: savedId, label: f.label, field_type: f.field_type, required: f.required, visible_to_others: f.visible_to_others, sort_order: i,
      }));

      await client.from("event_registration_fields").delete().eq("event_id", savedId);
      await client.from("event_bring_items").delete().eq("event_id", savedId);

      if (fieldRows.length) {
        const { error } = await client.from("event_registration_fields").insert(fieldRows);
        if (error) throw new Error(formatDbError(error.message));
      }

      const bringRows = bringItems.filter((b) => b.name).map((b, i) => ({
        event_id: savedId, name: b.name, quantity_mode: b.quantity_mode, quantity_value: b.quantity_value, visible_to_others: b.visible_to_others, sort_order: i,
      }));
      if (bringRows.length) {
        const { error } = await client.from("event_bring_items").insert(bringRows);
        if (error) throw new Error(formatDbError(error.message));
      }

      const { data: ev } = await client.from("events").select("slug, is_published").eq("id", savedId).single();
      return { slug: ev.slug, isPublished: ev.is_published, name, publish };
    },
    onSuccess: async (result) => {
      document.getElementById("edit-title").textContent = result.name;
      updateGuestLink(result.slug, result.isPublished);
      if (isEventCreator) await loadCoOrganizers();
    },
    redirectTo: publish ? `/trouvo/e/?slug=${encodeURIComponent(slug)}` : null,
  });
}

function validateEventForm(msg) {
  document.querySelectorAll("#edit-content .is-invalid").forEach((el) => el.classList.remove("is-invalid"));

  const checks = [
    { id: "ev-name", label: "Name" },
    { id: "ev-date", label: "Datum" },
    { id: "ev-start", label: "Startzeit" },
  ];

  for (const { id, label } of checks) {
    const el = document.getElementById(id);
    if (!el?.value.trim()) {
      el?.classList.add("is-invalid");
      showFormFeedback(msg, `${label} ist Pflicht.`, "error", el);
      return false;
    }
  }

  if (isFormMultiDay()) {
    const endEl = document.getElementById("ev-end-date");
    const startDate = document.getElementById("ev-date").value;
    if (!endEl?.value) {
      endEl?.classList.add("is-invalid");
      showFormFeedback(msg, "Enddatum ist Pflicht bei mehrtägigen Events.", "error", endEl);
      return false;
    }
    if (endEl.value < startDate) {
      endEl.classList.add("is-invalid");
      showFormFeedback(msg, "Enddatum darf nicht vor dem Startdatum liegen.", "error", endEl);
      return false;
    }
  }

  showStatus(msg, "", "info");
  return true;
}

function updateGuestLink(slug, published) {
  const box = document.getElementById("guest-link-box");
  const url = siteUrl(`/trouvo/e/?slug=${encodeURIComponent(slug)}`);
  document.getElementById("guest-link-url").textContent = url;
  box.classList.toggle("d-none", !published);
}

function copyGuestLink() {
  const url = document.getElementById("guest-link-url").textContent;
  const btn = document.getElementById("btn-copy-link");
  navigator.clipboard.writeText(url).then(() => {
    const snapshot = { text: btn.textContent, disabled: btn.disabled, className: btn.className };
    flashButtonSuccess(btn, snapshot, "✓ Kopiert", 1500);
  });
}
