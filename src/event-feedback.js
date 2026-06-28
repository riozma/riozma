let feedbackEventId = null;
let feedbackNotes = {};
let feedbackSaveTimer = null;
let feedbackOnModeChange = null;
let feedbackModeEnabled = false;

const SECTION_DETAILS_KEYS = {
  "section-registration": "info.section.registration",
  "section-registration-email": "info.section.registration-email",
  "section-fields": "info.section.fields",
  "section-bring": "info.section.bring",
  "section-timetable": "info.section.timetable",
  "section-visibility": "info.section.visibility",
  "section-photos": "info.section.photos",
};

function feedbackStorageKey(suffix) {
  return `trouvo-feedback-${suffix}-${feedbackEventId}`;
}

function parseFeedbackNotes(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function loadFeedbackModeFromStorage() {
  try {
    return localStorage.getItem(feedbackStorageKey("mode")) === "1";
  } catch {
    return false;
  }
}

function loadFeedbackNotesFromStorage() {
  try {
    return parseFeedbackNotes(localStorage.getItem(feedbackStorageKey("notes")));
  } catch {
    return {};
  }
}

function saveFeedbackModeToStorage(enabled) {
  try {
    localStorage.setItem(feedbackStorageKey("mode"), enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function saveFeedbackNotesToStorage(notes) {
  try {
    localStorage.setItem(feedbackStorageKey("notes"), JSON.stringify(notes || {}));
  } catch {
    /* ignore */
  }
}

function isEventFeedbackMode() {
  return feedbackModeEnabled;
}

function getFeedbackNote(key) {
  return feedbackNotes[key] || "";
}

function initEventFeedback({ eventId, enabled, notes, onModeChange }) {
  feedbackEventId = eventId;
  feedbackOnModeChange = onModeChange || null;
  feedbackNotes = parseFeedbackNotes(notes);
  if (!Object.keys(feedbackNotes).length) {
    const stored = loadFeedbackNotesFromStorage();
    if (Object.keys(stored).length) feedbackNotes = stored;
  }

  mountSectionFeedbackSlots();

  const toggle = document.getElementById("feedback-mode-toggle");
  if (!toggle) return;

  feedbackModeEnabled = enabled != null ? !!enabled : loadFeedbackModeFromStorage();
  toggle.checked = feedbackModeEnabled;
  applyFeedbackModeClass(feedbackModeEnabled);

  if (toggle.dataset.bound !== "1") {
    toggle.dataset.bound = "1";
    toggle.addEventListener("change", async () => {
      await setFeedbackMode(toggle.checked);
      feedbackOnModeChange?.();
      refreshAllFeedbackFields();
    });
  }

  const clearBtn = document.getElementById("btn-clear-all-feedback");
  if (clearBtn && clearBtn.dataset.bound !== "1") {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", clearAllFeedbackNotes);
  }

  refreshAllFeedbackFields();
  wireFeedbackReviewLink(eventId);
  wireFeedbackLayoutListeners();
}

function wireFeedbackReviewLink(eventId) {
  const link = document.getElementById("btn-feedback-review");
  if (link && eventId) {
    link.href = `/trouvo/feedback.html?id=${encodeURIComponent(eventId)}`;
  }
}

function mountSectionFeedbackSlots() {
  Object.entries(SECTION_DETAILS_KEYS).forEach(([id, key]) => {
    const details = document.getElementById(id);
    if (!details || details.closest(".event-fb-details-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "event-fb-details-wrap";
    details.parentNode.insertBefore(wrap, details);
    wrap.appendChild(details);
    const slot = document.createElement("aside");
    slot.className = "event-fb-section-slot";
    slot.dataset.feedbackKey = key;
    wrap.appendChild(slot);
  });

  document.querySelectorAll(".planning-section").forEach((section) => {
    if (section.closest(".event-fb-section-wrap")) return;
    const title = section.querySelector(".planning-section-title")?.textContent?.trim() || "";
    const key = title === "Aufgaben"
      ? "planning.section.todos"
      : title === "Material"
        ? "planning.section.materials"
        : `planning.section.${title.toLowerCase().replace(/\s+/g, "-")}`;
    const wrap = document.createElement("div");
    wrap.className = "event-fb-section-wrap";
    section.parentNode.insertBefore(wrap, section);
    wrap.appendChild(section);
    const slot = document.createElement("aside");
    slot.className = "event-fb-section-slot";
    slot.dataset.feedbackKey = key;
    wrap.appendChild(slot);
  });
}

function applyFeedbackModeClass(on) {
  feedbackModeEnabled = !!on;
  document.body.classList.toggle("event-feedback-mode", feedbackModeEnabled);
}

async function setFeedbackMode(enabled) {
  applyFeedbackModeClass(enabled);
  saveFeedbackModeToStorage(enabled);
  const client = getSupabase();
  if (!client || !feedbackEventId) return;
  const { error } = await client.from("events").update({ feedback_mode_enabled: enabled }).eq("id", feedbackEventId);
  if (error) console.warn(formatDbError(error.message));
}

function feedbackFieldInnerHtml(key) {
  const val = escapeHtml(getFeedbackNote(key));
  const filled = val.trim() ? " is-filled" : "";
  return `
    <div class="event-feedback-field${filled}">
      <textarea class="event-feedback-input" rows="1" placeholder="Notiz…" aria-label="Feedback">${val}</textarea>
      <button type="button" class="event-feedback-clear-one" title="Notiz löschen" aria-label="Notiz löschen">×</button>
    </div>`;
}

function wrapFeedbackLine(mainHtml, key) {
  return `
    <div class="event-fb-line" data-feedback-key="${escapeHtml(key)}">
      <div class="event-fb-line-main">${mainHtml}</div>
      <aside class="event-fb-line-side"></aside>
    </div>`;
}

function refreshAllFeedbackFields() {
  document.querySelectorAll(".event-fb-line[data-feedback-key], .event-fb-section-slot[data-feedback-key]").forEach((el) => {
    const key = el.dataset.feedbackKey;
    if (!key) return;
    const isSection = el.classList.contains("event-fb-section-slot");
    if (!isEventFeedbackMode()) {
      if (el.classList.contains("event-fb-line-side")) el.innerHTML = "";
      else if (isSection) el.innerHTML = "";
      return;
    }
    const target = isSection ? el : el.querySelector(".event-fb-line-side");
    if (!target) return;
    target.innerHTML = feedbackFieldInnerHtml(key);
    bindFeedbackInputs(target);
  });
  refreshFeedbackRailLayout();
}

function refreshFeedbackRailLayout() {
  if (!isEventFeedbackMode()) return;
  requestAnimationFrame(() => {
    document.querySelectorAll(".event-fb-line[data-feedback-key]").forEach((line) => {
      const main = line.querySelector(".event-fb-line-main");
      const side = line.querySelector(".event-fb-line-side");
      if (!main || !side) return;
      line.style.minHeight = `${Math.max(main.offsetHeight, side.offsetHeight)}px`;
    });
  });
}

function wireFeedbackLayoutListeners() {
  if (document.body.dataset.fbLayoutBound === "1") return;
  document.body.dataset.fbLayoutBound = "1";
  window.addEventListener("resize", refreshFeedbackRailLayout);
  document.querySelectorAll(".edit-section-details").forEach((details) => {
    details.addEventListener("toggle", refreshFeedbackRailLayout);
  });
}

function autoResizeFeedbackInput(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const max = 128;
  textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
}

function updateFeedbackFieldState(textarea) {
  const field = textarea?.closest(".event-feedback-field");
  if (!field) return;
  field.classList.toggle("is-filled", !!textarea.value.trim());
  autoResizeFeedbackInput(textarea);
}

function bindFeedbackInputs(root) {
  if (!root) return;
  root.querySelectorAll(".event-feedback-field").forEach((field) => {
    const host = field.closest(".event-fb-line, .event-fb-section-slot");
    const key = host?.dataset.feedbackKey;
    const textarea = field.querySelector(".event-feedback-input");
    const clearBtn = field.querySelector(".event-feedback-clear-one");
    if (!textarea || !key) return;
    textarea.value = getFeedbackNote(key);
    updateFeedbackFieldState(textarea);
    autoResizeFeedbackInput(textarea);
    textarea.oninput = () => {
      updateFeedbackFieldState(textarea);
      scheduleFeedbackSave(key, textarea.value);
      refreshFeedbackRailLayout();
    };
    textarea.onfocus = () => field.classList.add("is-active");
    textarea.onblur = () => field.classList.remove("is-active");
    if (clearBtn) {
      clearBtn.onclick = () => clearFeedbackNote(key, textarea);
    }
  });
}

function scheduleFeedbackSave(key, value) {
  if (value) feedbackNotes[key] = value;
  else delete feedbackNotes[key];
  clearTimeout(feedbackSaveTimer);
  feedbackSaveTimer = setTimeout(() => persistFeedbackNotes(), 500);
}

async function persistFeedbackNotes() {
  saveFeedbackNotesToStorage(feedbackNotes);
  const client = getSupabase();
  if (!client || !feedbackEventId) return;
  const { error } = await client.from("events").update({ feedback_notes: feedbackNotes }).eq("id", feedbackEventId);
  if (error) console.warn(formatDbError(error.message));
}

async function clearFeedbackNote(key, textarea) {
  delete feedbackNotes[key];
  if (textarea) {
    textarea.value = "";
    updateFeedbackFieldState(textarea);
  }
  await persistFeedbackNotes();
}

async function clearAllFeedbackNotes() {
  if (!confirm("Alle Feedback-Texte wirklich leeren?")) return;
  feedbackNotes = {};
  document.querySelectorAll(".event-feedback-input").forEach((el) => {
    el.value = "";
    updateFeedbackFieldState(el);
  });
  await persistFeedbackNotes();
}

function normalizeItemKey(value) {
  return (value || "").trim().toLowerCase();
}

function planningTodoExists(todos, title) {
  const key = normalizeItemKey(title);
  if (!key) return false;
  return todos.some((t) => normalizeItemKey(t.title) === key);
}

function planningMaterialExists(materials, name) {
  const key = normalizeItemKey(name);
  if (!key) return false;
  return materials.some((m) => normalizeItemKey(m.name) === key);
}
