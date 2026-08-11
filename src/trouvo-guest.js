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
    loading.textContent = "Diese Seite ist momentan nicht verfügbar. Bitte später erneut versuchen.";
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

  const dialogEl = document.getElementById("guest-register-dialog");
  document.getElementById("btn-open-register")?.addEventListener("click", () => dialogEl?.showModal());
  document.getElementById("btn-cancel-register")?.addEventListener("click", () => dialogEl?.close());
  dialogEl?.addEventListener("click", (e) => {
    const rect = dialogEl.getBoundingClientRect();
    const inside = e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right;
    if (!inside) dialogEl.close();
  });
  dialogEl?.addEventListener("input", () => saveDraft(eventData, collectDraftFromDialog()));

  document.getElementById("guest-register-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitRegistration(client, registrations, e.submitter, dialogEl);
  });

  document.getElementById("btn-download-ics-bottom")?.addEventListener("click", () => {
    downloadEventIcs(eventData);
  });
  document.getElementById("btn-share-event")?.addEventListener("click", () => {
    shareGuestEvent(eventData);
  });
  document.getElementById("guest-feedback-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuestFeedback(client, e.submitter);
  });
});

function draftKey(event) {
  return `trouvo_draft_${event.id}`;
}

function registeredKey(event) {
  return `trouvo_registered_${event.id}`;
}

function loadDraft(event) {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(event)) || "{}");
  } catch {
    return {};
  }
}

function saveDraft(event, draft) {
  try {
    sessionStorage.setItem(draftKey(event), JSON.stringify(draft));
  } catch {
    /* ignore – e.g. storage disabled */
  }
}

function clearDraft(event) {
  try {
    sessionStorage.removeItem(draftKey(event));
  } catch {
    /* ignore */
  }
}

function collectDraftFromDialog() {
  const draft = {
    guestName: document.getElementById("guest-name")?.value || "",
    guestEmail: document.getElementById("guest-email")?.value || "",
    plusOne: document.getElementById("guest-plus-one")?.checked || false,
    fields: {},
    bring: {},
  };
  document.querySelectorAll(".guest-field").forEach((el) => {
    draft.fields[el.dataset.fieldId] = el.type === "checkbox" ? el.checked : el.value;
  });
  document.querySelectorAll(".guest-bring-qty").forEach((el) => {
    const id = el.dataset.bringId;
    draft.bring[id] = { ...draft.bring[id], qty: el.value };
  });
  document.querySelectorAll(".guest-bring-check").forEach((el) => {
    const id = el.dataset.bringId;
    draft.bring[id] = { ...draft.bring[id], checked: el.checked };
  });
  document.querySelectorAll(".guest-bring-note").forEach((el) => {
    const id = el.dataset.bringId;
    draft.bring[id] = { ...draft.bring[id], note: el.value };
  });
  return draft;
}

async function shareGuestEvent(event) {
  const url = guestEventShareUrl(event);
  const shareData = { title: event.name, text: `Anmeldung: ${event.name}`, url };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch {
      /* fallback */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showStatus(document.getElementById("guest-feedback-message") || document.getElementById("register-message"), "Link kopiert.", "info");
  } catch {
    showStatus(document.getElementById("register-message"), "Teilen nicht möglich.", "error");
  }
}

