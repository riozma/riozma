let eventId = null;
let session = null;
let slugManual = false;
let eventCreatorId = null;
let isEventCreator = false;
let pendingCoverFile = null;
let removeCover = false;
let currentCoverPath = null;
let coverPreviewUrl = null;
let pendingPlanning = null;
let autoSaveTimer = null;
let saveInFlight = false;
let isPublishedState = false;
let skipAutoSave = false;

const timetableTracks = [];
const regFields = [];
const bringItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  const client = getSupabase();
  if (!client) return;

  await completeAuthFromUrl(client);

  const authSession = await waitForAuthSession(client);
  if (!authSession) {
    redirectToTrouvoLogin("/trouvo/?new=1");
    return;
  }
  session = authSession;

  const params = new URLSearchParams(window.location.search);
  eventId = params.get("id");

  bindUI();
  if (eventId) {
    await loadEvent();
  } else {
    window.location.replace("/trouvo/?new=1");
    return;
  }

  document.getElementById("ev-name").addEventListener("input", (e) => {
    if (!slugManual) document.getElementById("ev-slug").value = slugify(e.target.value);
    setTrouvoEventTitle(e.target.value.trim());
  });
  document.getElementById("ev-slug").addEventListener("input", (e) => {
    slugManual = !!e.target.value.trim();
  });
  document.getElementById("ev-open-end").addEventListener("change", (e) => {
    document.getElementById("ev-end").disabled = e.target.checked;
    scheduleAutoSave(e.target);
  });
  document.getElementById("ev-multi-day").addEventListener("change", () => {
    syncMultiDayUI();
    scheduleAutoSave(document.getElementById("ev-multi-day"));
  });
  document.getElementById("ev-date").addEventListener("change", () => {
    syncEndDateMin();
    renderTimetableTracks();
    scheduleAutoSave(document.getElementById("ev-date"));
  });
  document.getElementById("ev-end-date").addEventListener("change", () => {
    renderTimetableTracks();
    scheduleAutoSave(document.getElementById("ev-end-date"));
  });
  document.getElementById("ev-start").addEventListener("change", (e) => scheduleAutoSave(e.target));

  ["ev-name", "ev-date", "ev-start", "ev-end-date"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      document.getElementById(id)?.classList.remove("is-invalid");
    });
  });
});

function bindUI() {
  document.getElementById("btn-copy-link").addEventListener("click", copyGuestLink);
  document.getElementById("btn-delete-event").addEventListener("click", deleteEvent);
  document.getElementById("ev-live")?.addEventListener("change", (e) => {
    if (!eventId) {
      e.target.checked = false;
      updateLiveStatusUI(false, false);
      showAutoSaveFeedback(document.getElementById("ev-name"), "error", "Zuerst Name, Datum und Start ausfüllen.");
      return;
    }
    isPublishedState = e.target.checked;
    updateLiveStatusUI(isPublishedState, !!eventId);
    scheduleAutoSave(e.target, 0);
  });

  const editContent = document.getElementById("edit-content");
  editContent?.addEventListener("input", (e) => {
    if (skipAutoSave) return;
    if (e.target.matches("input, textarea, select")) scheduleAutoSave(e.target);
  });
  editContent?.addEventListener("change", (e) => {
    if (skipAutoSave) return;
    if (e.target.matches("input, textarea, select")) scheduleAutoSave(e.target);
  });
  document.getElementById("btn-add-co-org").addEventListener("click", addCoOrganizer);
  document.getElementById("btn-add-track").addEventListener("click", () => {
    collectFromDOM();
    document.getElementById("section-timetable").open = true;
    addTimetableTrack();
    scheduleAutoSave(document.getElementById("timetable-tracks"));
  });
  document.getElementById("btn-add-timetable").addEventListener("click", () => {
    addTimetableEntry();
    scheduleAutoSave(document.getElementById("timetable-tracks"));
  });
  document.getElementById("ev-cover-file")?.addEventListener("change", async (e) => {
    await onCoverFileSelected(e);
    scheduleAutoSave(e.target, 0);
  });
  document.getElementById("btn-remove-cover")?.addEventListener("click", () => {
    pendingCoverFile = null;
    removeCover = true;
    revokeCoverPreviewUrl();
    document.getElementById("ev-cover-file").value = "";
    updateCoverPreview(null);
    scheduleAutoSave(document.getElementById("ev-cover-file"), 0);
  });
  document.getElementById("btn-apply-copy")?.addEventListener("click", () => {
    const sourceId = document.getElementById("copy-from-select")?.value;
    if (!sourceId) {
      showAutoSaveFeedback(document.getElementById("copy-from-select"), "error", "Bitte zuerst eine Vorlage wählen.");
      return;
    }
    applyCopyFromEvent(sourceId);
  });
  document.getElementById("btn-add-field").addEventListener("click", () => {
    collectFromDOM();
    document.getElementById("section-fields").open = true;
    regFields.push({ label: "", field_type: "text", required: false, visible_to_others: false });
    renderFields();
    scheduleAutoSave(document.getElementById("fields-list"));
  });
  document.getElementById("btn-add-bring").addEventListener("click", () => {
    collectFromDOM();
    document.getElementById("section-bring").open = true;
    bringItems.push({ name: "", quantity_mode: "fixed", quantity_value: 1, visible_to_others: true });
    renderBring();
    scheduleAutoSave(document.getElementById("bring-list"));
  });
}

