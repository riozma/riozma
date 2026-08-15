let currentSession = null;

document.addEventListener("DOMContentLoaded", async () => {
  const loginSection = document.getElementById("login-section");
  const dashboardSection = document.getElementById("dashboard-section");

  await initAuthUI({
    mode: "full",
    leadText: "Melde dich an, um Reisen zu planen.",
    loginContainerId: "auth-container",
    onAuthChange: async (session) => {
      currentSession = session;
      if (session) {
        if (followReisenAuthRedirect(session)) return;
        loginSection.classList.add("d-none");
        dashboardSection.classList.remove("d-none");
        renderDashboardAuth(session);
        await loadTrips();
        bindNewTripButton();
      } else {
        loginSection.classList.remove("d-none");
        dashboardSection.classList.add("d-none");
        renderDashboardAuth(null);
      }
    },
  });
});

async function loadTrips() {
  const client = getSupabase();
  if (!client || !currentSession) return;

  const userId = currentSession.user.id;
  const [{ data: owned, error: ownedErr }, { data: memberRows }] = await Promise.all([
    client.from("trips").select("*").eq("creator_id", userId),
    client.from("trip_members").select("trip_id").eq("user_id", userId),
  ]);

  const ongoingEl = document.getElementById("trips-ongoing");
  const upcomingEl = document.getElementById("trips-upcoming");
  const pastEl = document.getElementById("trips-past");

  if (ownedErr) {
    upcomingEl.innerHTML = `<p class="text-danger">${escapeHtml(ownedErr.message)}</p>`;
    return;
  }

  const memberTripIds = (memberRows || [])
    .map((r) => r.trip_id)
    .filter((id) => !(owned || []).some((t) => t.id === id));
  let memberTrips = [];
  if (memberTripIds.length) {
    const { data } = await client.from("trips").select("*").in("id", memberTripIds);
    memberTrips = data || [];
  }

  const trips = [...(owned || []), ...memberTrips].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const ongoing = trips.filter((t) => getTripStatus(t) === "ongoing");
  const upcoming = trips.filter((t) => getTripStatus(t) === "upcoming");
  const past = trips.filter((t) => getTripStatus(t) === "past").sort((a, b) => b.start_date.localeCompare(a.start_date));

  ongoingEl.innerHTML = ongoing.length
    ? ongoing.map((t) => renderTripCard(t)).join("")
    : `<p class="text-muted">Keine laufenden Reisen.</p>`;
  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map((t) => renderTripCard(t)).join("")
    : `<p class="text-muted">Keine kommenden Reisen.</p>`;
  pastEl.innerHTML = past.length
    ? past.map((t) => renderTripCard(t)).join("")
    : `<p class="text-muted">Keine vergangenen Reisen.</p>`;

  document.querySelectorAll("[data-delete-trip]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTripFromDashboard(btn.dataset.deleteTrip, btn);
    });
  });
  document.querySelectorAll("[data-leave-trip]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      leaveTripFromDashboard(btn.dataset.leaveTrip, btn);
    });
  });
}

function bindNewTripButton() {
  const btn = document.getElementById("btn-new-trip");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    openNewTripDialog();
  });
}

async function openNewTripDialog() {
  if (!currentSession) return;

  const btn = document.getElementById("btn-new-trip");
  const snapshot = btn ? { text: btn.textContent, disabled: btn.disabled } : null;

  try {
    const setup = await showNewTripDialog();
    if (!setup) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Erstelle…";
    }

    const tripId = await createTripWithSetup(setup);
    window.location.href = `/reisen/plan.html?id=${encodeURIComponent(tripId)}`;
  } catch (err) {
    if (btn && snapshot) {
      btn.disabled = snapshot.disabled;
      btn.textContent = snapshot.text;
    }
    showStatus(document.getElementById("dashboard-message"), err?.message || "Reise konnte nicht erstellt werden.", "error");
  }
}

function renderTripCard(trip) {
  const dateStr = formatTripDateRange(trip);
  const isCreator = currentSession && trip.creator_id === currentSession.user.id;
  const memberBadge = !isCreator ? `<span class="badge bg-info text-dark">Mitreisend</span>` : "";
  const openUrl = `/reisen/plan.html?id=${encodeURIComponent(trip.id)}`;
  const title = trip.name?.trim() || `${trip.start_location} – ${trip.end_location}`;

  const menuItems = [
    `<li><a class="dropdown-item" href="/reisen/finanzen.html?id=${encodeURIComponent(trip.id)}">Finanzen</a></li>`,
    `<li><a class="dropdown-item" href="/reisen/mitreisende.html?id=${encodeURIComponent(trip.id)}">Mitreisende</a></li>`,
    `<li><hr class="dropdown-divider"></li>`,
    isCreator
      ? `<li><button type="button" class="dropdown-item text-danger" data-delete-trip="${trip.id}">Löschen</button></li>`
      : `<li><button type="button" class="dropdown-item text-danger" data-leave-trip="${trip.id}">Verlassen</button></li>`,
  ].join("");

  return `
    <article class="event-card">
      <a href="${openUrl}" class="event-card-hit">
        <div class="event-card-main">
          <div class="event-card-top">
            <h3>${escapeHtml(title)}</h3>
            ${memberBadge}
          </div>
          <p class="event-card-meta">${dateStr}${trip.start_location ? ` · ${escapeHtml(trip.start_location)} → ${escapeHtml(trip.end_location)}` : ""}</p>
        </div>
      </a>
      <div class="dropdown event-card-menu">
        <button type="button" class="btn event-card-menu-btn" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed","placement":"bottom-end"}' data-bs-auto-close="true" aria-expanded="false" aria-label="Aktionen">
          <span class="event-card-menu-dots" aria-hidden="true">⋮</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
          ${menuItems}
        </ul>
      </div>
    </article>
  `;
}

async function deleteTripFromDashboard(tripId, btn) {
  if (!confirm("Reise wirklich unwiderruflich löschen?")) return;
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Löschen…",
    successLabel: "✓ Gelöscht",
    run: async () => {
      const { error } = await client.from("trips").delete().eq("id", tripId);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: loadTrips,
  });
}

async function leaveTripFromDashboard(tripId, btn) {
  if (!confirm("Diese Reise wirklich verlassen?")) return;
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Verlasse…",
    successLabel: "✓ Verlassen",
    run: async () => {
      const { error } = await client
        .from("trip_members")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", currentSession.user.id);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: loadTrips,
  });
}
