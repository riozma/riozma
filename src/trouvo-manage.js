let eventData = null;
let fields = [];
let bringItems = [];
let registrations = [];
let answers = [];
let claims = [];

document.addEventListener("DOMContentLoaded", async () => {
  const eventId = new URLSearchParams(window.location.search).get("id");
  const client = getSupabase();
  if (!client || !eventId) {
    document.getElementById("manage-loading").textContent = "Ungültige Anfrage.";
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.href = "/trouvo/";
    return;
  }

  const { data: event, error } = await client.from("events").select("*").eq("id", eventId).single();
  const access = event ? await userCanManageEvent(client, eventId, session.user.id) : { canManage: false };
  if (error || !event || !access.canManage) {
    document.getElementById("manage-loading").textContent = "Kein Zugriff auf diese Veranstaltung.";
    return;
  }

  eventData = event;
  document.getElementById("manage-event-title").textContent = event.name;
  document.title = `Anmeldungen – ${event.name}`;

  await reloadData(client);
  document.getElementById("manage-loading").classList.add("d-none");
  document.getElementById("manage-content").classList.remove("d-none");
  renderList();
});

async function reloadData(client) {
  const [fld, bring, regs] = await Promise.all([
    client.from("event_registration_fields").select("*").eq("event_id", eventData.id).order("sort_order"),
    client.from("event_bring_items").select("*").eq("event_id", eventData.id).order("sort_order"),
    client.from("event_registrations").select("*").eq("event_id", eventData.id).order("created_at"),
  ]);
  fields = fld.data || [];
  bringItems = bring.data || [];
  registrations = regs.data || [];
  const regIds = registrations.map((r) => r.id);
  answers = [];
  claims = [];
  if (regIds.length) {
    const [a, c] = await Promise.all([
      client.from("event_registration_answers").select("*").in("registration_id", regIds),
      client.from("event_bring_claims").select("*").in("registration_id", regIds),
    ]);
    answers = a.data || [];
    claims = c.data || [];
  }
}

function renderList() {
  const el = document.getElementById("registrations-list");
  if (!registrations.length) {
    el.innerHTML = `<p class="text-muted">Noch keine Anmeldungen.</p>`;
    return;
  }

  el.innerHTML = registrations.map((reg) => renderRegistrationCard(reg)).join("");

  el.querySelectorAll("[data-save-reg]").forEach((btn) => {
    btn.addEventListener("click", () => saveRegistration(btn, btn.dataset.saveReg));
  });
  el.querySelectorAll("[data-delete-reg]").forEach((btn) => {
    btn.addEventListener("click", () => deleteRegistration(btn, btn.dataset.deleteReg));
  });
}

function renderRegistrationCard(reg) {
  const regAnswers = answers.filter((a) => a.registration_id === reg.id);
  const regClaims = claims.filter((c) => c.registration_id === reg.id);
  const created = new Date(reg.created_at).toLocaleString("de-CH");

  const fieldsHtml = fields.map((f) => {
    const ans = regAnswers.find((a) => a.field_id === f.id);
    const val = ans?.value ?? "";
    if (f.field_type === "checkbox") {
      return `
        <div class="form-check mb-2">
          <input class="form-check-input reg-field" type="checkbox" data-reg="${reg.id}" data-field="${f.id}" id="cb-${reg.id}-${f.id}" ${val === "true" ? "checked" : ""}>
          <label class="form-check-label" for="cb-${reg.id}-${f.id}">${escapeHtml(f.label)}</label>
        </div>`;
    }
    if (f.field_type === "textarea") {
      return `
        <div class="mb-2">
          <label class="form-label">${escapeHtml(f.label)}</label>
          <textarea class="form-control form-control-sm reg-field" data-reg="${reg.id}" data-field="${f.id}" rows="2">${escapeHtml(val)}</textarea>
        </div>`;
    }
    return `
      <div class="mb-2">
        <label class="form-label">${escapeHtml(f.label)}</label>
        <input type="text" class="form-control form-control-sm reg-field" data-reg="${reg.id}" data-field="${f.id}" value="${escapeHtml(val)}">
      </div>`;
  }).join("");

  const bringHtml = bringItems.map((item) => {
    const claim = regClaims.find((c) => c.bring_item_id === item.id);
    return `
      <div class="mb-2 bring-edit-row">
        <label class="form-label">${escapeHtml(item.name)}</label>
        <div class="d-flex gap-2">
          <input type="number" class="form-control form-control-sm reg-bring-qty" data-reg="${reg.id}" data-bring="${item.id}" min="0" value="${claim?.quantity || 0}" style="max-width:80px">
          <input type="text" class="form-control form-control-sm reg-bring-note" data-reg="${reg.id}" data-bring="${item.id}" placeholder="Notiz" value="${escapeHtml(claim?.note || "")}">
        </div>
      </div>`;
  }).join("");

  return `
    <article class="registration-card" data-reg-id="${reg.id}">
      <div class="registration-card-head">
        <div>
          <strong>${escapeHtml(reg.guest_name)}</strong>
          <span class="text-muted small"> · ${created}</span>
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-primary" data-save-reg="${reg.id}">Speichern</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-reg="${reg.id}">Löschen</button>
        </div>
      </div>
      <div class="registration-card-body row g-3">
        <div class="col-md-6">
          <label class="form-label">Name</label>
          <input type="text" class="form-control form-control-sm reg-name" data-reg="${reg.id}" value="${escapeHtml(reg.guest_name)}">
          <label class="form-label mt-2">E-Mail</label>
          <input type="email" class="form-control form-control-sm reg-email" data-reg="${reg.id}" value="${escapeHtml(reg.guest_email || "")}">
        </div>
        <div class="col-md-6">
          ${fieldsHtml || `<p class="text-muted small">Keine Zusatzfelder</p>`}
        </div>
        ${bringItems.length ? `<div class="col-12"><h4 class="h6">Mitbringsel</h4>${bringHtml}</div>` : ""}
      </div>
    </article>`;
}