async function loadEvent() {
  const client = getSupabase();
  const data = await fetchEventFormData(client, eventId);
  if (!data) {
    document.getElementById("edit-loading").textContent = "Veranstaltung nicht gefunden.";
    return;
  }

  const access = await userCanManageEvent(client, eventId, session.user.id);
  if (!access.canManage) {
    document.getElementById("edit-loading").textContent = "Kein Zugriff auf diese Veranstaltung.";
    return;
  }

  eventCreatorId = data.event.organizer_id;
  isEventCreator = access.isCreator;
  updateCreatorUI();
  populateFormFromSource(data, { isCopy: false });
  setTrouvoEventTitle(data.event.name);
  isPublishedState = !!data.event.is_published;
  updateLiveStatusUI(isPublishedState, true);

  document.getElementById("edit-loading").classList.add("d-none");
  document.getElementById("edit-content").classList.remove("d-none");
  if (typeof initEventFeedback === "function") {
    initEventFeedback({
      eventId,
      enabled: data.event.feedback_mode_enabled,
      notes: data.event.feedback_notes,
      onModeChange: () => renderAllLists(),
    });
  }
  updatePlanningLink();
  renderAllLists();
  refreshAllFeedbackFields();
  applySectionOpenState();
  updateGuestLink(data.event.slug, data.event.is_published);
  document.getElementById("copy-from-event-box")?.classList.remove("d-none");
  await loadCopyFromOptions();
  if (isEventCreator) await loadCoOrganizers();
  applySectionOpenState();
}

async function fetchEventFormData(client, sourceEventId) {
  const { data: event, error } = await client.from("events").select("*").eq("id", sourceEventId).single();
  if (error || !event) return null;

  const [tracks, tt, fields, bring] = await Promise.all([
    client.from("event_timetable_tracks").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_timetable_items").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_registration_fields").select("*").eq("event_id", sourceEventId).order("sort_order"),
    client.from("event_bring_items").select("*").eq("event_id", sourceEventId).order("sort_order"),
  ]);

  return {
    event,
    tracks: tracks.data || [],
    timetableItems: tt.data || [],
    fields: fields.data || [],
    bring: bring.data || [],
  };
}

function populateFormFromSource(data, { isCopy }) {
  const { event } = data;

  document.getElementById("ev-name").value = isCopy ? `${event.name} (Kopie)` : event.name;
  document.getElementById("ev-slug").value = isCopy ? "" : event.slug;
  slugManual = !isCopy && !!event.slug;
  document.getElementById("ev-description").value = event.description || "";
  document.getElementById("ev-location").value = event.location || "";
  document.getElementById("ev-phone").value = event.organizer_phone || "";

  if (isCopy) {
    document.getElementById("ev-date").value = "";
    document.getElementById("ev-end-date").value = "";
    document.getElementById("ev-multi-day").checked = false;
    syncMultiDayUI();
    pendingCoverFile = null;
    removeCover = false;
    currentCoverPath = null;
    updateCoverPreview(null);
    document.getElementById("ev-cover-file").value = "";
  } else {
    document.getElementById("ev-date").value = event.event_date;
    const multiDay = isMultiDayEvent(event);
    document.getElementById("ev-multi-day").checked = multiDay;
    document.getElementById("ev-end-date").value = multiDay ? event.end_date : "";
    syncMultiDayUI();
    currentCoverPath = event.cover_image_path || null;
    removeCover = false;
    pendingCoverFile = null;
    updateCoverPreview(currentCoverPath ? storagePublicUrl("event-covers", currentCoverPath) : null);
  }

  document.getElementById("ev-start").value = (event.start_time || "19:00").slice(0, 5);
  document.getElementById("ev-end").value = (event.end_time || "").slice(0, 5);
  document.getElementById("ev-open-end").checked = event.open_end;
  document.getElementById("ev-end").disabled = event.open_end;
  document.getElementById("ev-attendee-visibility").value = getAttendeeVisibility(event);
  document.getElementById("ev-photos-link").value = event.photos_upload_url || event.photos_gallery_url || "";

  timetableTracks.length = 0;
  const trackRows = data.tracks;
  const itemRows = data.timetableItems;
  if (trackRows.length) {
    trackRows.forEach((track) => {
      timetableTracks.push({
        name: track.name || "",
        items: itemRows
          .filter((r) => r.track_id === track.id)
          .map((r) => ({
            item_date: isCopy ? "" : (r.item_date || event.event_date),
            start_time: (r.start_time || "").slice(0, 5),
            title: r.title || "",
            description: r.description || "",
          })),
      });
    });
  } else if (itemRows.length) {
    timetableTracks.push({
      name: "",
      items: itemRows.map((r) => ({
        item_date: isCopy ? "" : (r.item_date || event.event_date),
        start_time: (r.start_time || "").slice(0, 5),
        title: r.title || "",
        description: r.description || "",
      })),
    });
  }
  sortAllTimetableItems();

  regFields.length = 0;
  data.fields.forEach((r) => regFields.push({
    label: r.label,
    field_type: r.field_type,
    required: r.required,
    visible_to_others: r.visible_to_others,
  }));

  bringItems.length = 0;
  data.bring.forEach((r) => bringItems.push({
    name: r.name,
    quantity_mode: r.quantity_mode,
    quantity_value: Number(r.quantity_value),
    visible_to_others: r.visible_to_others,
  }));

  if (isCopy && !slugManual) {
    document.getElementById("ev-slug").value = slugify(document.getElementById("ev-name").value);
  }
}

