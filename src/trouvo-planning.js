let eventId = null;
let eventData = null;
let todos = [];
let materials = [];
let saveInFlight = false;

function wirePlanningActions() {
  document.getElementById("btn-add-todo")?.addEventListener("click", () => {
    collectFromDOM();
    todos.push({ title: "", assignee: "", done: false });
    renderTodos();
  });
  document.getElementById("btn-add-material")?.addEventListener("click", () => {
    collectFromDOM();
    materials.push({ name: "", quantity: "", assignee: "", acquired: false });
    renderMaterials();
  });
  document.getElementById("btn-apply-template")?.addEventListener("click", applySelectedTemplate);
  document.getElementById("btn-save-planning")?.addEventListener("click", (e) => savePlanning(e.currentTarget));
}

document.addEventListener("DOMContentLoaded", async () => {
  wirePlanningActions();

  eventId = new URLSearchParams(window.location.search).get("id");
  const client = getSupabase();
  if (!client || !eventId) {
    document.getElementById("planning-loading").textContent = "Ungültige Anfrage — bitte vom Dashboard ein Event wählen.";
    return;
  }

  try {
    await completeAuthFromUrl(client);
    const authSession = await waitForAuthSession(client);
    if (!authSession) {
      redirectToTrouvoLogin(`/trouvo/planning.html?id=${encodeURIComponent(eventId)}`);
      return;
    }

    const { data: event, error } = await client.from("events").select("*").eq("id", eventId).single();
    const access = event ? await userCanManageEvent(client, eventId, authSession.user.id) : { canManage: false };
    if (error || !event || !access.canManage) {
      document.getElementById("planning-loading").textContent = "Kein Zugriff auf diese Veranstaltung.";
      return;
    }

    eventData = event;
    setTrouvoEventTitle(event.name);
    document.title = `Planung – ${event.name}`;

    await loadPlanning(client);
    document.getElementById("planning-loading").classList.add("d-none");
    document.getElementById("planning-content").classList.remove("d-none");

    if (typeof initEventFeedback === "function") {
      initEventFeedback({
        eventId,
        enabled: event.feedback_mode_enabled,
        notes: event.feedback_notes,
        onModeChange: () => renderAll(),
      });
    }
    renderAll();
  } catch (err) {
    document.getElementById("planning-loading").classList.add("d-none");
    document.getElementById("planning-content")?.classList.remove("d-none");
    showStatus(document.getElementById("planning-message"), err.message || "Planung konnte nicht geladen werden.", "error");
  }
});

async function loadPlanning(client) {
  const [todoRes, matRes] = await Promise.all([
    client.from("event_planning_todos").select("*").eq("event_id", eventId).order("sort_order"),
    client.from("event_planning_materials").select("*").eq("event_id", eventId).order("sort_order"),
  ]);
  if (todoRes.error) throw new Error(todoRes.error.message);
  if (matRes.error) throw new Error(matRes.error.message);

  todos = (todoRes.data || []).map((row) => ({
    title: row.title || "",
    assignee: row.assignee || "",
    done: !!row.done,
  }));
  materials = (matRes.data || []).map((row) => ({
    name: row.name || "",
    quantity: row.quantity || "",
    assignee: row.assignee || "",
    acquired: !!row.acquired,
  }));
}

function renderAll() {
  renderTodos();
  renderMaterials();
}

function renderTodos() {
  const openEl = document.getElementById("planning-todos-open");
  const doneEl = document.getElementById("planning-todos-done");
  const doneWrap = document.getElementById("planning-todos-done-wrap");
  const openItems = todos.filter((t) => !t.done);
  const doneItems = todos.filter((t) => t.done);

  document.getElementById("todos-done-count").textContent = String(doneItems.length);
  doneWrap.classList.toggle("d-none", !doneItems.length);

  openEl.innerHTML = openItems.length
    ? openItems.map((item, i) => renderTodoRow(item, i, false)).join("")
    : `<p class="text-muted small planning-empty">Noch keine offenen Aufgaben.</p>`;

  doneEl.innerHTML = doneItems.map((item, i) => renderTodoRow(item, i, true)).join("");

  bindTodoHandlers(openEl);
  bindTodoHandlers(doneEl);
  if (typeof refreshAllFeedbackFields === "function") refreshAllFeedbackFields();
}

