let eventData = null;
let fields = [];
let bringItems = [];
let isOrganizer = false;

document.addEventListener("DOMContentLoaded", async () => {
  const slug = new URLSearchParams(window.location.search).get("slug");
  const app = document.getElementById("guest-app");
  const loading = document.getElementById("guest-loading");
  const content = document.getElementById("guest-content");

  if (!slug) {
    loading.textContent = "Keine Veranstaltung angegeben.";
    return;
  }

  const client = getSupabase();
  if (!client) {
    loading.textContent = "Supabase nicht konfiguriert.";
    return;
  }

  const { data: { session } } = await client.auth.getSession();

  const { data: event, error } = await client.from("events").select("*").eq("slug", slug).single();
  if (error || !event) {
    loading.textContent = "Veranstaltung nicht gefunden.";
    return;
  }

  isOrganizer = session && await userIsEventOrganizer(client, event, session.user.id);
  if (!event.is_published && !isOrganizer) {
    loading.textContent = "Diese Veranstaltung ist noch nicht veröffentlicht.";
    return;
  }

  eventData = event;
  document.title = `${event.name} – Trouvo`;

  const [tracks, tt, fld, bring, regs] = await Promise.all([
    client.from("event_timetable_tracks").select("*").eq("event_id", event.id).order("sort_order"),
    client.from("event_timetable_items").select("*").eq("event_id", event.id).order("sort_order"),
    client.from("event_registration_fields").select("*").eq("event_id", event.id).order("sort_order"),
    client.from("event_bring_items").select("*").eq("event_id", event.id).order("sort_order"),
    client.from("event_registrations").select("*").eq("event_id", event.id).order("created_at"),
  ]);

  fields = fld.data || [];
  bringItems = bring.data || [];
  const registrations = regs.data || [];
  const regIds = registrations.map((r) => r.id);

  let allClaims = [];
  let allAnswers = [];
  if (regIds.length) {
    const [claimsRes, answersRes] = await Promise.all([
      client.from("event_bring_claims").select("*").in("registration_id", regIds),
      client.from("event_registration_answers").select("*").in("registration_id", regIds),
    ]);
    allClaims = claimsRes.data || [];
    allAnswers = answersRes.data || [];
  }

  loading.classList.add("d-none");
  content.classList.remove("d-none");
  content.innerHTML = buildPage(event, tracks.data || [], tt.data || [], registrations, allClaims, allAnswers);

  document.getElementById("guest-register-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitRegistration(client, registrations.length, e.submitter);
  });

  document.getElementById("btn-download-ics")?.addEventListener("click", () => {
    downloadEventIcs(eventData);
  });
});

function buildPage(event, tracks, timetable, registrations, claims, answers) {
  const dateStr = formatEventDateRange(event);
  const regCount = registrations.length;
  const visibility = getAttendeeVisibility(event);
  const locationHtml = event.location ? renderLocationBlock(event.location) : "";

  return `
    ${isOrganizer ? `<div class="organizer-banner"><span>Du bist Veranstalter</span><a href="/trouvo/manage.html?id=${event.id}" class="btn btn-sm btn-light">Anmeldungen</a><a href="/trouvo/edit.html?id=${event.id}" class="btn btn-sm btn-light">Bearbeiten</a></div>` : ""}
    ${!event.is_published ? `<div class="draft-banner">Entwurf – nur für dich sichtbar</div>` : ""}

    <article class="guest-event-card">
      ${renderEventCover(event)}
      <p class="eyebrow">Veranstaltung</p>
      <h1 class="guest-event-title">${escapeHtml(event.name)}</h1>
      <p class="guest-event-meta">${dateStr}</p>
      ${locationHtml}
      ${renderOrganizerContact(event)}
      ${event.description ? `<div class="guest-event-desc">${renderParagraphs(event.description)}</div>` : ""}
    </article>

    ${renderTimetableSection(event, tracks, timetable)}

    ${renderAttendeeSection(visibility, registrations, isOrganizer)}

    ${renderVisibleAnswers(registrations, answers)}

    ${bringItems.length ? `
      <section class="guest-section">
        <h2>Mitbringsel</h2>
        ${bringItems.map((item) => renderBringItem(item, regCount, claims, registrations)).join("")}
      </section>
    ` : ""}

    ${renderEventPhotosSection(event)}

    <section class="guest-section guest-register-section" id="guest-register-section">
      <h2>Anmelden</h2>
      <form id="guest-register-form" class="guest-form">
        <div class="mb-3">
          <label class="form-label" for="guest-name">Name *</label>
          <input type="text" class="form-control" id="guest-name" required>
        </div>
        <div class="mb-3">
          <label class="form-label" for="guest-email">E-Mail (optional)</label>
          <input type="email" class="form-control" id="guest-email">
        </div>
        ${fields.map((f) => renderFieldInput(f)).join("")}
        ${bringItems.map((item) => renderBringInput(item)).join("")}
        <button type="submit" class="btn btn-primary">Anmeldung absenden</button>
        <p id="register-message" class="admin-message"></p>
      </form>
    </section>

    <section class="guest-section guest-success-section d-none" id="guest-success-section">
      <div class="guest-success-box">
        <h2>Erfolgreich angemeldet</h2>
        <p>Deine Anmeldung für <strong>${escapeHtml(event.name)}</strong> ist eingegangen.</p>
        ${renderOrganizerContact(event)}
        <button type="button" class="btn btn-primary" id="btn-download-ics">Termin als .ics herunterladen</button>
      </div>
    </section>
  `;
}

