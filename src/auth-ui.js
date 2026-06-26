const authInstances = new Map();
let globalAuthBound = false;

function recoverAuthFromWrongHost() {
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token")) return;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;
  const production = (window.SITE_URL || "https://riozma.ch").replace(/\/$/, "");
  window.location.replace(`${production}${window.location.pathname}${window.location.search}${hash}`);
}

recoverAuthFromWrongHost();

async function initAuthUI(options = {}) {
  const {
    onAuthChange,
    loginContainerId = "auth-container",
    mode = "compact",
    showGoogle = true,
  } = options;

  const container = document.getElementById(loginContainerId);
  if (!container) return null;

  const client = getSupabase();
  if (!client) {
    container.innerHTML = `<p class="auth-hint text-muted small">Supabase noch nicht konfiguriert.</p>`;
    return null;
  }

  const authResult = await completeAuthFromUrl(client);

  authInstances.set(loginContainerId, { container, onAuthChange, mode, showGoogle, client, pendingAuthError: authResult.error });
  container.classList.toggle("auth-container-discreet", mode === "discreet");

  async function renderContainer(loginContainerId, session) {
    const inst = authInstances.get(loginContainerId);
    if (!inst) return;
    const { container, onAuthChange, mode, showGoogle, client, pendingAuthError } = inst;

    if (session) {
      const logoutId = `auth-logout-${loginContainerId}`;
      if (mode === "discreet") {
        container.innerHTML = `
          <div class="auth-discreet logged-in">
            <button type="button" class="auth-discreet-btn" id="${logoutId}">Abmelden</button>
          </div>`;
      } else {
        const name = session.user.user_metadata?.full_name || session.user.email;
        container.innerHTML = `
          <div class="auth-bar logged-in">
            <span>Angemeldet als ${escapeHtml(name)}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="${logoutId}">Abmelden</button>
          </div>`;
      }
      document.getElementById(logoutId).addEventListener("click", async () => {
        await client.auth.signOut({ scope: "global" });
      });
      if (onAuthChange) onAuthChange(session);
      return;
    }

    const formId = `auth-form-${loginContainerId}`;
    const msgId = `auth-message-${loginContainerId}`;

    if (mode === "discreet") {
      container.innerHTML = `
        <div class="auth-discreet">
          <button type="button" class="auth-discreet-btn" data-toggle-discreet="${loginContainerId}">Anmelden</button>
          <div id="auth-discreet-panel-${loginContainerId}" class="auth-discreet-panel d-none">
            ${showGoogle ? `<button type="button" class="btn btn-google btn-google-sm w-100" data-google="${loginContainerId}"><span>G</span> Google</button>` : ""}
            <form id="${formId}" class="auth-form auth-form-discreet">
              <input type="email" class="form-control form-control-sm" id="auth-email-${loginContainerId}" placeholder="E-Mail" required>
              <input type="password" class="form-control form-control-sm" id="auth-password-${loginContainerId}" placeholder="Passwort" required minlength="6">
              <div class="auth-discreet-actions">
                <button type="submit" class="btn btn-sm btn-primary">Einloggen</button>
              </div>
              <p id="${msgId}" class="auth-message"></p>
            </form>
          </div>
        </div>`;
    } else {
      const fullClass = mode === "full" ? "auth-panel-full" : "";
      container.innerHTML = `
        <div class="auth-panel ${fullClass}">
          ${mode === "full" ? `<h2 class="auth-panel-title">Anmelden</h2><p class="auth-panel-lead">Melde dich an, um Veranstaltungen zu planen.</p>` : ""}
          ${showGoogle ? `<button type="button" class="btn btn-google w-100" data-google="${loginContainerId}"><span>G</span> Mit Google anmelden</button><div class="auth-divider"><span>oder</span></div>` : ""}
          ${mode === "compact" ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-form="${loginContainerId}">Mit E-Mail anmelden</button>` : ""}
          <form id="${formId}" class="auth-form ${mode === "compact" ? "d-none" : ""}">
            <div class="mb-2">
              <label class="form-label" for="auth-email-${loginContainerId}">E-Mail</label>
              <input type="email" class="form-control" id="auth-email-${loginContainerId}" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="auth-password-${loginContainerId}">Passwort</label>
              <input type="password" class="form-control" id="auth-password-${loginContainerId}" required minlength="6">
            </div>
            <div class="auth-actions">
              <button type="submit" class="btn btn-primary">Einloggen</button>
              <button type="button" class="btn btn-link" data-register="${loginContainerId}">Registrieren</button>
            </div>
            <p id="${msgId}" class="auth-message"></p>
          </form>
        </div>`;
    }

    container.querySelector(`[data-google="${loginContainerId}"]`)?.addEventListener("click", async () => {
      const msg = document.getElementById(msgId);
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authRedirectUrl(),
          skipBrowserRedirect: false,
        },
      });
      if (error && msg) showStatus(msg, error.message, "error");
      else if (data?.url) window.location.assign(data.url);
    });

    container.querySelector(`[data-toggle-discreet="${loginContainerId}"]`)?.addEventListener("click", () => {
      document.getElementById(`auth-discreet-panel-${loginContainerId}`)?.classList.toggle("d-none");
    });

    container.querySelector(`[data-toggle-form="${loginContainerId}"]`)?.addEventListener("click", () => {
      document.getElementById(formId).classList.toggle("d-none");
    });

    document.getElementById(formId).addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById(`auth-email-${loginContainerId}`).value.trim();
      const password = document.getElementById(`auth-password-${loginContainerId}`).value;
      const msg = document.getElementById(msgId);
      const submitBtn = e.submitter;
      await withActionFeedback({
        button: submitBtn,
        messageEl: msg,
        loadingLabel: "…",
        successLabel: "✓",
        run: async () => {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw new Error(error.message);
          return true;
        },
      });
    });

    container.querySelector(`[data-register="${loginContainerId}"]`)?.addEventListener("click", async () => {
      const email = document.getElementById(`auth-email-${loginContainerId}`).value.trim();
      const password = document.getElementById(`auth-password-${loginContainerId}`).value;
      const msg = document.getElementById(msgId);
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) showStatus(msg, error.message, "error");
      else showStatus(msg, "Konto erstellt. Bitte E-Mail bestätigen, falls aktiviert.", "success");
    });

    if (pendingAuthError) {
      const msg = document.getElementById(msgId);
      if (msg) showStatus(msg, pendingAuthError, "error");
      inst.pendingAuthError = null;
    }

    if (onAuthChange) onAuthChange(null);
  }

  async function renderAll(session) {
    for (const id of authInstances.keys()) {
      await renderContainer(id, session);
    }
  }

  if (!globalAuthBound) {
    globalAuthBound = true;
    client.auth.onAuthStateChange((_event, session) => {
      renderAll(session);
    });
  }

  const { data: { session } } = await client.auth.getSession();
  await renderAll(session);

  return client;
}

function renderDashboardAuth(session) {
  const el = document.getElementById("auth-container-dashboard");
  if (!el) return;
  if (!session) {
    el.innerHTML = "";
    return;
  }
  const client = getSupabase();
  const name = session.user.user_metadata?.full_name || session.user.email;
  el.innerHTML = `
    <div class="auth-bar logged-in">
      <span>${escapeHtml(name)}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="auth-logout-dashboard">Abmelden</button>
    </div>
  `;
  document.getElementById("auth-logout-dashboard").addEventListener("click", async () => {
    await client.auth.signOut({ scope: "global" });
  });
}