function renderTodoRow(item, displayIndex, isDone) {
  const gi = todos.indexOf(item);
  const rowHtml = `
    <div class="builder-row planning-todo-row${isDone ? " planning-row-done" : ""}" data-done="${isDone ? "1" : "0"}" data-i="${displayIndex}">
      <label class="planning-check-label">
        <input type="checkbox" class="form-check-input planning-todo-done" ${item.done ? "checked" : ""}>
        <span class="visually-hidden">Erledigt</span>
      </label>
      <input type="text" class="form-control form-control-sm planning-todo-title" placeholder="Aufgabe" value="${escapeHtml(item.title || "")}">
      <input type="text" class="form-control form-control-sm planning-todo-assignee" placeholder="Verantwortlich" value="${escapeHtml(item.assignee || "")}">
      <button type="button" class="btn btn-sm btn-outline-danger btn-remove-planning" title="Entfernen">×</button>
    </div>`;
  return typeof wrapFeedbackLine === "function"
    ? wrapFeedbackLine(rowHtml, `planning.todo.${gi}`)
    : rowHtml;
}

function bindTodoHandlers(container) {
  container.querySelectorAll(".planning-todo-done").forEach((cb) => {
    cb.addEventListener("change", () => {
      collectFromDOM();
      renderTodos();
      autoSave();
    });
  });
  container.querySelectorAll(".btn-remove-planning").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      const row = btn.closest(".planning-todo-row");
      removeTodoByRow(row);
      renderTodos();
    });
  });
}

function removeTodoByRow(row) {
  const isDone = row.dataset.done === "1";
  const index = Number(row.dataset.i);
  const list = isDone ? todos.filter((t) => t.done) : todos.filter((t) => !t.done);
  const item = list[index];
  if (!item) return;
  const globalIndex = todos.indexOf(item);
  if (globalIndex >= 0) todos.splice(globalIndex, 1);
}

function renderMaterials() {
  const openEl = document.getElementById("planning-materials-open");
  const doneEl = document.getElementById("planning-materials-done");
  const doneBlock = document.getElementById("planning-materials-done-block");
  const openItems = materials.filter((m) => !m.acquired);
  const doneItems = materials.filter((m) => m.acquired);

  doneBlock.classList.toggle("d-none", !doneItems.length);

  openEl.innerHTML = openItems.length
    ? openItems.map((item, i) => renderMaterialRow(item, i, false)).join("")
    : `<p class="text-muted small planning-empty">Noch kein offenes Material.</p>`;

  doneEl.innerHTML = doneItems.map((item, i) => renderMaterialRow(item, i, true)).join("");

  bindMaterialHandlers(openEl);
  bindMaterialHandlers(doneEl);
  if (typeof refreshAllFeedbackFields === "function") refreshAllFeedbackFields();
}

function renderMaterialRow(item, displayIndex, isAcquired) {
  const gi = materials.indexOf(item);
  const rowHtml = `
    <div class="builder-row planning-material-row${isAcquired ? " planning-row-acquired" : ""}" data-acquired="${isAcquired ? "1" : "0"}" data-i="${displayIndex}">
      <label class="planning-check-label">
        <input type="checkbox" class="form-check-input planning-material-acquired" ${item.acquired ? "checked" : ""}>
        <span class="visually-hidden">Besorgt</span>
      </label>
      <input type="text" class="form-control form-control-sm planning-material-name" placeholder="Material" value="${escapeHtml(item.name || "")}">
      <input type="text" class="form-control form-control-sm planning-material-qty" placeholder="Anzahl" value="${escapeHtml(item.quantity || "")}">
      <input type="text" class="form-control form-control-sm planning-material-assignee" placeholder="Verantwortlich" value="${escapeHtml(item.assignee || "")}">
      <button type="button" class="btn btn-sm btn-outline-danger btn-remove-planning" title="Entfernen">×</button>
    </div>`;
  return typeof wrapFeedbackLine === "function"
    ? wrapFeedbackLine(rowHtml, `planning.material.${gi}`)
    : rowHtml;
}

function bindMaterialHandlers(container) {
  container.querySelectorAll(".planning-material-acquired").forEach((cb) => {
    cb.addEventListener("change", () => {
      collectFromDOM();
      renderMaterials();
      autoSave();
    });
  });
  container.querySelectorAll(".btn-remove-planning").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectFromDOM();
      const row = btn.closest(".planning-material-row");
      removeMaterialByRow(row);
      renderMaterials();
    });
  });
}

