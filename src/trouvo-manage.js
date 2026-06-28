let eventData = null;
let fields = [];
let bringItems = [];
let registrations = [];
let answers = [];
let claims = [];
let expandedRegId = null;

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
  setTrouvoEventTitle(event.name);
  document.title = `Anmeldungen – ${event.name}`;

  await reloadData(client);
  document.getElementById("manage-loading").classList.add("d-none");
  document.getElementById("manage-content").classList.remove("d-none");
  wireManageActions();
  renderList();
});

function wireManageActions() {
  document.getElementById("btn-export-csv")?.addEventListener("click", exportRegistrationsCsv);
  document.getElementById("btn-copy-guest-link")?.addEventListener("click", copyGuestLinkFromManage);
}

function copyGuestLinkFromManage() {
  const btn = document.getElementById("btn-copy-guest-link");
  const url = guestEventUrl(eventData);
  navigator.clipboard.writeText(url).then(() => {
    const snapshot = { text: btn.textContent, disabled: btn.disabled };
    flashButtonSuccess(btn, snapshot, "✓ Kopiert", 1500);
  }).catch(() => {
    showStatus(document.getElementById("manage-message"), "Link konnte nicht kopiert werden.", "error");
  });
}

function exportRegistrationsCsv() {
  const msg = document.getElementById("manage-message");
  if (!registrations.length) {
    showStatus(msg, "Keine Anmeldungen zum Exportieren.", "error");
    return;
  }

  const headers = ["Name", "E-Mail", "Personen", ...fields.map((f) => f.label), "Angemeldet"];
  if (bringItems.length) headers.push("Mitbringsel");

  const rows = registrations.map((reg) => {
    const regAnswers = answers.filter((a) => a.registration_id === reg.id);
    const row = [
      reg.guest_name,
      reg.guest_email || "",
      String(reg.party_size || 1),
      ...fields.map((f) => {
        const ans = regAnswers.find((a) => a.field_id === f.id);
        if (!ans?.value) return "";
        return f.field_type === "checkbox" ? (ans.value === "true" ? "Ja" : "Nein") : ans.value;
      }),
      new Date(reg.created_at).toLocaleString("de-CH"),
    ];
    if (bringItems.length) row.push(formatBringSummaryPlain(reg.id));
    return row;
  });

  const csv = [headers, ...rows].map((line) => line.map(csvEscape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(eventData.name || "anmeldungen")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showStatus(msg, "CSV exportiert.", "info");
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatBringSummaryPlain(regId) {
  const regClaims = claims.filter((c) => c.registration_id === regId);
  if (!regClaims.length) return "";
  return regClaims.map((claim) => {
    const item = bringItems.find((b) => b.id === claim.bring_item_id);
    const name = item?.name || "Item";
    return `${name} x${claim.quantity}${claim.note ? ` (${claim.note})` : ""}`;
  }).join(", ");
}

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
  const headcount = registrationHeadcount(registrations);
  const maxNote = eventData.max_registrations
    ? `<p class="text-muted small mb-3">${headcount} / ${eventData.max_registrations} Personen</p>`
    : "";

  if (!registrations.length) {
    const guestUrl = guestEventUrl(eventData);
    el.innerHTML = `
      <div class="manage-empty-state">
        <p class="mb-2">Noch keine Anmeldungen.</p>
        <p class="text-muted small mb-3">Teile den Gast-Link, damit Gäste sich anmelden können:</p>
        <code class="d-block mb-2 small text-break">${escapeHtml(guestUrl)}</code>
        <button type="button" class="btn btn-sm btn-outline-primary" id="btn-copy-empty-link">Link kopieren</button>
      </div>`;
    document.getElementById("btn-copy-empty-link")?.addEventListener("click", () => {
      navigator.clipboard.writeText(guestUrl).then(() => {
        showStatus(document.getElementById("manage-message"), "Link kopiert.", "info");
      });
    });
    return;
  }

  const fieldHeaders = fields.map((f) => `<th>${escapeHtml(f.label)}</th>`).join("");
  const hasBring = bringItems.length > 0;

  el.innerHTML = `
    ${maxNote}
    <table class="registrations-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>E-Mail</th>
          <th>Personen</th>
          ${fieldHeaders}
          ${hasBring ? "<th>Mitbringsel</th>" : ""}
          <th>Angemeldet</th>
          <th class="reg-actions-col"></th>
        </tr>
      </thead>
      <tbody>
        ${registrations.map((reg) => renderRegistrationRows(reg, hasBring)).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll("[data-toggle-reg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      expandedRegId = expandedRegId === btn.dataset.toggleReg ? null : btn.dataset.toggleReg;
      renderList();
    });
  });
  el.querySelectorAll("[data-save-reg]").forEach((btn) => {
    btn.addEventListener("click", () => saveRegistration(btn, btn.dataset.saveReg));
  });
  el.querySelectorAll("[data-delete-reg]").forEach((btn) => {
    btn.addEventListener("click", () => deleteRegistration(btn, btn.dataset.deleteReg));
  });
}

function formatFieldDisplay(field, value) {
  if (field.field_type === "checkbox") return value === "true" ? "Ja" : "–";
  return value ? escapeHtml(value) : "–";
}

function formatBringSummary(regId) {
  const regClaims = claims.filter((c) => c.registration_id === regId);
  if (!regClaims.length) return "–";
  return regClaims.map((claim) => {
    const item = bringItems.find((b) => b.id === claim.bring_item_id);
    const name = item?.name || "Item";
    const note = claim.note ? ` (${claim.note})` : "";
    return `${escapeHtml(name)} × ${claim.quantity}${note}`;
  }).join(", ");
}

function renderRegistrationRows(reg, hasBring) {
  const regAnswers = answers.filter((a) => a.registration_id === reg.id);
  const created = new Date(reg.created_at).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
  const isOpen = expandedRegId === reg.id;

  const fieldCells = fields.map((f) => {
    const ans = regAnswers.find((a) => a.field_id === f.id);
    return `<td class="reg-field-cell">${formatFieldDisplay(f, ans?.value ?? "")}</td>`;
  }).join("");

  const summaryRow = `
    <tr class="reg-summary-row${isOpen ? " reg-summary-row-open" : ""}">
      <td><strong>${escapeHtml(reg.guest_name)}</strong></td>
      <td>${reg.guest_email ? escapeHtml(reg.guest_email) : "–"}</td>
      <td>${reg.party_size > 1 ? `${reg.party_size} (+1)` : "1"}</td>
      ${fieldCells}
      ${hasBring ? `<td class="reg-bring-cell">${formatBringSummary(reg.id)}</td>` : ""}
      <td class="text-muted small">${created}</td>
      <td class="reg-actions-col">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-reg="${reg.id}">${isOpen ? "Schliessen" : "Bearbeiten"}</button>
      </td>
    </tr>`;

  if (!isOpen) return summaryRow;

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
    const claim = claims.find((c) => c.registration_id === reg.id && c.bring_item_id === item.id);
    return `
      <div class="mb-2 bring-edit-row">
        <label class="form-label">${escapeHtml(item.name)}</label>
        <div class="d-flex gap-2">
          <input type="number" class="form-control form-control-sm reg-bring-qty" data-reg="${reg.id}" data-bring="${item.id}" min="0" value="${claim?.quantity || 0}" style="max-width:80px">
          <input type="text" class="form-control form-control-sm reg-bring-note" data-reg="${reg.id}" data-bring="${item.id}" placeholder="Notiz" value="${escapeHtml(claim?.note || "")}">
        </div>
      </div>`;
  }).join("");

  const colSpan = 5 + fields.length + (hasBring ? 1 : 0);

  const editRow = `
    <tr class="reg-edit-row">
      <td colspan="${colSpan}">
        <div class="reg-edit-panel">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Name</label>
              <input type="text" class="form-control form-control-sm reg-name" data-reg="${reg.id}" value="${escapeHtml(reg.guest_name)}">
              <label class="form-label mt-2">E-Mail</label>
              <input type="email" class="form-control form-control-sm reg-email" data-reg="${reg.id}" value="${escapeHtml(reg.guest_email || "")}">
            </div>
            <div class="col-md-4">
              ${fieldsHtml || `<p class="text-muted small mb-0">Keine Zusatzfelder</p>`}
            </div>
            ${bringItems.length ? `<div class="col-md-4"><h4 class="h6">Mitbringsel</h4>${bringHtml}</div>` : ""}
          </div>
          <div class="reg-edit-actions">
            <button type="button" class="btn btn-sm btn-primary" data-save-reg="${reg.id}">Speichern</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete-reg="${reg.id}">Löschen</button>
          </div>
        </div>
      </td>
    </tr>`;

  return summaryRow + editRow;
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
      expandedRegId = regId;
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
      if (expandedRegId === regId) expandedRegId = null;
      await reloadData(client);
      renderList();
    },
  });
}
