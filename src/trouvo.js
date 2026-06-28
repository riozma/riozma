let currentSession = null;

function followAuthRedirect(session) {
  if (!session) return false;
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || sessionStorage.getItem("auth_return_to");
  if (!next || !next.startsWith("/trouvo/") || next.startsWith("//")) return false;
  sessionStorage.removeItem("auth_return_to");
  window.location.replace(next);
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginSection = document.getElementById("login-section");
  const dashboardSection = document.getElementById("dashboard-section");

  await initAuthUI({
    mode: "full",
    loginContainerId: "auth-container",
    onAuthChange: async (session) => {
      currentSession = session;
      if (session) {
        if (followAuthRedirect(session)) return;
        loginSection.classList.add("d-none");
        dashboardSection.classList.remove("d-none");
        renderDashboardAuth(session);
        await loadEvents();
        bindNewEventButton();
        if (new URLSearchParams(window.location.search).get("new") === "1") {
          history.replaceState({}, "", "/trouvo/");
          await openNewEventDialog();
        }
      } else {
        loginSection.classList.remove("d-none");
        dashboardSection.classList.add("d-none");
        renderDashboardAuth(null);
      }
    },
  });
});

async function loadEvents() {
  const client = getSupabase();
  if (!client || !currentSession) return;

  await maybePurgeExpiredCovers(client);

  const userId = currentSession.user.id;
  const [{ data: owned, error: ownedErr }, { data: coRows }] = await Promise.all([
    client.from("events").select("*").eq("organizer_id", userId).order("event_date", { ascending: true }),
    client.from("event_co_organizers").select("event_id").eq("user_id", userId),
  ]);

  const upcomingEl = document.getElementById("events-upcoming");
  const pastEl = document.getElementById("events-past");

  if (ownedErr) {
    upcomingEl.innerHTML = `<p class="text-danger">${escapeHtml(ownedErr.message)}</p>`;
    return;
  }

  const coIds = (coRows || []).map((r) => r.event_id).filter((id) => !(owned || []).some((e) => e.id === id));
  let coEvents = [];
  if (coIds.length) {
    const { data } = await client.from("events").select("*").in("id", coIds).order("event_date", { ascending: true });
    coEvents = data || [];
  }

  const events = [...(owned || []), ...coEvents].sort((a, b) => a.event_date.localeCompare(b.event_date));
  const regCounts = {};
  if (events.length) {
    const { data: regs } = await client
      .from("event_registrations")
      .select("event_id, party_size")
      .in("event_id", events.map((e) => e.id));
    (regs || []).forEach((r) => {
      regCounts[r.event_id] = (regCounts[r.event_id] || 0) + (Number(r.party_size) || 1);
    });
  }

  const now = new Date();
  const upcoming = [];
  const past = [];

  events.forEach((event) => {
    const { end: eventEnd } = getEventDateTimes(event);
    if (eventEnd >= now) upcoming.push(event);
    else past.push(event);
  });

  upcoming.sort((a, b) => eventSortTimestamp(a) - eventSortTimestamp(b));
  past.sort((a, b) => eventSortTimestamp(b) - eventSortTimestamp(a));

  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map((e) => renderEventCard(e, regCounts[e.id] || 0)).join("")
    : `<p class="text-muted">Keine kommenden Veranstaltungen.</p>`;
  pastEl.innerHTML = past.length
    ? past.map((e) => renderEventCard(e, regCounts[e.id] || 0)).join("")
    : `<p class="text-muted">Keine vergangenen Veranstaltungen.</p>`;

  document.querySelectorAll("[data-delete-event]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEventFromDashboard(btn.dataset.deleteEvent, btn);
    });
  });
  document.querySelectorAll("[data-duplicate-event]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateEventFromDashboard(btn.dataset.duplicateEvent, btn);
    });
  });
}

function bindNewEventButton() {
  const btn = document.getElementById("btn-new-event");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    openNewEventDialog();
  });
}