function buildPage(event, tracks, timetable, registrations, claims, answers) {
  const dateStr = formatEventDateRange(event);
  const headcount = registrationHeadcount(registrations);
  const maxReached = event.max_registrations && headcount >= event.max_registrations;
  const locationHtml = event.location ? renderLocationBlock(event.location) : "";
  const draft = loadDraft(event);
  const alreadyRegistered = !!sessionStorage.getItem(registeredKey(event));
  const canRegister = isRegistrationOpen(event) && !maxReached && !alreadyRegistered;

  return `
    ${isOrganizer ? `<div class="organizer-banner"><span>Du bist Veranstalter</span><a href="/trouvo/edit.html?id=${event.id}" class="btn btn-sm btn-light">Info</a><a href="/trouvo/planning.html?id=${event.id}" class="btn btn-sm btn-light">Planung</a><a href="/trouvo/manage.html?id=${event.id}" class="btn btn-sm btn-light">Anmeldungen</a></div>` : ""}
    ${!event.is_published ? `<div class="draft-banner">Offline – nur für Veranstalter sichtbar</div>` : ""}

    <article class="guest-event-card">
      ${renderEventCover(event)}
      <p class="eyebrow">Veranstaltung</p>
      <h1 class="guest-event-title">${escapeHtml(event.name)}</h1>
      <p class="guest-event-meta">${renderOrganizerAndDate(event, dateStr)}</p>
      ${event.description ? `<div class="guest-event-desc">${renderParagraphs(event.description)}</div>` : ""}
      ${locationHtml}
    </article>

    ${renderTimetableSection(event, tracks, timetable)}

    ${renderAttendeeSection(getAttendeeVisibility(event), registrations, headcount, isOrganizer)}

    ${renderVisibleAnswers(registrations, answers)}

    ${renderRegistrationCta(event, headcount, maxReached, alreadyRegistered)}
    ${canRegister ? renderRegistrationDialog(event, draft) : ""}

    ${bringItems.length ? `
      <section class="guest-section">
        <h2>Mitbringsel</h2>
        ${bringItems.map((item) => renderBringItem(item, headcount, claims, registrations)).join("")}
      </section>
    ` : ""}

    ${renderEventPhotosSection(event)}

    ${renderGuestFeedbackSection(event)}

    ${renderActionsSection(event)}
  `;
}

function renderOrganizerAndDate(event, dateStr) {
  const parts = [];
  if (event.organizer_name) parts.push(`Veranstaltet von ${escapeHtml(event.organizer_name)}`);
  parts.push(escapeHtml(dateStr));
  return parts.join(" · ");
}

function renderRegistrationCta(event, headcount, maxReached, alreadyRegistered) {
  const maxHint = event.max_registrations
    ? `<p class="text-muted small">${headcount} / ${event.max_registrations} Plätze belegt</p>`
    : "";

  if (alreadyRegistered) {
    return `
      <section class="guest-section guest-register-section" id="guest-register-section">
        <h2>Anmeldung</h2>
        ${renderRegisteredState()}
      </section>`;
  }

  if (!isRegistrationOpen(event)) {
    return `
      <section class="guest-section guest-register-section">
        <h2>Anmeldung</h2>
        <p class="text-muted">${escapeHtml(registrationClosedMessage(event))}</p>
      </section>`;
  }

  if (maxReached) {
    return `
      <section class="guest-section guest-register-section">
        <h2>Anmeldung</h2>
        <p class="text-muted">Maximale Teilnehmerzahl erreicht (${headcount}/${event.max_registrations}).</p>
      </section>`;
  }

  const deadlineHint = event.registration_closes_at
    ? `<p class="text-muted small">Anmeldefrist: ${escapeHtml(new Date(event.registration_closes_at).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" }))}</p>`
    : "";

  return `
    <section class="guest-section guest-register-section" id="guest-register-section">
      <h2>Anmeldung</h2>
      ${maxHint}
      ${deadlineHint}
      <button type="button" class="btn btn-primary" id="btn-open-register">Jetzt anmelden</button>
    </section>`;
}

function renderRegisteredState(emailHint) {
  return `
    <div class="guest-success-box guest-success-inline">
      <p>✓ Du bist angemeldet für <strong>${escapeHtml(eventData.name)}</strong>.</p>
      <p class="text-muted small${emailHint ? "" : " d-none"}" id="guest-success-email-hint">${emailHint ? escapeHtml(emailHint) : ""}</p>
      <button type="button" class="btn btn-outline-primary btn-sm" id="btn-download-ics-success">Termin als .ics herunterladen</button>
    </div>`;
}

