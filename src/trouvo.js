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
      .select("event_id")
      .in("event_id", events.map((e) => e.id));
    (regs || []).forEach((r) => {
      regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1;
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

  past.reverse();

  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map((e) => renderEventCard(e, regCounts[e.id] || 0)).join("")
    : `<p class="text-muted">Keine kommenden Veranstaltungen.</p>`;
  pastEl.innerHTML = past.length
    ? past.map((e) => renderEventCard(e, regCounts[e.id] || 0)).join("")
    : `<p class="text-muted">Keine vergangenen Veranstaltungen.</p>`;

  document.querySelectorAll("[data-delete-event]").forEach((btn) => {
    btn.addEventListener("click", () => deleteEventFromDashboard(btn.dataset.deleteEvent, btn));
  });

  document.getElementById("btn-new-event")?.addEventListener("click", () => {
    sessionStorage.setItem("auth_return_to", "/trouvo/edit.html");
  });
}

function renderEventCard(event, regCount) {
  const guestLink = siteUrl(`/trouvo/e/?slug=${encodeURIComponent(event.slug)}`);
  const dateStr = formatEventDate(event);
  const status = event.is_published
    ? `<span class="badge bg-success">Live</span>`
    : `<span class="badge bg-secondary">Entwurf</span>`;
  const isCreator = currentSession && event.organizer_id === currentSession.user.id;
  const coBadge = !isCreator ? `<span class="badge bg-info text-dark">Mitveranstalter</span>` : "";

  return `
    <article class="event-card">
      <div class="event-card-main">
        <div class="event-card-top">
          <h3>${escapeHtml(event.name)}</h3>
          ${status}
          ${coBadge}
        </div>
        <p class="event-card-meta">${dateStr}${event.location ? ` · ${escapeHtml(event.location)}` : ""}${regCount ? ` · ${regCount} Anmeldung${regCount === 1 ? "" : "en"}` : ""}</p>
        ${event.description ? `<p class="event-card-desc">${escapeHtml(event.description.slice(0, 120))}${event.description.length > 120 ? "…" : ""}</p>` : ""}
      </div>
      <div class="event-card-actions">
        <a href="/trouvo/edit.html?id=${event.id}" class="btn btn-sm btn-outline-secondary">Bearbeiten</a>
        <a href="/trouvo/manage.html?id=${event.id}" class="btn btn-sm btn-outline-secondary">Anmeldungen${regCount ? ` (${regCount})` : ""}</a>
        ${event.is_published ? `<button type="button" class="btn btn-sm btn-outline-primary" data-copy="${guestLink}">Link kopieren</button>` : ""}
        <a href="/trouvo/e/?slug=${encodeURIComponent(event.slug)}" class="btn btn-sm btn-primary">Ansehen</a>
        ${isCreator ? `<button type="button" class="btn btn-sm btn-outline-danger" data-delete-event="${event.id}">Löschen</button>` : ""}
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