function templateSelectOptions() {
  return Object.entries(EVENT_TEMPLATES)
    .map(([key, tpl]) => `<option value="template:${key}">${escapeHtml(tpl.label)}</option>`)
    .join("");
}

async function loadCopyFromOptions() {
  const client = getSupabase();
  const select = document.getElementById("copy-from-select");
  if (!select) return;

  const templateGroup = `<optgroup label="Typ-Vorlagen">${templateSelectOptions()}</optgroup>`;
  if (!client || !session?.user?.id) {
    select.innerHTML = `<option value="">Vorlage wählen…</option>${templateGroup}`;
    return;
  }

  const userId = session.user.id;
  const [{ data: owned }, { data: coRows }] = await Promise.all([
    client.from("events").select("id, name, event_date, end_date, start_time, end_time, open_end").eq("organizer_id", userId).order("event_date", { ascending: false }),
    client.from("event_co_organizers").select("event_id").eq("user_id", userId),
  ]);

  const coIds = (coRows || []).map((r) => r.event_id).filter((id) => !(owned || []).some((e) => e.id === id));
  let coEvents = [];
  if (coIds.length) {
    const { data } = await client.from("events").select("id, name, event_date, end_date, start_time, end_time, open_end").in("id", coIds).order("event_date", { ascending: false });
    coEvents = data || [];
  }

  const events = [...(owned || []), ...coEvents];
  const groups = [templateGroup];

  if (events.length) {
    const now = new Date();
    const past = [];
    const upcoming = [];
    events.forEach((event) => {
      const { end } = getEventDateTimes(event);
      if (end < now) past.push(event);
      else upcoming.push(event);
    });
    past.sort((a, b) => eventSortTimestamp(b) - eventSortTimestamp(a));
    upcoming.sort((a, b) => eventSortTimestamp(a) - eventSortTimestamp(b));

    if (upcoming.length) {
      groups.push(`<optgroup label="Eigene Events (kommend)">${upcoming.map(eventCopyOption).join("")}</optgroup>`);
    }
    if (past.length) {
      groups.push(`<optgroup label="Eigene Events (vergangen)">${past.map(eventCopyOption).join("")}</optgroup>`);
    }
  }

  select.innerHTML = `<option value="">Vorlage wählen…</option>${groups.join("")}`;
}

function eventCopyOption(event) {
  const dateStr = formatEventDateRange(event, true);
  return `<option value="${event.id}">${escapeHtml(event.name)} (${escapeHtml(dateStr)})</option>`;
}

async function applyCopyFromEvent(sourceId) {
  if (sourceId.startsWith("template:")) {
    await applyEventTemplate(sourceId.slice("template:".length));
    return;
  }

  const client = getSupabase();
  const access = await userCanManageEvent(client, sourceId, session.user.id);
  if (!access.canManage) {
    showAutoSaveFeedback(document.getElementById("ev-name"), "error", "Kein Zugriff auf dieses Event.");
    return;
  }

  const data = await fetchEventFormData(client, sourceId);
  if (!data) {
    showAutoSaveFeedback(document.getElementById("ev-name"), "error", "Event nicht gefunden.");
    return;
  }

  const mergeMode = await resolveTemplateMergeMode(data.event.name, formHasContent());
  if (mergeMode === "cancel") return;

  skipAutoSave = true;
  if (mergeMode === "overwrite") {
    populateFormFromSource(data, { isCopy: true });
  } else {
    mergeEventCopySkipEmpty(data);
  }
  setTrouvoEventTitle(document.getElementById("ev-name").value.trim());
  skipAutoSave = false;

  renderAllLists();
  applySectionOpenState();
  document.getElementById("copy-from-select").value = sourceId;
  scheduleAutoSave(document.getElementById("ev-name"), 0);
}

