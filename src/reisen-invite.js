let inviteToken = null;
let invitePreview = null;
let currentSession = null;

document.addEventListener("DOMContentLoaded", async () => {
  inviteToken = new URLSearchParams(window.location.search).get("token");
  const previewEl = document.getElementById("invite-preview");
  const client = getSupabase();

  if (!client || !inviteToken) {
    previewEl.innerHTML = `<p class="text-danger">Ungültiger Einladungslink.</p>`;
    return;
  }

  const { data, error } = await client.rpc("preview_trip_invite", { p_token: inviteToken }).single();
  if (error || !data) {
    previewEl.innerHTML = `<p class="text-danger">Einladung konnte nicht geladen werden.</p>`;
    return;
  }

  invitePreview = data;

  if (!data.valid) {
    previewEl.innerHTML = `
      <h1 class="section-heading">Einladung</h1>
      <p class="text-danger">${escapeHtml(data.reason || "Dieser Einladungslink ist nicht mehr gültig.")}</p>
      <a href="/reisen/" class="btn btn-outline-secondary">Zu Reisen</a>`;
    return;
  }

  const dateRange = formatTripDateRange({ start_date: data.start_date, end_date: data.end_date });
  previewEl.innerHTML = `
    <h1 class="section-heading">Du bist eingeladen!</h1>
    <div class="reisen-invite-card">
      <h2 class="reisen-invite-trip-name">${escapeHtml(data.trip_name || "Reise")}</h2>
      <p class="text-muted">${escapeHtml(dateRange)}</p>
      ${data.invited_as ? `<p class="text-muted small">Eingeladen als: <strong>${escapeHtml(data.invited_as)}</strong></p>` : ""}
    </div>`;

  await initAuthUI({
    mode: "full",
    leadText: "Melde dich an oder erstelle ein Konto, um der Reise beizutreten.",
    loginContainerId: "auth-container",
    onAuthChange: (session) => {
      currentSession = session;
      document.getElementById("invite-auth").classList.toggle("d-none", !!session);
      document.getElementById("invite-join").classList.toggle("d-none", !session);
      if (session) {
        const nameInput = document.getElementById("invite-display-name");
        if (!nameInput.value) {
          nameInput.value = invitePreview.invited_as
            || session.user.user_metadata?.full_name
            || (session.user.email ? session.user.email.split("@")[0] : "");
        }
      }
    },
  });

  document.getElementById("btn-join-trip").addEventListener("click", joinTrip);
});

async function joinTrip(e) {
  if (!currentSession) return;
  const client = getSupabase();
  const displayName = document.getElementById("invite-display-name").value.trim();

  await withActionFeedback({
    button: e.currentTarget,
    messageEl: document.getElementById("invite-message"),
    loadingLabel: "Trete bei…",
    successLabel: "✓ Beigetreten",
    run: async () => {
      await ensureWriteSession(client);
      const { data, error } = await client.rpc("accept_trip_invite", {
        p_token: inviteToken,
        p_display_name: displayName,
      }).single();
      if (error) throw new Error(formatDbError(error.message));
      return data;
    },
    onSuccess: (member) => {
      window.location.href = `/reisen/plan.html?id=${encodeURIComponent(member.trip_id)}`;
    },
  });
}
