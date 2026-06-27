function showTrouvoDialog({ title, body, buttons, fields, actionsClass }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "trouvo-dialog-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const fieldsHtml = (fields || [])
      .map((f) => {
        if (f.type === "select") {
          const opts = (f.options || [])
            .map((o) => `<option value="${escapeHtml(o.value)}"${o.value === (f.value ?? "") ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
            .join("");
          return `
            <div class="mb-3">
              <label class="form-label" for="trouvo-dialog-${f.id}">${escapeHtml(f.label)}</label>
              <select class="form-select" id="trouvo-dialog-${f.id}">${opts}</select>
              ${f.hint ? `<div class="form-text">${escapeHtml(f.hint)}</div>` : ""}
            </div>`;
        }
        return `
          <div class="mb-3">
            <label class="form-label${f.required ? " form-label-required" : ""}" for="trouvo-dialog-${f.id}">${escapeHtml(f.label)}</label>
            <input type="${f.type || "text"}" class="form-control" id="trouvo-dialog-${f.id}" value="${escapeHtml(f.value || "")}" ${f.required ? "required" : ""} placeholder="${escapeHtml(f.placeholder || "")}">
            ${f.hint ? `<div class="form-text">${escapeHtml(f.hint)}</div>` : ""}
          </div>`;
      })
      .join("");

    const startButtons = (buttons || []).filter((b) => b.align === "start");
    const endButtons = (buttons || []).filter((b) => b.align !== "start");
    const renderBtn = (b) => `<button type="button" class="btn ${b.primary ? "btn-primary" : "btn-outline-secondary"}" data-dialog-action="${escapeHtml(b.id)}">${escapeHtml(b.label)}</button>`;

    const actionsHtml = startButtons.length
      ? `<div class="trouvo-dialog-actions ${actionsClass || "trouvo-dialog-actions-split"}">
          <div class="trouvo-dialog-actions-start">${startButtons.map(renderBtn).join("")}</div>
          <div class="trouvo-dialog-actions-end">${endButtons.map(renderBtn).join("")}</div>
        </div>`
      : `<div class="trouvo-dialog-actions">${(buttons || []).map(renderBtn).join("")}</div>`;

    overlay.innerHTML = `
      <div class="trouvo-dialog">
        <h2 class="trouvo-dialog-title">${escapeHtml(title)}</h2>
        ${body ? `<p class="trouvo-dialog-body">${body}</p>` : ""}
        ${fieldsHtml}
        ${actionsHtml}
      </div>`;

    function close(result) {
      overlay.remove();
      document.body.classList.remove("trouvo-dialog-open");
      resolve(result);
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close("cancel");
    });

    overlay.querySelectorAll("[data-dialog-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.dialogAction;
        if (action === "cancel") {
          close("cancel");
          return;
        }
        const values = {};
        (fields || []).forEach((f) => {
          const el = overlay.querySelector(`#trouvo-dialog-${f.id}`);
          if (el) values[f.id] = el.value.trim();
        });
        overlay.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
        if (fields?.some((f) => f.required && !values[f.id])) {
          const missing = fields.find((f) => f.required && !values[f.id]);
          overlay.querySelector(`#trouvo-dialog-${missing.id}`)?.classList.add("is-invalid");
          return;
        }
        close({ action, values });
      });
    });

    document.body.classList.add("trouvo-dialog-open");
    document.body.appendChild(overlay);
    overlay.querySelector("input, select, textarea")?.focus();
  });
}

async function confirmTemplateMergeDialog(templateLabel) {
  const result = await showTrouvoDialog({
    title: "Felder bereits ausgefüllt",
    body: `Beim Laden der Vorlage «${templateLabel}» sind bereits ausgefüllte Felder vorhanden. Was soll passieren?`,
    buttons: [
      { id: "overwrite", label: "Überschreiben", primary: true },
      { id: "skip", label: "Überspringen" },
      { id: "cancel", label: "Abbrechen", align: "start" },
    ],
  });
  if (result === "cancel") return "cancel";
  if (typeof result === "object") return result.action;
  return result;
}

async function showNewEventSetupDialog() {
  if (typeof EVENT_TEMPLATES === "undefined") {
    throw new Error("Event-Vorlagen nicht geladen.");
  }

  const templateOptions = [{ value: "", label: "Keine Vorlage" }];
  Object.entries(EVENT_TEMPLATES).forEach(([key, tpl]) => {
    templateOptions.push({ value: key, label: tpl.label });
  });

  const result = await showTrouvoDialog({
    title: "Neue Veranstaltung",
    body: "Name und Datum festlegen. Optional startest du mit einer Vorlage für Info und Planung.",
    fields: [
      { id: "name", label: "Name", type: "text", required: true, placeholder: "z.B. Grillabend" },
      { id: "date", label: "Datum", type: "date", required: true },
      {
        id: "template",
        label: "Vorlage",
        type: "select",
        value: "",
        options: templateOptions,
        hint: "Optional — füllt Info- und Planungsseite vor.",
      },
    ],
    buttons: [
      { id: "cancel", label: "Abbrechen", align: "start" },
      { id: "create", label: "Neues Event erstellen", primary: true, align: "end" },
    ],
    actionsClass: "trouvo-dialog-actions-split",
  });

  if (result === "cancel" || typeof result !== "object" || result.action !== "create") {
    return null;
  }
  return result.values;
}