function populateFormFromTemplate(template) {
  const ev = template.event;
  document.getElementById("ev-name").value = ev.name || "";
  document.getElementById("ev-slug").value = slugify(ev.name || "");
  slugManual = false;
  document.getElementById("ev-description").value = ev.description || "";
  document.getElementById("ev-location").value = "";
  document.getElementById("ev-phone").value = "";
  document.getElementById("ev-date").value = "";
  document.getElementById("ev-end-date").value = "";
  document.getElementById("ev-multi-day").checked = false;
  syncMultiDayUI();
  pendingCoverFile = null;
  removeCover = false;
  currentCoverPath = null;
  updateCoverPreview(null);
  document.getElementById("ev-cover-file").value = "";

  document.getElementById("ev-start").value = (ev.start_time || "19:00").slice(0, 5);
  document.getElementById("ev-end").value = (ev.end_time || "").slice(0, 5);
  document.getElementById("ev-open-end").checked = !!ev.open_end;
  document.getElementById("ev-end").disabled = !!ev.open_end;
  document.getElementById("ev-attendee-visibility").value = "count";
  document.getElementById("ev-photos-link").value = "";

  timetableTracks.length = 0;
  (ev.timetableTracks || []).forEach((track) => {
    timetableTracks.push({
      name: track.name || "",
      items: (track.items || []).map((item) => ({
        item_date: "",
        start_time: (item.start_time || "19:00").slice(0, 5),
        title: item.title || "",
        description: item.description || "",
      })),
    });
  });
  sortAllTimetableItems();

  regFields.length = 0;
  (ev.fields || []).forEach((f) => regFields.push({ ...f }));

  bringItems.length = 0;
  (ev.bringItems || []).forEach((b) => bringItems.push({ ...b }));
}

async function applyEventTemplate(templateKey, { skipConfirm = false, preserveName = null } = {}) {
  const template = EVENT_TEMPLATES[templateKey];
  if (!template) {
    showAutoSaveFeedback(document.getElementById("ev-name"), "error", "Vorlage nicht gefunden.");
    return;
  }

  if (!skipConfirm && formHasContent()) {
    const mergeMode = await resolveTemplateMergeMode(template.label, true);
    if (mergeMode === "cancel") return;
    skipAutoSave = true;
    if (mergeMode === "overwrite") {
      populateFormFromTemplate(template);
    } else {
      mergeTemplateSkipEmpty(template);
    }
  } else {
    skipAutoSave = true;
    populateFormFromTemplate(template);
  }

  if (preserveName) {
    document.getElementById("ev-name").value = preserveName;
    document.getElementById("ev-slug").value = slugify(preserveName);
    slugManual = false;
  }

  const planningPayload = template.planning ? {
    todos: template.planning.todos.map((t) => ({ ...t, done: false })),
    materials: template.planning.materials.map((m) => ({ ...m, acquired: false })),
  } : null;

  if (eventId && planningPayload) {
    await appendPlanningForEvent(getSupabase(), eventId, planningPayload);
    pendingPlanning = null;
  } else {
    pendingPlanning = planningPayload;
  }

  skipAutoSave = false;
  renderAllLists();
  applySectionOpenState();
  document.getElementById("copy-from-select").value = `template:${templateKey}`;
  scheduleAutoSave(document.getElementById("ev-name"), 0);
}

function formHasContent() {
  collectFromDOM();
  if (document.getElementById("ev-description").value.trim()) return true;
  if (document.getElementById("ev-location").value.trim()) return true;
  if (document.getElementById("ev-phone").value.trim()) return true;
  if (document.getElementById("ev-date").value) return true;
  if (document.getElementById("ev-photos-link").value.trim()) return true;
  if (timetableTracks.some((t) => t.name.trim() || t.items.some((i) => i.title || i.description))) return true;
  if (regFields.some((f) => f.label.trim())) return true;
  if (bringItems.some((b) => b.name.trim())) return true;
  return false;
}

async function resolveTemplateMergeMode(label, hasContent) {
  if (!hasContent) return "overwrite";
  return confirmTemplateMergeDialog(label);
}