function renderAttendeeSection(visibility, registrations, organizer) {
  if (organizer && registrations.length) {
    return `
      <section class="guest-section">
        <h2>Angemeldet (${registrations.length})</h2>
        <ul class="guest-list">${registrations.map((r) => `<li>${escapeHtml(r.guest_name)}</li>`).join("")}</ul>
      </section>`;
  }
  if (!registrations.length || visibility === "none") return "";
  if (visibility === "count") {
    return `
      <section class="guest-section">
        <h2>Anmeldungen</h2>
        <p class="guest-attendee-count">${registrations.length} ${registrations.length === 1 ? "Person ist" : "Personen sind"} angemeldet</p>
      </section>`;
  }
  return `
    <section class="guest-section">
      <h2>Angemeldet (${registrations.length})</h2>
      <ul class="guest-list">${registrations.map((r) => `<li>${escapeHtml(r.guest_name)}</li>`).join("")}</ul>
    </section>`;
}

function renderFieldInput(field) {
  const req = field.required ? "required" : "";
  const id = `field-${field.id}`;
  if (field.field_type === "textarea") {
    return `<div class="mb-3"><label class="form-label" for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label><textarea class="form-control guest-field" data-field-id="${field.id}" id="${id}" ${req}></textarea></div>`;
  }
  if (field.field_type === "checkbox") {
    return `<div class="form-check mb-3"><input class="form-check-input guest-field" type="checkbox" data-field-id="${field.id}" id="${id}" ${req}><label class="form-check-label" for="${id}">${escapeHtml(field.label)}</label></div>`;
  }
  return `<div class="mb-3"><label class="form-label" for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label><input type="text" class="form-control guest-field" data-field-id="${field.id}" id="${id}" ${req}></div>`;
}

function renderBringInput(item) {
  return `
    <div class="mb-3 bring-input-row">
      <label class="form-label">${escapeHtml(item.name)} mitbringen</label>
      <div class="d-flex gap-2 align-items-center">
        <input type="number" class="form-control guest-bring-qty" data-bring-id="${item.id}" min="0" value="0" style="max-width:100px">
        <input type="text" class="form-control guest-bring-note" data-bring-id="${item.id}" placeholder="Notiz (optional)">
      </div>
    </div>`;
}

function targetQty(item, regCount) {
  if (item.quantity_mode === "per_guest") return Math.ceil(Number(item.quantity_value) * Math.max(regCount, 1));
  return Math.ceil(Number(item.quantity_value));
}

function renderBringItem(item, regCount, claims, registrations) {
  const target = targetQty(item, regCount);
  const itemClaims = claims.filter((c) => c.bring_item_id === item.id);
  const claimed = itemClaims.reduce((s, c) => s + c.quantity, 0);
  const visible = item.visible_to_others || isOrganizer;

  let listHtml = "";
  if (visible && itemClaims.length) {
    listHtml = `<ul class="guest-list">${itemClaims.map((c) => {
      const reg = registrations.find((r) => r.id === c.registration_id);
      const name = reg ? reg.guest_name : "Gast";
      return `<li>${escapeHtml(name)}: ${c.quantity}${c.note ? ` (${escapeHtml(c.note)})` : ""}</li>`;
    }).join("")}</ul>`;
  }

  return `
    <div class="bring-status-card">
      <div class="bring-status-head">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="bring-progress">${claimed} / ${target}</span>
      </div>
      <div class="progress bring-bar"><div class="progress-bar" style="width:${Math.min(100, (claimed / target) * 100)}%"></div></div>
      ${listHtml}
    </div>`;
}