function renderRegistrationDialog(event, draft) {
  const emailRequired = !!event.guest_email_required;
  const plusOne = !!event.allow_plus_one;

  return `
    <dialog id="guest-register-dialog" class="guest-register-dialog">
      <form id="guest-register-form" class="guest-form">
        <h2>Anmelden</h2>
        <div class="mb-3">
          <label class="form-label" for="guest-name">Name *</label>
          <input type="text" class="form-control" id="guest-name" required value="${escapeHtml(draft.guestName || "")}">
        </div>
        <div class="mb-3">
          <label class="form-label" for="guest-email">E-Mail${emailRequired ? " *" : " (optional)"}</label>
          <input type="email" class="form-control" id="guest-email" ${emailRequired ? "required" : ""} value="${escapeHtml(draft.guestEmail || "")}">
        </div>
        ${plusOne ? `
          <div class="form-check mb-3">
            <input class="form-check-input" type="checkbox" id="guest-plus-one" ${draft.plusOne ? "checked" : ""}>
            <label class="form-check-label" for="guest-plus-one">Ich bringe eine Begleitung (+1) mit</label>
          </div>` : ""}
        ${fields.map((f) => renderFieldInput(f, draft)).join("")}
        ${bringItems.length ? `<h3 class="guest-dialog-subtitle">Mitbringsel</h3>${bringItems.map((item) => renderBringInput(item, draft)).join("")}` : ""}
        <div class="guest-dialog-actions">
          <button type="button" class="btn btn-outline-secondary" id="btn-cancel-register">Abbrechen</button>
          <button type="submit" class="btn btn-primary">Anmeldung absenden</button>
        </div>
        <p id="register-message" class="admin-message"></p>
      </form>
    </dialog>`;
}

function renderGuestFeedbackSection(event) {
  if (!isEventPast(event)) return "";
  return `
    <section class="guest-section guest-feedback-section" id="guest-feedback-section">
      <h2>Wie war's?</h2>
      <p class="text-muted small">Dein Feedback nach dem Event — optional, aber willkommen.</p>
      <form id="guest-feedback-form" class="guest-feedback-form guest-form">
        <div class="mb-3">
          <label class="form-label" for="guest-fb-name">Name *</label>
          <input type="text" class="form-control" id="guest-fb-name" required>
        </div>
        <div class="mb-3">
          <label class="form-label" for="guest-fb-email">E-Mail (optional)</label>
          <input type="email" class="form-control" id="guest-fb-email">
        </div>
        <div class="mb-3">
          <label class="form-label" for="guest-fb-message">Feedback *</label>
          <textarea class="form-control" id="guest-fb-message" required placeholder="Was lief gut? Was können wir besser machen?"></textarea>
        </div>
        <button type="submit" class="btn btn-outline-primary">Feedback senden</button>
        <p id="guest-feedback-message" class="admin-message"></p>
      </form>
    </section>`;
}

function renderActionsSection(event) {
  const contactHtml = renderOrganizerContact(event);
  return `
    <section class="guest-section guest-actions-section">
      <h2>Teilen & Kalender</h2>
      <div class="guest-share-row">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-share-event">Link teilen</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-download-ics-bottom">In Kalender (.ics)</button>
      </div>
      ${contactHtml}
    </section>`;
}

function renderAttendeeSection(visibility, registrations, headcount, organizer) {
  if (organizer && registrations.length) {
    return `
      <section class="guest-section">
        <h2>Angemeldet (${headcount})</h2>
        <ul class="guest-list">${registrations.map((r) => `<li>${escapeHtml(r.guest_name)}${r.party_size > 1 ? " (+1)" : ""}</li>`).join("")}</ul>
      </section>`;
  }
  if (!registrations.length || visibility === "none") return "";
  if (visibility === "count") {
    return `
      <section class="guest-section">
        <h2>Anmeldungen</h2>
        <p class="guest-attendee-count">${headcount} ${headcount === 1 ? "Person ist" : "Personen sind"} angemeldet</p>
      </section>`;
  }
  return `
    <section class="guest-section">
      <h2>Angemeldet (${headcount})</h2>
      <ul class="guest-list">${registrations.map((r) => `<li>${escapeHtml(r.guest_name)}${r.party_size > 1 ? " (+1)" : ""}</li>`).join("")}</ul>
    </section>`;
}

