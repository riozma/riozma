let tripId = null;
let tripData = null;
let members = [];
let todoItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  tripId = tripIdFromUrl();
  const client = getSupabase();
  if (!client || !tripId) {
    document.getElementById("todos-loading").textContent = "Ungültige Anfrage — bitte vom Dashboard eine Reise wählen.";
    return;
  }

  try {
    await completeAuthFromUrl(client);
    const session = await waitForAuthSession(client);
    if (!session) {
      redirectToReisenLogin(`/reisen/todos.html?id=${encodeURIComponent(tripId)}`);
      return;
    }

    const access = await loadTripAccess(client, tripId, session.user.id);
    if (!access.trip || !access.isMember) {
      document.getElementById("todos-loading").textContent = "Kein Zugriff auf diese Reise.";
      return;
    }

    tripData = access.trip;
    setTripTitle(tripData.name?.trim() || `${tripData.start_location} – ${tripData.end_location}`);
    document.title = `To-Dos – ${tripData.name || "Reise"}`;

    const [membersRes, itemsRes] = await Promise.all([
      client.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at"),
      client.from("trip_todos").select("*").eq("trip_id", tripId).order("sort_order"),
    ]);
    if (membersRes.error) throw new Error(membersRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    members = membersRes.data || [];
    todoItems = itemsRes.data || [];

    renderTodos();
    wireAddButton();

    document.getElementById("todos-loading").classList.add("d-none");
    document.getElementById("todos-content").classList.remove("d-none");
  } catch (err) {
    document.getElementById("todos-loading").textContent = err?.message || "To-Dos konnten nicht geladen werden.";
  }
});

const saveTimers = new Map();
function debouncedSave(key, fn) {
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => runSave(fn), 600));
}

async function runSave(fn) {
  const client = getSupabase();
  showAutoSaveFeedback(null, "pending");
  try {
    await fn(client);
    showAutoSaveFeedback(null, "ok");
  } catch (err) {
    showAutoSaveFeedback(null, "error", err?.message || "Speichern fehlgeschlagen.");
  }
}

function renderTodos() {
  const openEl = document.getElementById("todos-open");
  const doneEl = document.getElementById("todos-done");
  const doneWrap = document.getElementById("todos-done-wrap");
  const openItems = todoItems.filter((i) => !i.done);
  const doneItems = todoItems.filter((i) => i.done);

  document.getElementById("todos-done-count").textContent = String(doneItems.length);
  doneWrap.classList.toggle("d-none", !doneItems.length);

  openEl.innerHTML = openItems.length
    ? openItems.map((item) => renderTodoRow(item)).join("")
    : `<p class="text-muted small planning-empty">Noch keine offenen Aufgaben.</p>`;
  doneEl.innerHTML = doneItems.map((item) => renderTodoRow(item)).join("");

  bindRows(openEl);
  bindRows(doneEl);
}

function renderTodoRow(item) {
  return `
    <div class="builder-row planning-todo-row${item.done ? " planning-row-done" : ""}" data-todo-id="${item.id}">
      <label class="planning-check-label">
        <input type="checkbox" class="form-check-input reisen-todo-done" ${item.done ? "checked" : ""}>
        <span class="visually-hidden">Erledigt</span>
      </label>
      <input type="text" class="form-control form-control-sm reisen-todo-title" placeholder="Aufgabe" value="${escapeHtml(item.title || "")}">
      <select class="form-select form-select-sm reisen-todo-assignee">${memberOptionsHtml(members, item.assignee_member_id, true)}</select>
      <button type="button" class="btn btn-sm btn-outline-danger reisen-remove-todo" title="Entfernen">×</button>
    </div>`;
}

function bindRows(container) {
  container.querySelectorAll("[data-todo-id]").forEach((row) => {
    const id = row.dataset.todoId;
    const item = todoItems.find((i) => i.id === id);
    if (!item) return;

    row.querySelector(".reisen-todo-done").addEventListener("change", (e) => {
      item.done = e.target.checked;
      renderTodos();
      debouncedSave(`todo.${id}.done`, async (client) => {
        const { error } = await client.from("trip_todos").update({ done: item.done }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-todo-title").addEventListener("change", (e) => {
      item.title = e.target.value.trim();
      debouncedSave(`todo.${id}.title`, async (client) => {
        const { error } = await client.from("trip_todos").update({ title: item.title }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-todo-assignee").addEventListener("change", (e) => {
      item.assignee_member_id = e.target.value || null;
      debouncedSave(`todo.${id}.assignee`, async (client) => {
        const { error } = await client.from("trip_todos").update({ assignee_member_id: item.assignee_member_id }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-remove-todo").addEventListener("click", async () => {
      await runSave(async (client) => {
        const { error } = await client.from("trip_todos").delete().eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
        todoItems = todoItems.filter((i) => i.id !== id);
        renderTodos();
      });
    });
  });
}

function wireAddButton() {
  document.getElementById("btn-add-todo").addEventListener("click", async () => {
    await runSave(async (client) => {
      const { data, error } = await client
        .from("trip_todos")
        .insert({ trip_id: tripId, sort_order: todoItems.length })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      todoItems.push(data);
      renderTodos();
      document.querySelector(`[data-todo-id="${data.id}"] .reisen-todo-title`)?.focus();
    });
  });
}
