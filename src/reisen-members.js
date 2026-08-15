let tripId = null;
let tripData = null;
let currentUserId = null;
let isCreator = false;
let members = [];
let invites = [];

document.addEventListener("DOMContentLoaded", async () => {
  tripId = tripIdFromUrl();
  const client = getSupabase();
  if (!client || !tripId) {
    document.getElementById("members-loading").textContent = "Ungültige Anfrage — bitte vom Dashboard eine Reise wählen.";
    return;
  }

  try {
    await completeAuthFromUrl(client);
    const session = await waitForAuthSession(client);
    if (!session) {
      redirectToReisenLogin(`/reisen/mitreisende.html?id=${encodeURIComponent(tripId)}`);
      return;
    }
    currentUserId = session.user.id;

    const access = await loadTripAccess(client, tripId, currentUserId);
    if (!access.trip || !access.isMember) {
      document.getElementById("members-loading").textContent = "Kein Zugriff auf diese Reise.";
      return;
    }

    tripData = access.trip;
    isCreator = access.isCreator;
    setTripTitle(tripData.name?.trim() || `${tripData.start_location} – ${tripData.end_location}`);
    document.title = `Mitreisende – ${tripData.name || "Reise"}`;

    await loadMembersData(client);
    renderMembers();
    renderInvites();
    wireButtons();

    document.getElementById("members-loading").classList.add("d-none");
    document.getElementById("members-content").classList.remove("d-none");
  } catch (err) {
    document.getElementById("members-loading").textContent = err?.message || "Mitreisende konnten nicht geladen werden.";
  }
});

