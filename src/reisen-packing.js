let tripId = null;
let tripData = null;
let members = [];
let packingItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  tripId = tripIdFromUrl();
  const client = getSupabase();
  if (!client || !tripId) {
    document.getElementById("packing-loading").textContent = "Ungültige Anfrage — bitte vom Dashboard eine Reise wählen.";
    return;
  }

  try {
    await completeAuthFromUrl(client);
    const session = await waitForAuthSession(client);
    if (!session) {
      redirectToReisenLogin(`/reisen/packliste.html?id=${encodeURIComponent(tripId)}`);
      return;
    }

    const access = await loadTripAccess(client, tripId, session.user.id);
    if (!access.trip || !access.isMember) {
      document.getElementById("packing-loading").textContent = "Kein Zugriff auf diese Reise.";
      return;
    }

    tripData = access.trip;
    setTripTitle(tripData.name?.trim() || `${tripData.start_location} – ${tripData.end_location}`);
    document.title = `Packliste – ${tripData.name || "Reise"}`;

    const [membersRes, itemsRes] = await Promise.all([
      client.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at"),
      client.from("trip_packing_items").select("*").eq("trip_id", tripId).order("sort_order"),
    ]);
    if (membersRes.error) throw new Error(membersRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    members = membersRes.data || [];
    packingItems = itemsRes.data || [];

    renderPacking();
    wireAddButton();

    document.getElementById("packing-loading").classList.add("d-none");
    document.getElementById("packing-content").classList.remove("d-none");
  } catch (err) {
    document.getElementById("packing-loading").textContent = err?.message || "Packliste konnte nicht geladen werden.";
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

function renderPacking() {
  const openEl = document.getElementById("packing-open");
  const doneEl = document.getElementById("packing-done");
  const doneWrap = document.getElementById("packing-done-wrap");
  const openItems = packingItems.filter((i) => !i.packed);
  const doneItems = packingItems.filter((i) => i.packed);

  document.getElementById("packing-done-count").textContent = String(doneItems.length);
  doneWrap.classList.toggle("d-none", !doneItems.length);

  openEl.innerHTML = openItems.length
    ? openItems.map((item) => renderPackingRow(item)).join("")
    : `<p class="text-muted small planning-empty">Noch keine offenen Gegenstände.</p>`;
  doneEl.innerHTML = doneItems.map((item) => renderPackingRow(item)).join("");

  bindRows(openEl);
  bindRows(doneEl);
}

function renderPackingRow(item) {
  return `
    <div class="builder-row planning-material-row${item.packed ? " planning-row-acquired" : ""}" data-packing-id="${item.id}">
      <label class="planning-check-label">
        <input type="checkbox" class="form-check-input reisen-packing-packed" ${item.packed ? "checked" : ""}>
        <span class="visually-hidden">Gepackt</span>
      </label>
      <input type="text" class="form-control form-control-sm reisen-packing-name" placeholder="Gegenstand" value="${escapeHtml(item.name || "")}">
      <input type="text" class="form-control form-control-sm reisen-packing-qty" placeholder="Anzahl" value="${escapeHtml(item.quantity || "")}">
      <select class="form-select form-select-sm reisen-packing-assignee">${memberOptionsHtml(members, item.assignee_member_id, true)}</select>
      <button type="button" class="btn btn-sm btn-outline-danger reisen-remove-packing" title="Entfernen">×</button>
    </div>`;
}

function bindRows(container) {
  container.querySelectorAll("[data-packing-id]").forEach((row) => {
    const id = row.dataset.packingId;
    const item = packingItems.find((i) => i.id === id);
    if (!item) return;

    row.querySelector(".reisen-packing-packed").addEventListener("change", (e) => {
      item.packed = e.target.checked;
      renderPacking();
      debouncedSave(`packing.${id}.packed`, async (client) => {
        const { error } = await client.from("trip_packing_items").update({ packed: item.packed }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-packing-name").addEventListener("change", (e) => {
      item.name = e.target.value.trim();
      debouncedSave(`packing.${id}.name`, async (client) => {
        const { error } = await client.from("trip_packing_items").update({ name: item.name }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-packing-qty").addEventListener("change", (e) => {
      item.quantity = e.target.value.trim();
      debouncedSave(`packing.${id}.quantity`, async (client) => {
        const { error } = await client.from("trip_packing_items").update({ quantity: item.quantity }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-packing-assignee").addEventListener("change", (e) => {
      item.assignee_member_id = e.target.value || null;
      debouncedSave(`packing.${id}.assignee`, async (client) => {
        const { error } = await client.from("trip_packing_items").update({ assignee_member_id: item.assignee_member_id }).eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });

    row.querySelector(".reisen-remove-packing").addEventListener("click", async () => {
      await runSave(async (client) => {
        const { error } = await client.from("trip_packing_items").delete().eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
        packingItems = packingItems.filter((i) => i.id !== id);
        renderPacking();
      });
    });
  });
}

function wireAddButton() {
  document.getElementById("btn-add-packing").addEventListener("click", async () => {
    await runSave(async (client) => {
      const { data, error } = await client
        .from("trip_packing_items")
        .insert({ trip_id: tripId, sort_order: packingItems.length })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      packingItems.push(data);
      renderPacking();
      document.querySelector(`[data-packing-id="${data.id}"] .reisen-packing-name`)?.focus();
    });
  });
}
