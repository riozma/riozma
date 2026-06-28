const FEEDBACK_KEY_LABELS = {
  "info.section.basics": "Grundlagen (Abschnitt)",
  "info.section.registration": "Anmeldung (Abschnitt)",
  "info.section.registration-email": "E-Mail (Abschnitt)",
  "info.section.fields": "Anmeldefelder (Abschnitt)",
  "info.section.bring": "Mitbringsel (Abschnitt)",
  "info.section.timetable": "Zeitplan (Abschnitt)",
  "info.section.visibility": "Sichtbarkeit (Abschnitt)",
  "info.section.photos": "Event-Fotos (Abschnitt)",
  "info.basics.identity": "Name & URL",
  "info.basics.description": "Beschreibung",
  "info.basics.location": "Ort & Telefon",
  "info.basics.cover": "Titelbild",
  "info.basics.dates": "Datum",
  "info.basics.times": "Zeiten",
  "info.visibility": "Sichtbarkeit",
  "info.photos": "Fotos",
  "planning.section.todos": "Aufgaben (Abschnitt)",
  "planning.section.materials": "Material (Abschnitt)",
};

function feedbackKeyLabel(key) {
  if (FEEDBACK_KEY_LABELS[key]) return FEEDBACK_KEY_LABELS[key];
  if (key.startsWith("info.field.")) return `Anmeldefeld ${key.split(".")[2]}`;
  if (key.startsWith("info.bring.")) return `Mitbringsel ${key.split(".")[2]}`;
  if (key.startsWith("info.timetable.track.")) return `Zeitstrahl ${Number(key.split(".")[3]) + 1}`;
  if (key.startsWith("info.timetable.")) {
    const p = key.split(".");
    return `Zeitplan ${Number(p[2]) + 1}.${Number(p[3]) + 1}`;
  }
  if (key.startsWith("planning.todo.")) return `Aufgabe ${Number(key.split(".")[2]) + 1}`;
  if (key.startsWith("planning.material.")) return `Material ${Number(key.split(".")[2]) + 1}`;
  return key;
}

document.addEventListener("DOMContentLoaded", async () => {
  const eventId = new URLSearchParams(window.location.search).get("id");
  const client = getSupabase();
  if (!client || !eventId) {
    document.getElementById("feedback-loading").textContent = "Ungültige Anfrage.";
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.href = `/trouvo/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const { data: event, error } = await client.from("events").select("*").eq("id", eventId).single();
  const access = event ? await userCanManageEvent(client, eventId, session.user.id) : { canManage: false };
  if (error || !event || !access.canManage) {
    document.getElementById("feedback-loading").textContent = "Kein Zugriff.";
    return;
  }

  setTrouvoEventTitle(event.name);
  document.title = `Nachbesprechung – ${event.name}`;

  const { data: guestFb } = await client
    .from("event_guest_feedback")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  document.getElementById("feedback-loading").classList.add("d-none");
  document.getElementById("feedback-content").classList.remove("d-none");

  renderOrganizerFeedback(event.feedback_notes || {});
  renderGuestFeedback(guestFb || []);
});

function renderOrganizerFeedback(notes) {
  const el = document.getElementById("organizer-feedback-list");
  const entries = Object.entries(notes).filter(([, v]) => (v || "").trim());
  if (!entries.length) {
    el.innerHTML = `<p class="text-muted">Noch keine Organisator-Notizen. Aktiviere den Feedback-Modus auf Info oder Planung.</p>`;
    return;
  }
  el.innerHTML = entries.map(([key, text]) => `
    <div class="feedback-review-item">
      <p class="feedback-review-label">${escapeHtml(feedbackKeyLabel(key))}</p>
      <p class="feedback-review-text">${escapeHtml(text)}</p>
    </div>`).join("");
}

function renderGuestFeedback(rows) {
  const el = document.getElementById("guest-feedback-list");
  if (!rows.length) {
    el.innerHTML = `<p class="text-muted">Noch kein Gäste-Feedback.</p>`;
    return;
  }
  el.innerHTML = rows.map((row) => `
    <div class="feedback-review-item">
      <p class="feedback-review-label">${escapeHtml(row.guest_name || "Gast")}${row.guest_email ? ` · ${escapeHtml(row.guest_email)}` : ""}</p>
      <p class="feedback-review-text">${escapeHtml(row.message)}</p>
      <p class="text-muted small mb-0">${escapeHtml(new Date(row.created_at).toLocaleString("de-CH"))}</p>
    </div>`).join("");
}
