let eventId = null;
let session = null;
let slugManual = false;
let eventCreatorId = null;
let isEventCreator = false;

const timetableItems = [];
const regFields = [];
const bringItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  const client = getSupabase();
  if (!client) return;

  const { data: { session: s } } = await client.auth.getSession();
  if (!s) {
    window.location.href = "/trouvo/";
    return;
  }
  session = s;

  const params = new URLSearchParams(window.location.search);
  eventId = params.get("id");

  bindUI();
  if (eventId) await loadEvent();
  else {
    document.getElementById("edit-loading").classList.add("d-none");
    document.getElementById("edit-content").classList.remove("d-none");
    renderAllLists();
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
});

function bindUI() {
  document.getElementById("btn-save").addEventListener("click", (e) => saveEvent(false, e.currentTarget));
  document.getElementById("btn-publish").addEventListener("click", (e) => saveEvent(true, e.currentTarget));
  document.getElementById("btn-copy-link").addEventListener("click", copyGuestLink);
  document.getElementById("btn-delete-event").addEventListener("click", deleteEvent);
  document.getElementById("btn-add-co-org").addEventListener("click", addCoOrganizer);
  document.getElementById("btn-add-timetable").addEventListener("click", () => {
    collectFromDOM();
    timetableItems.push({ start_time: "18:00", title: "", description: "" });
    renderTimetable();
  });
  document.getElementById("btn-add-field").addEventListener("click", () => {
    collectFromDOM();
    regFields.push({ label: "", field_type: "text", required: false, visible_to_others: false });
    renderFields();
  });
  document.getElementById("btn-add-bring").addEventListener("click", () => {
    collectFromDOM();
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
  document.getElementById("ev-start").value = (event.start_time || "").slice(0, 5);
  document.getElementById("ev-end").value = (event.end_time || "").slice(0, 5);
  document.getElementById("ev-open-end").checked = event.open_end;
  document.getElementById("ev-end").disabled = event.open_end;
  document.getElementById("ev-attendee-visibility").value = getAttendeeVisibility(event);
  document.getElementById("ev-photos-preview").checked = !!event.photos_show_preview;
  document.getElementById("ev-photos-preview-text").value = event.photos_preview_text || "";
  document.getElementById("ev-photos-upload-enabled").checked = !!event.photos_upload_enabled;
  document.getElementById("ev-photos-upload-url").value = event.photos_upload_url || "";
  document.getElementById("ev-photos-gallery-url").value = event.photos_gallery_url || "";
  document.getElementById("ev-photos-closes").value = event.photos_closes_at || "";

  const [tt, fields, bring] = await Promise.all([
    client.from("event_timetable_items").select("*").eq("event_id", eventId).order("sort_order"),
    client.from("event_registration_fields").select("*").eq("event_id", eventId).order("sort_order"),
    client.from("event_bring_items").select("*").eq("event_id", eventId).order("sort_order"),
  ]);

  timetableItems.length = 0;
  (tt.data || []).forEach((r) => timetableItems.push({
    start_time: (r.start_time || "").slice(0, 5),
    title: r.title,
    description: r.description || "",
  }));

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
  updateGuestLink(event.slug, event.is_published);
  if (isEventCreator) await loadCoOrganizers();
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
  renderTimetable();
  renderFields();
  renderBring();
}

function renderTimetable() {
  const el = document.getElementById("timetable-list");
  if (!timetableItems.length) {
    el.innerHTML = `<p class="text-muted small">Noch kein Zeitplan. Optional Einträge hinzufügen.</p>`;
    return;
  }
  el.innerHTML = timetableItems.map((item, i) => `
    <div class="builder-row timeline-row" data-i="${i}">
      <input type="time" class="form-control form-control-sm tt-time" value="${item.start_time}">
      <input type="text" class="form-control form-control-sm tt-title" placeholder="Titel" value="${escapeHtml(item.title)}">
      <input type="text" class="form-control form-control-sm tt-desc" placeholder="Beschreibung (optional)" value="${escapeHtml(item.description)}">
      <button type="button" class="btn btn-sm btn-outline-danger btn-remove-tt">×</button>
    </div>
  `).join("");

  el.querySelectorAll(".btn-remove-tt").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      timetableItems.splice(Number(btn.closest(".timeline-row").dataset.i), 1);
      renderTimetable();
    });
  });
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
  document.querySelectorAll(".timeline-row").forEach((row, i) => {
    if (!timetableItems[i]) return;
    timetableItems[i].start_time = row.querySelector(".tt-time").value;
    timetableItems[i].title = row.querySelector(".tt-title").value.trim();
    timetableItems[i].description = row.querySelector(".tt-desc").value.trim();
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
  if (!name || !document.getElementById("ev-date").value) {
    showStatus(msg, "Name und Datum sind Pflicht.", "error");
    return;
  }

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: publish ? "Veröffentlichen…" : "Speichern…",
    successLabel: publish ? "✓ Veröffentlicht" : "✓ Gespeichert",
    successMessage: publish ? "Veranstaltung veröffentlicht!" : "Veranstaltung gespeichert.",
    run: async () => {
      const payload = {
        name,
        slug,
        description: document.getElementById("ev-description").value.trim(),
        location: document.getElementById("ev-location").value.trim(),
        organizer_phone: document.getElementById("ev-phone").value.trim() || null,
        event_date: document.getElementById("ev-date").value,
        start_time: document.getElementById("ev-start").value,
        end_time: document.getElementById("ev-open-end").checked ? null : document.getElementById("ev-end").value || null,
        open_end: document.getElementById("ev-open-end").checked,
        attendee_visibility: document.getElementById("ev-attendee-visibility").value,
        show_attendee_list: document.getElementById("ev-attendee-visibility").value === "full",
        photos_show_preview: document.getElementById("ev-photos-preview").checked,
        photos_preview_text: document.getElementById("ev-photos-preview-text").value.trim() || null,
        photos_upload_enabled: document.getElementById("ev-photos-upload-enabled").checked,
        photos_upload_url: document.getElementById("ev-photos-upload-url").value.trim() || null,
        photos_gallery_url: document.getElementById("ev-photos-gallery-url").value.trim() || null,
        photos_closes_at: document.getElementById("ev-photos-closes").value || null,
        is_published: publish ? true : undefined,
      };

      if (payload.photos_upload_enabled && !payload.photos_upload_url) {
        throw new Error("Für den Foto-Upload brauchst du einen Upload-Link.");
      }
      let savedId = eventId;
      if (eventId) {
        const updatePayload = { ...payload };
        if (!publish) delete updatePayload.is_published;
        else updatePayload.is_published = true;
        const { error } = await client.from("events").update(updatePayload).eq("id", eventId);
        if (error) throw new Error(error.message);
      } else {
        payload.organizer_id = session.user.id;
        payload.is_published = publish;
        const { data, error } = await client.from("events").insert(payload).select("id, slug, is_published, organizer_id").single();
        if (error) throw new Error(error.message);
        savedId = data.id;
        eventId = data.id;
        eventCreatorId = data.organizer_id;
        isEventCreator = true;
        history.replaceState({}, "", `?id=${savedId}`);
        updateCreatorUI();
      }

      await client.from("event_timetable_items").delete().eq("event_id", savedId);
      await client.from("event_registration_fields").delete().eq("event_id", savedId);
      await client.from("event_bring_items").delete().eq("event_id", savedId);

      const ttRows = timetableItems.filter((t) => t.title).map((t, i) => ({
        event_id: savedId, start_time: t.start_time, title: t.title, description: t.description, sort_order: i,
      }));
      if (ttRows.length) await client.from("event_timetable_items").insert(ttRows);

      const fieldRows = regFields.filter((f) => f.label).map((f, i) => ({
        event_id: savedId, label: f.label, field_type: f.field_type, required: f.required, visible_to_others: f.visible_to_others, sort_order: i,
      }));
      if (fieldRows.length) await client.from("event_registration_fields").insert(fieldRows);

      const bringRows = bringItems.filter((b) => b.name).map((b, i) => ({
        event_id: savedId, name: b.name, quantity_mode: b.quantity_mode, quantity_value: b.quantity_value, visible_to_others: b.visible_to_others, sort_order: i,
      }));
      if (bringRows.length) await client.from("event_bring_items").insert(bringRows);

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

function updateGuestLink(slug, published) {
  const box = document.getElementById("guest-link-box");
  const url = `${window.location.origin}/trouvo/e/?slug=${encodeURIComponent(slug)}`;
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