function renderFieldInput(field, draft) {
  const req = field.required ? "required" : "";
  const id = `field-${field.id}`;
  const val = draft?.fields?.[field.id];
  if (field.field_type === "textarea") {
    return `<div class="mb-3"><label class="form-label" for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label><textarea class="form-control guest-field" data-field-id="${field.id}" id="${id}" ${req}>${escapeHtml(val || "")}</textarea></div>`;
  }
  if (field.field_type === "checkbox") {
    return `<div class="form-check mb-3"><input class="form-check-input guest-field" type="checkbox" data-field-id="${field.id}" id="${id}" ${req} ${val ? "checked" : ""}><label class="form-check-label" for="${id}">${escapeHtml(field.label)}</label></div>`;
  }
  return `<div class="mb-3"><label class="form-label" for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label><input type="text" class="form-control guest-field" data-field-id="${field.id}" id="${id}" ${req} value="${escapeHtml(val || "")}"></div>`;
}

function renderBringInput(item, draft) {
  const state = draft?.bring?.[item.id] || {};
  if (item.quantity_mode === "none") {
    return `
      <div class="mb-3 bring-input-row bring-input-row-check">
        <div class="form-check">
          <input class="form-check-input guest-bring-check" type="checkbox" data-bring-id="${item.id}" id="bring-check-${item.id}" ${state.checked ? "checked" : ""}>
          <label class="form-check-label" for="bring-check-${item.id}">${escapeHtml(item.name)} bringe ich mit</label>
        </div>
        <input type="text" class="form-control guest-bring-note" data-bring-id="${item.id}" placeholder="Notiz (optional)" value="${escapeHtml(state.note || "")}">
      </div>`;
  }
  return `
    <div class="mb-3 bring-input-row">
      <label class="form-label">${escapeHtml(item.name)} mitbringen</label>
      <div class="d-flex gap-2 align-items-center">
        <input type="number" class="form-control guest-bring-qty" data-bring-id="${item.id}" min="0" value="${escapeHtml(state.qty ?? "0")}" style="max-width:100px">
        <input type="text" class="form-control guest-bring-note" data-bring-id="${item.id}" placeholder="Notiz (optional)" value="${escapeHtml(state.note || "")}">
      </div>
    </div>`;
}

function targetQty(item, regCount) {
  if (item.quantity_mode === "per_guest") return Math.ceil(Number(item.quantity_value) * Math.max(regCount, 1));
  return Math.ceil(Number(item.quantity_value));
}