function renderVisibleAnswers(registrations, answers) {
  const visibleFields = fields.filter((f) => f.visible_to_others);
  if (!visibleFields.length) return "";

  const blocks = visibleFields.map((field) => {
    const rows = registrations.map((reg) => {
      const ans = answers.find((a) => a.registration_id === reg.id && a.field_id === field.id);
      if (!ans || !ans.value) return "";
      const val = field.field_type === "checkbox" ? (ans.value === "true" ? "Ja" : "Nein") : ans.value;
      return `<li><strong>${escapeHtml(reg.guest_name)}:</strong> ${escapeHtml(val)}</li>`;
    }).filter(Boolean);
    if (!rows.length) return "";
    return `<div class="visible-field-block"><h3>${escapeHtml(field.label)}</h3><ul class="guest-list">${rows.join("")}</ul></div>`;
  }).filter(Boolean);

  if (!blocks.length) return "";
  return `<section class="guest-section"><h2>Angaben der Gäste</h2>${blocks.join("")}</section>`;
}

async function submitRegistration(client, currentRegCount, submitBtn) {
  const msg = document.getElementById("register-message");
  const guestName = document.getElementById("guest-name").value.trim();
  const guestEmail = document.getElementById("guest-email").value.trim();

  if (!guestName) {
    showStatus(msg, "Bitte Name angeben.", "error");
    return;
  }

  await withActionFeedback({
    button: submitBtn,
    messageEl: msg,
    loadingLabel: "Anmelden…",
    successLabel: "✓ Angemeldet",
    run: async () => {
      const { data: { session } } = await client.auth.getSession();

      const { data: reg, error } = await client.from("event_registrations").insert({
        event_id: eventData.id,
        guest_name: guestName,
        guest_email: guestEmail || null,
        user_id: session?.user?.id || null,
      }).select("id").single();

      if (error) throw new Error(error.message);

      const answerRows = [];
      document.querySelectorAll(".guest-field").forEach((el) => {
        const fieldId = el.dataset.fieldId;
        let value = "";
        if (el.type === "checkbox") value = el.checked ? "true" : "false";
        else value = el.value.trim();
        if (value) answerRows.push({ registration_id: reg.id, field_id: fieldId, value });
      });
      if (answerRows.length) {
        const { error: ansErr } = await client.from("event_registration_answers").insert(answerRows);
        if (ansErr) throw new Error(ansErr.message);
      }

      const claimRows = [];
      document.querySelectorAll(".guest-bring-qty").forEach((el) => {
        const qty = Number(el.value);
        if (qty > 0) {
          const noteEl = document.querySelector(`.guest-bring-note[data-bring-id="${el.dataset.bringId}"]`);
          claimRows.push({
            registration_id: reg.id,
            bring_item_id: el.dataset.bringId,
            quantity: qty,
            note: noteEl?.value.trim() || "",
          });
        }
      });
      if (claimRows.length) {
        const { error: claimErr } = await client.from("event_bring_claims").insert(claimRows);
        if (claimErr) throw new Error(claimErr.message);
      }

      return true;
    },
    onSuccess: () => {
      document.getElementById("guest-register-section")?.classList.add("d-none");
      const successSection = document.getElementById("guest-success-section");
      successSection?.classList.remove("d-none");
      successSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });
}

function renderTimetableSection(event, tracks, items) {
  if (!items.length) return "";

  const multiDay = isMultiDayEvent(event);
  let trackGroups = [];

  if (tracks.length) {
    trackGroups = tracks.map((track) => ({
      name: track.name,
      items: items.filter((item) => item.track_id === track.id),
    }));
  } else {
    trackGroups = [{ name: "", items }];
  }

  trackGroups = trackGroups.filter((group) => group.items.length);
  if (!trackGroups.length) return "";

  trackGroups.forEach((group) => {
    group.items.sort((a, b) => {
      const dateA = a.item_date || event.event_date;
      const dateB = b.item_date || event.event_date;
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
  });

  return `
    <section class="guest-section">
      <h2>Zeitplan</h2>
      ${trackGroups.map((group) => `
        <div class="timetable-track-guest">
          ${group.name ? `<h3 class="timetable-track-title">${escapeHtml(group.name)}</h3>` : ""}
          <div class="timeline">
            ${group.items.map((t) => `
              <div class="timeline-item">
                <div class="timeline-time">
                  ${multiDay && t.item_date ? `<span class="timeline-day">${escapeHtml(formatTimetableDay(t.item_date))}</span>` : ""}
                  <span>${(t.start_time || "").slice(0, 5)}</span>
                </div>
                <div class="timeline-body">
                  <strong>${escapeHtml(t.title)}</strong>
                  ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </section>`;
}

function formatEventDate(event) {
  return formatEventDateRange(event);
}