async function openNewEventDialog() {
  if (!currentSession) return;

  const btn = document.getElementById("btn-new-event");
  const snapshot = btn ? { text: btn.textContent, disabled: btn.disabled } : null;

  try {
    const setup = await showNewEventSetupDialog();
    if (!setup) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Erstelle…";
    }

    const eventId = await createEventWithSetup({
      name: setup.name,
      date: setup.date,
      template: setup.template || "",
    });

    window.location.href = `/trouvo/edit.html?id=${encodeURIComponent(eventId)}`;
  } catch (err) {
    if (btn && snapshot) {
      btn.disabled = snapshot.disabled;
      btn.textContent = snapshot.text;
    }
    showStatus(document.getElementById("dashboard-message"), err?.message || "Event konnte nicht erstellt werden.", "error");
  }
}

function renderEventCard(event, regCount) {
  const guestLink = siteUrl(`/trouvo/e/?slug=${encodeURIComponent(event.slug)}`);
  const dateStr = formatEventDate(event);
  const status = event.is_published
    ? `<span class="badge bg-success">Live</span>`
    : `<span class="badge bg-secondary">Offline</span>`;
  const isCreator = currentSession && event.organizer_id === currentSession.user.id;
  const coBadge = !isCreator ? `<span class="badge bg-info text-dark">Mitveranstalter</span>` : "";
  const coverUrl = event.cover_image_path ? storagePublicUrl("event-covers", event.cover_image_path) : "";
  const editUrl = `/trouvo/edit.html?id=${encodeURIComponent(event.id)}`;

  const menuItems = [
    `<li><a class="dropdown-item" href="/trouvo/planning.html?id=${encodeURIComponent(event.id)}">Planung</a></li>`,
    `<li><a class="dropdown-item" href="/trouvo/manage.html?id=${encodeURIComponent(event.id)}">Anmeldungen${regCount ? ` (${regCount})` : ""}</a></li>`,
    `<li><button type="button" class="dropdown-item" data-duplicate-event="${event.id}">Duplizieren</button></li>`,
    event.is_published
      ? `<li><button type="button" class="dropdown-item" data-copy="${escapeHtml(guestLink)}">Link kopieren</button></li>`
      : "",
    `<li><a class="dropdown-item" href="/trouvo/e/?slug=${encodeURIComponent(event.slug)}" target="_blank" rel="noopener">Ansehen</a></li>`,
    isCreator
      ? `<li><hr class="dropdown-divider"></li><li><button type="button" class="dropdown-item text-danger" data-delete-event="${event.id}">Löschen</button></li>`
      : "",
  ].filter(Boolean).join("");

  return `
    <article class="event-card${coverUrl ? " event-card-has-cover" : ""}">
      <a href="${editUrl}" class="event-card-hit">
        ${coverUrl ? `<div class="event-card-cover"><img src="${escapeHtml(coverUrl)}" alt=""></div>` : ""}
        <div class="event-card-main">
          <div class="event-card-top">
            <h3>${escapeHtml(event.name)}</h3>
            ${status}
            ${coBadge}
          </div>
          <p class="event-card-meta">${dateStr}${event.location ? ` · ${escapeHtml(event.location)}` : ""}${regCount ? ` · ${regCount} Anmeldung${regCount === 1 ? "" : "en"}` : ""}</p>
          ${event.description ? `<p class="event-card-desc">${escapeHtml(event.description.slice(0, 120))}${event.description.length > 120 ? "…" : ""}</p>` : ""}
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

async function deleteEventFromDashboard(eventId, btn) {
  if (!confirm("Veranstaltung wirklich unwiderruflich löschen?")) return;
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Löschen…",
    successLabel: "✓ Gelöscht",
    run: async () => {
      const { error } = await client.from("events").delete().eq("id", eventId);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: loadEvents,
  });
}

async function duplicateEventFromDashboard(sourceEventId, btn) {
  await withActionFeedback({
    button: btn,
    loadingLabel: "Dupliziere…",
    successLabel: "✓ Kopie",
    run: async () => {
      const newId = await duplicateEventFromSource(sourceEventId);
      window.location.href = `/trouvo/edit.html?id=${encodeURIComponent(newId)}`;
      return true;
    },
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const snapshot = { text: btn.textContent, disabled: btn.disabled, className: btn.className };
    flashButtonSuccess(btn, snapshot, "✓ Kopiert", 1500);
  });
});

function formatEventDate(event) {
  return formatEventDateRange(event, true);
}