function renderBringItem(item, regCount, claims, registrations) {
  const itemClaims = claims.filter((c) => c.bring_item_id === item.id);
  const visible = item.visible_to_others || isOrganizer;

  const renderNames = (withQty) => `<ul class="guest-list">${itemClaims.map((c) => {
    const reg = registrations.find((r) => r.id === c.registration_id);
    const name = reg ? reg.guest_name : "Gast";
    return `<li>${escapeHtml(name)}${withQty ? `: ${c.quantity}` : ""}${c.note ? ` (${escapeHtml(c.note)})` : ""}</li>`;
  }).join("")}</ul>`;

  if (item.quantity_mode === "none") {
    return `
      <div class="bring-status-card bring-status-card-check">
        <div class="bring-status-head">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="bring-progress">${itemClaims.length ? `${itemClaims.length} ${itemClaims.length === 1 ? "Zusage" : "Zusagen"}` : "Noch offen"}</span>
        </div>
        ${visible && itemClaims.length ? renderNames(false) : ""}
      </div>`;
  }

  const target = targetQty(item, regCount);
  const claimed = itemClaims.reduce((s, c) => s + c.quantity, 0);

  return `
    <div class="bring-status-card">
      <div class="bring-status-head">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="bring-progress">${claimed} / ${target}</span>
      </div>
      <div class="progress bring-bar"><div class="progress-bar" style="width:${Math.min(100, (claimed / target) * 100)}%"></div></div>
      ${visible && itemClaims.length ? renderNames(true) : ""}
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

async function submitRegistration(client, existingRegs, submitBtn, dialogEl) {
  const msg = document.getElementById("register-message");
  const guestName = document.getElementById("guest-name").value.trim();
  const guestEmail = document.getElementById("guest-email").value.trim();
  const partySize = document.getElementById("guest-plus-one")?.checked ? 2 : 1;

  if (!guestName) {
    showStatus(msg, "Bitte Name angeben.", "error");
    return;
  }
  if (!isRegistrationOpen(eventData)) {
    showStatus(msg, registrationClosedMessage(eventData), "error");
    return;
  }
  if (eventData.guest_email_required && !guestEmail) {
    showStatus(msg, "Bitte E-Mail angeben.", "error");
    return;
  }

  const currentHeadcount = registrationHeadcount(existingRegs);
  if (eventData.max_registrations && currentHeadcount + partySize > eventData.max_registrations) {
    const left = Math.max(0, eventData.max_registrations - currentHeadcount);
    showStatus(msg, left
      ? `Nur noch ${left} ${left === 1 ? "Platz" : "Plätze"} frei — Begleitung ggf. abwählen.`
      : "Maximale Teilnehmerzahl erreicht.", "error");
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
        party_size: partySize,
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
      document.querySelectorAll(".guest-bring-check").forEach((el) => {
        if (el.checked) {
          const noteEl = document.querySelector(`.guest-bring-note[data-bring-id="${el.dataset.bringId}"]`);
          claimRows.push({
            registration_id: reg.id,
            bring_item_id: el.dataset.bringId,
            quantity: 1,
            note: noteEl?.value.trim() || "",
          });
        }
      });
      if (claimRows.length) {
        const { error: claimErr } = await client.from("event_bring_claims").insert(claimRows);
        if (claimErr) throw new Error(claimErr.message);
      }

      let emailSent = false;
      if (eventData.send_registration_email && guestEmail) {
        const { data: mailData, error: mailErr } = await client.functions.invoke("send-registration-email", {
          body: { registration_id: reg.id },
        });
        if (!mailErr && mailData?.sent) {
          emailSent = true;
        } else if (mailErr?.message || mailData?.error) {
          console.warn("Bestätigungsmail:", mailErr?.message || mailData?.error);
        }
      }

      return { emailSent, guestEmail };
    },
    onSuccess: (result) => {
      clearDraft(eventData);
      sessionStorage.setItem(registeredKey(eventData), "1");
      dialogEl?.close();
      const ctaSection = document.getElementById("guest-register-section");
      if (ctaSection) {
        const emailHint = result?.emailSent && result?.guestEmail
          ? `Bestätigungsmail wurde an ${result.guestEmail} gesendet.`
          : "";
        ctaSection.innerHTML = `<h2>Anmeldung</h2>${renderRegisteredState(emailHint)}`;
        document.getElementById("btn-download-ics-success")?.addEventListener("click", () => downloadEventIcs(eventData));
        ctaSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
  });
}

async function submitGuestFeedback(client, submitBtn) {
  const msg = document.getElementById("guest-feedback-message");
  const name = document.getElementById("guest-fb-name").value.trim();
  const email = document.getElementById("guest-fb-email").value.trim();
  const message = document.getElementById("guest-fb-message").value.trim();

  if (!name || !message) {
    showStatus(msg, "Bitte Name und Feedback ausfüllen.", "error");
    return;
  }

  await withActionFeedback({
    button: submitBtn,
    messageEl: msg,
    loadingLabel: "Senden…",
    successLabel: "✓ Danke",
    run: async () => {
      const { error } = await client.from("event_guest_feedback").insert({
        event_id: eventData.id,
        guest_name: name,
        guest_email: email || null,
        message,
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => {
      document.getElementById("guest-feedback-form")?.reset();
      showStatus(msg, "Danke für dein Feedback!", "info");
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