function mergeTemplateSkipEmpty(template) {
  const ev = template.event;
  if (!document.getElementById("ev-description").value.trim()) {
    document.getElementById("ev-description").value = ev.description || "";
  }
  if (!document.getElementById("ev-start").value) {
    document.getElementById("ev-start").value = (ev.start_time || "19:00").slice(0, 5);
  }
  if (!document.getElementById("ev-end").value && ev.end_time) {
    document.getElementById("ev-end").value = (ev.end_time || "").slice(0, 5);
  }
  if (!document.getElementById("ev-open-end").checked && ev.open_end) {
    document.getElementById("ev-open-end").checked = true;
    document.getElementById("ev-end").disabled = true;
  }
  if (!timetableTracks.length && ev.timetableTracks?.length) {
    ev.timetableTracks.forEach((track) => {
      timetableTracks.push({
        name: track.name || "",
        items: (track.items || []).map((item) => ({
          item_date: "",
          start_time: (item.start_time || "19:00").slice(0, 5),
          title: item.title || "",
          description: item.description || "",
        })),
      });
    });
    sortAllTimetableItems();
  }
  if (!regFields.length && ev.fields?.length) {
    ev.fields.forEach((f) => regFields.push({ ...f }));
  }
  if (!bringItems.length && ev.bringItems?.length) {
    ev.bringItems.forEach((b) => bringItems.push({ ...b }));
  }
}

function mergeEventCopySkipEmpty(data) {
  const { event } = data;
  if (!document.getElementById("ev-name").value.trim()) {
    document.getElementById("ev-name").value = `${event.name} (Kopie)`;
    document.getElementById("ev-slug").value = slugify(document.getElementById("ev-name").value);
  }
  if (!document.getElementById("ev-description").value.trim()) {
    document.getElementById("ev-description").value = event.description || "";
  }
  if (!document.getElementById("ev-location").value.trim()) {
    document.getElementById("ev-location").value = event.location || "";
  }
  if (!document.getElementById("ev-phone").value.trim()) {
    document.getElementById("ev-phone").value = event.organizer_phone || "";
  }
  if (!document.getElementById("ev-start").value) {
    document.getElementById("ev-start").value = (event.start_time || "19:00").slice(0, 5);
  }
  if (!document.getElementById("ev-end").value && event.end_time) {
    document.getElementById("ev-end").value = (event.end_time || "").slice(0, 5);
  }
  if (!document.getElementById("ev-open-end").checked && event.open_end) {
    document.getElementById("ev-open-end").checked = true;
    document.getElementById("ev-end").disabled = true;
  }
  if (document.getElementById("ev-attendee-visibility").value === "count" && getAttendeeVisibility(event) !== "count") {
    document.getElementById("ev-attendee-visibility").value = getAttendeeVisibility(event);
  }
  if (!document.getElementById("ev-photos-link").value.trim()) {
    document.getElementById("ev-photos-link").value = event.photos_upload_url || event.photos_gallery_url || "";
  }
  if (!timetableTracks.length) {
    const trackRows = data.tracks;
    const itemRows = data.timetableItems;
    if (trackRows.length) {
      trackRows.forEach((track) => {
        timetableTracks.push({
          name: track.name || "",
          items: itemRows
            .filter((r) => r.track_id === track.id)
            .map((r) => ({
              item_date: "",
              start_time: (r.start_time || "").slice(0, 5),
              title: r.title || "",
              description: r.description || "",
            })),
        });
      });
    } else if (itemRows.length) {
      timetableTracks.push({
        name: "",
        items: itemRows.map((r) => ({
          item_date: "",
          start_time: (r.start_time || "").slice(0, 5),
          title: r.title || "",
          description: r.description || "",
        })),
      });
    }
    sortAllTimetableItems();
  }
  if (!regFields.length) {
    data.fields.forEach((r) => regFields.push({
      label: r.label,
      field_type: r.field_type,
      required: r.required,
      visible_to_others: r.visible_to_others,
    }));
  }
  if (!bringItems.length) {
    data.bring.forEach((r) => bringItems.push({
      name: r.name,
      quantity_mode: r.quantity_mode,
      quantity_value: Number(r.quantity_value),
      visible_to_others: r.visible_to_others,
    }));
  }
}

async function savePlanningForEvent(client, targetEventId, planning) {
  if (!planning) return;
  await client.from("event_planning_todos").delete().eq("event_id", targetEventId);
  await client.from("event_planning_materials").delete().eq("event_id", targetEventId);
  await insertPlanningRows(client, targetEventId, planning);
}

async function appendPlanningForEvent(client, targetEventId, planning) {
  if (!planning) return;
  const [todoRes, matRes, existingTodos, existingMats] = await Promise.all([
    client.from("event_planning_todos").select("sort_order").eq("event_id", targetEventId).order("sort_order", { ascending: false }).limit(1),
    client.from("event_planning_materials").select("sort_order").eq("event_id", targetEventId).order("sort_order", { ascending: false }).limit(1),
    client.from("event_planning_todos").select("title").eq("event_id", targetEventId),
    client.from("event_planning_materials").select("name").eq("event_id", targetEventId),
  ]);
  const todoStart = ((todoRes.data || [])[0]?.sort_order ?? -1) + 1;
  const matStart = ((matRes.data || [])[0]?.sort_order ?? -1) + 1;
  const existingTodoList = (existingTodos.data || []).map((r) => ({ title: r.title || "" }));
  const existingMatList = (existingMats.data || []).map((r) => ({ name: r.name || "" }));
  const filtered = {
    todos: (planning.todos || []).filter((t) => !planningTodoExists(existingTodoList, t.title)),
    materials: (planning.materials || []).filter((m) => !planningMaterialExists(existingMatList, m.name)),
  };
  await insertPlanningRows(client, targetEventId, filtered, todoStart, matStart);
}