async function loadMembersData(client) {
  const [membersRes, invitesRes] = await Promise.all([
    client.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at"),
    client.from("trip_invites").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (invitesRes.error) throw new Error(invitesRes.error.message);
  members = membersRes.data || [];
  invites = invitesRes.data || [];
}

function renderMembers() {
  const el = document.getElementById("members-list");
  el.innerHTML = members.length
    ? members.map((m) => {
        const isSelf = m.user_id === currentUserId;
        const isTripCreator = m.user_id === tripData.creator_id;
        const badges = [
          isTripCreator ? `<span class="badge bg-success">Ersteller</span>` : "",
          m.is_placeholder ? `<span class="badge bg-secondary">Ohne Konto</span>` : "",
          isSelf ? `<span class="badge bg-info text-dark">Du</span>` : "",
        ].filter(Boolean).join(" ");

        const actions = [];
        if (isSelf && !isTripCreator) {
          actions.push(`<button type="button" class="btn btn-sm btn-outline-danger" data-leave-member="${m.id}">Verlassen</button>`);
        } else if (!isSelf && (isCreator || m.is_placeholder)) {
          actions.push(`<button type="button" class="btn btn-sm btn-outline-danger" data-remove-member="${m.id}">Entfernen</button>`);
        }
        if (m.is_placeholder) {
          actions.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-invite-placeholder="${m.id}">Einladungslink</button>`);
        }

        return `
          <div class="builder-row reisen-member-row" data-member-id="${m.id}">
            <input type="text" class="form-control form-control-sm reisen-member-name" placeholder="Name" value="${escapeHtml(m.display_name || "")}">
            <div class="reisen-member-badges">${badges}</div>
            <div class="reisen-member-actions">${actions.join(" ")}</div>
          </div>`;
      }).join("")
    : `<p class="text-muted small planning-empty">Noch keine Mitreisenden.</p>`;

  el.querySelectorAll(".reisen-member-row").forEach((row) => {
    const id = row.dataset.memberId;
    row.querySelector(".reisen-member-name").addEventListener("change", async (e) => {
      const displayName = e.target.value.trim();
      const client = getSupabase();
      const { error } = await client.from("trip_members").update({ display_name: displayName }).eq("id", id);
      if (error) {
        showStatus(document.getElementById("members-message"), formatDbError(error.message), "error");
        return;
      }
      const m = members.find((x) => x.id === id);
      if (m) m.display_name = displayName;
    });
  });

  el.querySelectorAll("[data-leave-member]").forEach((btn) => {
    btn.addEventListener("click", () => removeMember(btn.dataset.leaveMember, btn, "Diese Reise wirklich verlassen?", true));
  });
  el.querySelectorAll("[data-remove-member]").forEach((btn) => {
    btn.addEventListener("click", () => removeMember(btn.dataset.removeMember, btn, "Mitreisende:n wirklich entfernen?", false));
  });
  el.querySelectorAll("[data-invite-placeholder]").forEach((btn) => {
    btn.addEventListener("click", () => createInvite(btn.dataset.invitePlaceholder, btn));
  });
}

async function removeMember(memberId, btn, confirmText, redirectAfter) {
  if (!confirm(confirmText)) return;
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    messageEl: document.getElementById("members-message"),
    loadingLabel: "…",
    successLabel: "✓",
    run: async () => {
      const { error } = await client.from("trip_members").delete().eq("id", memberId);
      if (error) throw new Error(formatDbError(error.message));
      return true;
    },
    onSuccess: async () => {
      if (redirectAfter) {
        window.location.href = "/reisen/";
        return;
      }
      members = members.filter((m) => m.id !== memberId);
      renderMembers();
    },
  });
}

function inviteUrl(invite) {
  return siteUrl(`/reisen/einladung.html?token=${encodeURIComponent(invite.token)}`);
}

function renderInvites() {
  const el = document.getElementById("invites-list");
  const active = invites.filter((i) => !i.revoked);
  el.innerHTML = active.length
    ? active.map((invite) => {
        const placeholder = invite.placeholder_member_id
          ? members.find((m) => m.id === invite.placeholder_member_id)
          : null;
        const expired = invite.expires_at && new Date(invite.expires_at) < new Date();
        const usedUp = invite.max_uses !== null && invite.uses_count >= invite.max_uses;
        const state = expired ? "Abgelaufen" : usedUp ? "Verwendet" : "Aktiv";
        const url = inviteUrl(invite);
        return `
          <div class="builder-row reisen-invite-row" data-invite-id="${invite.id}">
            <div class="reisen-invite-info">
              <span class="reisen-invite-url">${escapeHtml(url)}</span>
              <span class="text-muted small">
                ${placeholder ? `Für: ${escapeHtml(memberLabel(placeholder))} · ` : ""}
                ${state}${invite.expires_at ? ` · gültig bis ${new Date(invite.expires_at).toLocaleDateString("de-CH")}` : ""}
                · ${invite.uses_count}× verwendet
              </span>
            </div>
            <div class="reisen-member-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-copy-invite="${escapeHtml(url)}">Kopieren</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-revoke-invite="${invite.id}">Widerrufen</button>
            </div>
          </div>`;
      }).join("")
    : `<p class="text-muted small planning-empty">Keine aktiven Einladungslinks.</p>`;

  el.querySelectorAll("[data-copy-invite]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copyInvite).then(() => {
        const snapshot = { text: btn.textContent, disabled: btn.disabled, className: btn.className };
        flashButtonSuccess(btn, snapshot, "✓ Kopiert", 1500);
      });
    });
  });

  el.querySelectorAll("[data-revoke-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.revokeInvite;
      const client = getSupabase();
      await withActionFeedback({
        button: btn,
        messageEl: document.getElementById("members-message"),
        loadingLabel: "…",
        successLabel: "✓",
        run: async () => {
          const { error } = await client.from("trip_invites").update({ revoked: true }).eq("id", id);
          if (error) throw new Error(formatDbError(error.message));
          return true;
        },
        onSuccess: () => {
          const invite = invites.find((i) => i.id === id);
          if (invite) invite.revoked = true;
          renderInvites();
        },
      });
    });
  });
}

async function createInvite(placeholderMemberId, btn) {
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    messageEl: document.getElementById("members-message"),
    loadingLabel: "Erstelle…",
    successLabel: "✓ Erstellt",
    run: async () => {
      await ensureWriteSession(client);
      const { data, error } = await client.rpc("create_trip_invite", {
        p_trip_id: tripId,
        p_placeholder_member_id: placeholderMemberId || null,
      }).single();
      if (error) throw new Error(formatDbError(error.message));
      return data;
    },
    onSuccess: async (invite) => {
      invites.unshift(invite);
      renderInvites();
      try {
        await navigator.clipboard.writeText(inviteUrl(invite));
        showStatus(document.getElementById("members-message"), "Einladungslink erstellt und kopiert.", "success");
      } catch (_) {
        showStatus(document.getElementById("members-message"), "Einladungslink erstellt.", "success");
      }
    },
  });
}

function wireButtons() {
  document.getElementById("btn-add-placeholder").addEventListener("click", async () => {
    const name = prompt("Name der/des Mitreisenden (ohne Konto):");
    if (!name?.trim()) return;
    const client = getSupabase();
    const { data, error } = await client
      .from("trip_members")
      .insert({ trip_id: tripId, user_id: null, display_name: name.trim(), is_placeholder: true })
      .select("*")
      .single();
    if (error) {
      showStatus(document.getElementById("members-message"), formatDbError(error.message), "error");
      return;
    }
    members.push(data);
    renderMembers();
  });

  document.getElementById("btn-create-invite").addEventListener("click", (e) => {
    createInvite(null, e.currentTarget);
  });
}