async function saveRegistration(btn, regId) {
  const client = getSupabase();
  const msg = document.getElementById("manage-message");
  const name = document.querySelector(`.reg-name[data-reg="${regId}"]`)?.value.trim();
  const email = document.querySelector(`.reg-email[data-reg="${regId}"]`)?.value.trim();

  if (!name) {
    showStatus(msg, "Name darf nicht leer sein.", "error");
    return;
  }

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: "Speichern…",
    successLabel: "✓ Gespeichert",
    successMessage: "Anmeldung gespeichert.",
    run: async () => {
      const { error: regErr } = await client.from("event_registrations").update({
        guest_name: name,
        guest_email: email || null,
      }).eq("id", regId);

      if (regErr) throw new Error(regErr.message);

      await client.from("event_registration_answers").delete().eq("registration_id", regId);
      await client.from("event_bring_claims").delete().eq("registration_id", regId);

      const answerRows = [];
      document.querySelectorAll(`.reg-field[data-reg="${regId}"]`).forEach((el) => {
        const fieldId = el.dataset.field;
        let value = "";
        if (el.type === "checkbox") value = el.checked ? "true" : "false";
        else value = el.value.trim();
        if (value && value !== "false") answerRows.push({ registration_id: regId, field_id: fieldId, value });
      });
      if (answerRows.length) {
        const { error } = await client.from("event_registration_answers").insert(answerRows);
        if (error) throw new Error(error.message);
      }

      const claimRows = [];
      document.querySelectorAll(`.reg-bring-qty[data-reg="${regId}"]`).forEach((el) => {
        const qty = Number(el.value);
        if (qty > 0) {
          const noteEl = document.querySelector(`.reg-bring-note[data-reg="${regId}"][data-bring="${el.dataset.bring}"]`);
          claimRows.push({
            registration_id: regId,
            bring_item_id: el.dataset.bring,
            quantity: qty,
            note: noteEl?.value.trim() || "",
          });
        }
      });
      if (claimRows.length) {
        const { error } = await client.from("event_bring_claims").insert(claimRows);
        if (error) throw new Error(error.message);
      }

      return true;
    },
    onSuccess: async () => {
      await reloadData(getSupabase());
      renderList();
    },
  });
}

async function deleteRegistration(btn, regId) {
  if (!confirm("Anmeldung wirklich löschen?")) return;
  const client = getSupabase();
  const msg = document.getElementById("manage-message");

  await withActionFeedback({
    button: btn,
    messageEl: msg,
    loadingLabel: "Löschen…",
    successLabel: "✓ Gelöscht",
    successMessage: "Anmeldung gelöscht.",
    run: async () => {
      const { error } = await client.from("event_registrations").delete().eq("id", regId);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: async () => {
      await reloadData(client);
      renderList();
    },
  });
}