async function insertPlanningRows(client, targetEventId, planning, todoStart = 0, matStart = 0) {
  const todoRows = (planning.todos || [])
    .filter((t) => t.title || t.assignee)
    .map((t, i) => ({
      event_id: targetEventId,
      title: t.title || "",
      assignee: t.assignee || "",
      done: !!t.done,
      sort_order: todoStart + i,
    }));
  const materialRows = (planning.materials || [])
    .filter((m) => m.name || m.quantity || m.assignee)
    .map((m, i) => ({
      event_id: targetEventId,
      name: m.name || "",
      quantity: m.quantity || "",
      assignee: m.assignee || "",
      acquired: !!m.acquired,
      sort_order: matStart + i,
    }));

  if (todoRows.length) {
    const { error } = await client.from("event_planning_todos").insert(todoRows);
    if (error) throw new Error(formatDbError(error.message));
  }
  if (materialRows.length) {
    const { error } = await client.from("event_planning_materials").insert(materialRows);
    if (error) throw new Error(formatDbError(error.message));
  }
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
  const msg = document.getElementById("edit-save-status");
  const email = document.getElementById("co-org-email").value.trim();
  const btn = document.getElementById("btn-add-co-org");

  if (!eventId) {
    showAutoSaveFeedback(document.getElementById("co-org-email"), "error", "Zuerst Name, Datum und Start ausfüllen.");
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
  const msg = document.getElementById("edit-save-status");

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
  const msg = document.getElementById("edit-save-status");
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
  const startTime = defaultStartTime();
  const dates = getFormEventDates();
  const defaultDate = dates[0] || document.getElementById("ev-date")?.value || "";
  if (!track.items.length) {
    return { item_date: defaultDate, start_time: startTime, title: "", description: "" };
  }
  const last = track.items[track.items.length - 1];
  return {
    item_date: last.item_date || defaultDate,
    start_time: addMinutesToTime(last.start_time || startTime, 30),
    title: "",
    description: "",
  };
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

function formatTimeValue(time) {
  if (!time) return defaultStartTime();
  return String(time).slice(0, 5);
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

function defaultStartTime() {
  return document.getElementById("ev-start")?.value || "19:00";
}

function ensureDefaultTrack() {
  if (!timetableTracks.length) {
    timetableTracks.push({ name: "", items: [] });
  }
  return timetableTracks.length - 1;
}

function addTimetableEntry() {
  collectFromDOM();
  document.getElementById("section-timetable").open = true;
  addTimetableItem(ensureDefaultTrack());
}

function addTimetableTrack() {
  timetableTracks.push({ name: "", items: [] });
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
  setSectionOpen("section-visibility", document.getElementById("ev-attendee-visibility")?.value === "full");
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

function revokeCoverPreviewUrl() {
  if (coverPreviewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(coverPreviewUrl);
  }
  coverPreviewUrl = null;
}

function updateCoverPreview(url) {
  const wrap = document.getElementById("ev-cover-preview");
  const removeBtn = document.getElementById("btn-remove-cover");
  if (!wrap) return;
  revokeCoverPreviewUrl();
  if (url) {
    coverPreviewUrl = url;
    wrap.innerHTML = `<img src="${escapeHtml(url)}" alt="Titelbild-Vorschau">`;
    wrap.classList.remove("d-none");
    removeBtn?.classList.remove("d-none");
  } else {
    wrap.innerHTML = "";
    wrap.classList.add("d-none");
    removeBtn?.classList.add("d-none");
  }
}

function onCoverFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showAutoSaveFeedback(e.target, "error", "Bitte ein Bild wählen.");
    e.target.value = "";
    return;
  }
  pendingCoverFile = file;
  removeCover = false;
  updateCoverPreview(URL.createObjectURL(file));
}

async function saveEventCover(client, savedId, eventPayload) {
  if (removeCover && currentCoverPath) {
    await client.storage.from("event-covers").remove([currentCoverPath]);
    await client.from("events").update({ cover_image_path: null, cover_image_expires_at: null }).eq("id", savedId);
    currentCoverPath = null;
    return;
  }
  if (!pendingCoverFile) return;

  const compressed = await prepareEventCover(pendingCoverFile);
  const path = `${savedId}/cover.jpg`;
  if (currentCoverPath && currentCoverPath !== path) {
    await client.storage.from("event-covers").remove([currentCoverPath]);
  }
  const { error: uploadError } = await client.storage.from("event-covers").upload(path, compressed, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (uploadError) throw storageUploadError(uploadError, uploadError.message);

  const expiresAt = computeEventCoverExpiry({
    event_date: eventPayload.event_date,
    end_date: eventPayload.end_date,
    start_time: eventPayload.start_time,
    end_time: eventPayload.end_time,
    open_end: eventPayload.open_end,
  });
  const { error } = await client.from("events").update({
    cover_image_path: path,
    cover_image_expires_at: expiresAt,
  }).eq("id", savedId);
  if (error) throw new Error(formatDbError(error.message));
  currentCoverPath = path;
  pendingCoverFile = null;
  removeCover = false;
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
      <div class="event-fb-line" data-feedback-key="info.timetable.track.${trackIndex}">
        <div class="event-fb-line-main">
          <div class="timetable-track-head">
            <input type="text" class="form-control form-control-sm track-name" placeholder="Name des Zeitstrahls (optional)" value="${escapeHtml(track.name || "")}">
            <div class="timetable-track-actions">
              <button type="button" class="btn btn-sm btn-outline-danger btn-remove-track" data-track="${trackIndex}" title="Zeitstrahl entfernen">×</button>
            </div>
          </div>
        </div>
        <aside class="event-fb-line-side"></aside>
      </div>
      ${track.items.length ? track.items.map((item, itemIndex) => {
        const rowHtml = `
        <div class="builder-row timeline-row ${multiDay ? "timeline-row-multiday" : ""}" data-track="${trackIndex}" data-i="${itemIndex}">
          ${multiDay ? `<select class="form-select form-select-sm tt-date">${buildDateSelectOptions(item.item_date || dates[0])}</select>` : ""}
          <input type="time" class="form-control form-control-sm tt-time" value="${formatTimeValue(item.start_time)}">
          <input type="text" class="form-control form-control-sm tt-title" placeholder="Titel" value="${escapeHtml(item.title || "")}">
          <input type="text" class="form-control form-control-sm tt-desc" placeholder="Beschreibung (optional)" value="${escapeHtml(item.description || "")}">
          <button type="button" class="btn btn-sm btn-outline-danger btn-remove-tt">×</button>
        </div>`;
        return typeof wrapFeedbackLine === "function"
          ? wrapFeedbackLine(rowHtml, `info.timetable.${trackIndex}.${itemIndex}`)
          : rowHtml;
      }).join("") : `<p class="text-muted small timetable-track-empty">Noch keine Einträge in diesem Zeitstrahl.</p>`}
      <div class="builder-add-row builder-add-row-inset">
        <button type="button" class="btn btn-sm btn-outline-secondary btn-add-tt-item" data-track="${trackIndex}">+ Eintrag</button>
      </div>
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
      scheduleAutoSave(el);
    });
  });

  el.querySelectorAll(".btn-remove-tt").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      const row = btn.closest(".timeline-row");
      timetableTracks[Number(row.dataset.track)].items.splice(Number(row.dataset.i), 1);
      renderTimetableTracks();
      scheduleAutoSave(el);
    });
  });
  if (typeof refreshAllFeedbackFields === "function") refreshAllFeedbackFields();
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
  el.innerHTML = regFields.map((f, i) => {
    const rowHtml = `
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
    </div>`;
    return typeof wrapFeedbackLine === "function" ? wrapFeedbackLine(rowHtml, `info.field.${i}`) : rowHtml;
  }).join("");

  el.querySelectorAll(".btn-remove-field").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      regFields.splice(Number(btn.closest(".field-row").dataset.i), 1);
      renderFields();
      scheduleAutoSave(el);
    });
  });
  if (typeof refreshAllFeedbackFields === "function") refreshAllFeedbackFields();
}