function removeMaterialByRow(row) {
  const isAcquired = row.dataset.acquired === "1";
  const index = Number(row.dataset.i);
  const list = isAcquired ? materials.filter((m) => m.acquired) : materials.filter((m) => !m.acquired);
  const item = list[index];
  if (!item) return;
  const globalIndex = materials.indexOf(item);
  if (globalIndex >= 0) materials.splice(globalIndex, 1);
}

function collectFromDOM() {
  const nextTodos = [];

  document.querySelectorAll("#planning-todos-open .planning-todo-row, #planning-todos-done .planning-todo-row").forEach((row) => {
    nextTodos.push({
      title: row.querySelector(".planning-todo-title")?.value.trim() || "",
      assignee: row.querySelector(".planning-todo-assignee")?.value.trim() || "",
      done: !!row.querySelector(".planning-todo-done")?.checked,
    });
  });

  const nextMaterials = [];
  document.querySelectorAll("#planning-materials-open .planning-material-row, #planning-materials-done .planning-material-row").forEach((row) => {
    nextMaterials.push(readMaterialRow(row));
  });

  todos = nextTodos;
  materials = nextMaterials;
}

function readMaterialRow(row) {
  return {
    name: row.querySelector(".planning-material-name")?.value.trim() || "",
    quantity: row.querySelector(".planning-material-qty")?.value.trim() || "",
    assignee: row.querySelector(".planning-material-assignee")?.value.trim() || "",
    acquired: !!row.querySelector(".planning-material-acquired")?.checked,
  };
}

function applySelectedTemplate() {
  const key = document.getElementById("planning-template").value;
  const template = PLANNING_TEMPLATES[key];
  if (!template) {
    showStatus(document.getElementById("planning-message"), "Bitte zuerst eine Vorlage wählen.", "error");
    return;
  }

  collectFromDOM();
  let addedTodos = 0;
  let addedMaterials = 0;
  template.todos.forEach((t) => {
    if (planningTodoExists(todos, t.title)) return;
    todos.push({ title: t.title, assignee: t.assignee || "", done: false });
    addedTodos += 1;
  });
  template.materials.forEach((m) => {
    if (planningMaterialExists(materials, m.name)) return;
    materials.push({
      name: m.name,
      quantity: m.quantity || "",
      assignee: m.assignee || "",
      acquired: false,
    });
    addedMaterials += 1;
  });

  document.getElementById("planning-template").value = "";
  renderAll();
  const msg = addedTodos || addedMaterials
    ? `Vorlage «${template.label}»: ${addedTodos} Aufgabe(n), ${addedMaterials} Material — gespeichert.`
    : `Vorlage «${template.label}»: Alle Einträge waren bereits vorhanden.`;
  showStatus(document.getElementById("planning-message"), msg, "info");
  if (addedTodos || addedMaterials) autoSave();
}

let autoSaveTimer = null;
function autoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => savePlanning(null, true), 400);
}

async function savePlanning(triggerBtn, quiet) {
  if (saveInFlight) return;
  const client = getSupabase();
  const msg = document.getElementById("planning-message");
  collectFromDOM();

  const run = async () => {
    saveInFlight = true;
    try {
      await client.from("event_planning_todos").delete().eq("event_id", eventId);
      await client.from("event_planning_materials").delete().eq("event_id", eventId);

      const todoRows = todos
        .filter((t) => t.title || t.assignee)
        .map((t, i) => ({
          event_id: eventId,
          title: t.title,
          assignee: t.assignee,
          done: !!t.done,
          sort_order: i,
        }));
      const materialRows = materials
        .filter((m) => m.name || m.quantity || m.assignee)
        .map((m, i) => ({
          event_id: eventId,
          name: m.name,
          quantity: m.quantity,
          assignee: m.assignee,
          acquired: !!m.acquired,
          sort_order: i,
        }));

      if (todoRows.length) {
        const { error } = await client.from("event_planning_todos").insert(todoRows);
        if (error) throw new Error(formatDbError(error.message));
      }
      if (materialRows.length) {
        const { error } = await client.from("event_planning_materials").insert(materialRows);
        if (error) throw new Error(formatDbError(error.message));
      }

      await loadPlanning(client);
      renderAll();
      return true;
    } finally {
      saveInFlight = false;
    }
  };

  if (quiet) {
    try {
      await run();
    } catch (err) {
      if (msg) showStatus(msg, err.message || "Speichern fehlgeschlagen.", "error");
    }
    return;
  }

  await withActionFeedback({
    button: triggerBtn,
    messageEl: msg,
    loadingLabel: "Speichern…",
    successLabel: "✓ Gespeichert",
    run,
  });
}