function renderBring() {
  const el = document.getElementById("bring-list");
  if (!bringItems.length) {
    el.innerHTML = `<p class="text-muted small">Keine Mitbringsel-Items.</p>`;
    return;
  }
  el.innerHTML = bringItems.map((b, i) => {
    const rowHtml = `
    <div class="builder-row bring-row" data-i="${i}">
      <input type="text" class="form-control form-control-sm b-name" placeholder="z.B. Salat" value="${escapeHtml(b.name)}">
      <select class="form-select form-select-sm b-mode">
        <option value="fixed" ${b.quantity_mode === "fixed" ? "selected" : ""}>Fixe Menge</option>
        <option value="per_guest" ${b.quantity_mode === "per_guest" ? "selected" : ""}>Pro Anmeldung</option>
      </select>
      <input type="number" class="form-control form-control-sm b-qty" min="0.1" step="0.1" value="${b.quantity_value}">
      <label class="form-check-label small"><input type="checkbox" class="form-check-input b-vis" ${b.visible_to_others ? "checked" : ""}> Für Gäste sichtbar</label>
      <button type="button" class="btn btn-sm btn-outline-danger btn-remove-bring">×</button>
    </div>`;
    return typeof wrapFeedbackLine === "function" ? wrapFeedbackLine(rowHtml, `info.bring.${i}`) : rowHtml;
  }).join("");

  el.querySelectorAll(".btn-remove-bring").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      bringItems.splice(Number(btn.closest(".bring-row").dataset.i), 1);
      renderBring();
      scheduleAutoSave(el);
    });
  });
  if (typeof refreshAllFeedbackFields === "function") refreshAllFeedbackFields();
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
      item.start_time = formatTimeValue(row.querySelector(".tt-time")?.value);
      item.title = row.querySelector(".tt-title")?.value.trim() || "";
      item.description = row.querySelector(".tt-desc")?.value.trim() || "";
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

function scheduleAutoSave(sourceEl, delayMs = 700) {
  if (skipAutoSave) return;
  clearTimeout(autoSaveTimer);
  showAutoSaveFeedback(sourceEl || document.getElementById("ev-name"), "pending");
  autoSaveTimer = setTimeout(() => autoSaveEvent(sourceEl), delayMs);
}

async function autoSaveEvent(sourceEl) {
  if (skipAutoSave || saveInFlight) return;
  const validation = validateEventFormQuiet();
  if (!validation.valid) {
    if (eventId) {
      showAutoSaveFeedback(sourceEl || validation.fieldEl, "error", validation.message);
    } else {
      showAutoSaveFeedback(sourceEl, "idle");
    }
    return;
  }

  saveInFlight = true;
  try {
    const result = await persistEvent();
    isPublishedState = result.isPublished;
    updateLiveStatusUI(isPublishedState, !!eventId);
    setTrouvoEventTitle(result.name);
    updateGuestLink(result.slug, result.isPublished);
    updatePlanningLink();
    showAutoSaveFeedback(sourceEl || document.getElementById("ev-name"), "ok");
  } catch (err) {
    showAutoSaveFeedback(sourceEl || document.getElementById("ev-name"), "error", err.message || "Speichern fehlgeschlagen");
  } finally {
    saveInFlight = false;
  }
}

function validateEventFormQuiet() {
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
      return { valid: false, message: `${label} ist Pflicht.`, fieldEl: el };
    }
  }

  if (isFormMultiDay()) {
    const endEl = document.getElementById("ev-end-date");
    const startDate = document.getElementById("ev-date").value;
    if (!endEl?.value) {
      endEl?.classList.add("is-invalid");
      return { valid: false, message: "Enddatum ist Pflicht bei mehrtägigen Events.", fieldEl: endEl };
    }
    if (endEl.value < startDate) {
      endEl.classList.add("is-invalid");
      return { valid: false, message: "Enddatum darf nicht vor dem Startdatum liegen.", fieldEl: endEl };
    }
  }

  return { valid: true };
}

async function persistEvent() {
  collectFromDOM();
  const client = getSupabase();

  const name = document.getElementById("ev-name").value.trim();
  const slug = document.getElementById("ev-slug").value.trim() || slugify(name);
  const startTime = document.getElementById("ev-start").value;
  const publish = isPublishedState;

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
    is_published: publish,
  };

  let savedId = eventId;
  if (eventId) {
    const { error } = await client.from("events").update(payload).eq("id", eventId);
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
    setTrouvoEventTitle(name);
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

  await saveEventCover(client, savedId, payload);

  if (pendingPlanning) {
    await savePlanningForEvent(client, savedId, pendingPlanning);
    pendingPlanning = null;
  }

  const { data: ev } = await client.from("events").select("slug, is_published").eq("id", savedId).single();
  if (isEventCreator) await loadCoOrganizers();
  return { slug: ev.slug, isPublished: ev.is_published, name };
}

function updateGuestLink(slug, published) {
  const box = document.getElementById("guest-link-box");
  const url = siteUrl(`/trouvo/e/?slug=${encodeURIComponent(slug)}`);
  document.getElementById("guest-link-url").textContent = url;
  box.classList.toggle("d-none", !published);
}

function updatePlanningLink() {
  const link = document.getElementById("edit-link-planning");
  if (!link) return;
  if (eventId) {
    link.href = `/trouvo/planning.html?id=${encodeURIComponent(eventId)}`;
    link.classList.remove("d-none");
  } else {
    link.classList.add("d-none");
  }
}

function copyGuestLink() {
  const url = document.getElementById("guest-link-url").textContent;
  const btn = document.getElementById("btn-copy-link");
  navigator.clipboard.writeText(url).then(() => {
    const snapshot = { text: btn.textContent, disabled: btn.disabled, className: btn.className };
    flashButtonSuccess(btn, snapshot, "✓ Kopiert", 1500);
  });
}
