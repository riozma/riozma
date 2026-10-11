const authInstances = new Map();
let globalAuthBound = false;
let recoveryMode = false;

async function initAuthUI(options = {}) {
  const {
    onAuthChange,
    loginContainerId = "auth-container",
    mode = "compact",
    showGoogle = true,
    leadText = "Melde dich an, um Veranstaltungen zu planen.",
  } = options;

  const container = document.getElementById(loginContainerId);
  if (!container) return null;

  const client = getSupabase();
  if (!client) {
    container.innerHTML = `<p class="auth-hint text-muted small">Anmeldung momentan nicht verfügbar. Bitte später erneut versuchen.</p>`;
    return null;
  }

  const hadAuthCode = new URLSearchParams(window.location.search).has("code");
  const authResult = await completeAuthFromUrl(client);
  const pendingTs = Number(sessionStorage.getItem("auth_recovery_pending") || 0);
  if (hadAuthCode && pendingTs && Date.now() - pendingTs < 3600_000) {
    recoveryMode = true;
    sessionStorage.removeItem("auth_recovery_pending");
  }

  authInstances.set(loginContainerId, { container, onAuthChange, mode, showGoogle, leadText, client, pendingAuthError: authResult.error });
  container.classList.toggle("auth-container-discreet", mode === "discreet");

  async function renderContainer(loginContainerId, session) {
    const inst = authInstances.get(loginContainerId);
    if (!inst) return;
    const { container, onAuthChange, mode, showGoogle, leadText, client, pendingAuthError } = inst;

    if (session && recoveryMode) {
      container.innerHTML = `
        <div class="auth-panel auth-panel-full">
          <h2 class="auth-panel-title">Neues Passwort setzen</h2>
          <form class="auth-form" id="auth-recovery-form-${loginContainerId}">
            <div class="mb-3">
              <label class="form-label" for="auth-newpw-${loginContainerId}">Neues Passwort (min. 6 Zeichen)</label>
              <input type="password" class="form-control" id="auth-newpw-${loginContainerId}" autocomplete="new-password" required minlength="6">
            </div>
            <button type="submit" class="btn btn-primary w-100">Passwort speichern</button>
            <p class="auth-message" id="auth-recovery-msg-${loginContainerId}"></p>
          </form>
        </div>`;
      document.getElementById(`auth-recovery-form-${loginContainerId}`).addEventListener("submit", async (e) => {
        e.preventDefault();
        const pw = document.getElementById(`auth-newpw-${loginContainerId}`).value;
        const msg = document.getElementById(`auth-recovery-msg-${loginContainerId}`);
        const { error } = await client.auth.updateUser({ password: pw });
        if (error) {
          showStatus(msg, error.message, "error");
          return;
        }
        recoveryMode = false;
        await renderAll(session);
      });
      return;
    }

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
              <div class="auth-links">
                <button type="button" class="auth-link-btn" data-register="${loginContainerId}">Registrieren</button>
                <button type="button" class="auth-link-btn" data-forgot="${loginContainerId}">Passwort vergessen?</button>
              </div>
              <p id="${msgId}" class="auth-message"></p>
            </form>
          </div>
        </div>`;
    } else {
      const fullClass = mode === "full" ? "auth-panel-full" : "";
      container.innerHTML = `
        <div class="auth-panel ${fullClass}">
          ${mode === "full" ? `<h2 class="auth-panel-title">Anmelden</h2><p class="auth-panel-lead">${escapeHtml(leadText)}</p>` : ""}
          ${showGoogle ? `<button type="button" class="btn btn-google w-100" data-google="${loginContainerId}"><span>G</span> Mit Google anmelden</button><div class="auth-divider"><span>oder</span></div>` : ""}
          ${mode === "compact" ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-form="${loginContainerId}">Mit E-Mail anmelden</button>` : ""}
          <form id="${formId}" class="auth-form ${mode === "compact" ? "d-none" : ""}">
            <div class="mb-3">
              <label class="form-label" for="auth-email-${loginContainerId}">E-Mail</label>
              <input type="email" class="form-control" id="auth-email-${loginContainerId}" autocomplete="email" required>
            </div>
            <div class="mb-3">
              <label class="form-label" for="auth-password-${loginContainerId}">Passwort</label>
              <input type="password" class="form-control" id="auth-password-${loginContainerId}" autocomplete="current-password" required minlength="6">
            </div>
            <button type="submit" class="btn btn-primary w-100">Einloggen</button>
            <div class="auth-links">
              <button type="button" class="auth-link-btn" data-register="${loginContainerId}">Neu registrieren</button>
              <button type="button" class="auth-link-btn" data-forgot="${loginContainerId}">Passwort vergessen?</button>
            </div>
            <p id="${msgId}" class="auth-message"></p>
          </form>
        </div>`;
    }

    container.querySelector(`[data-google="${loginContainerId}"]`)?.addEventListener("click", async () => {
      const msg = document.getElementById(msgId);
      storeAuthReturnTo();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: oauthReturnUrl(),
          skipBrowserRedirect: true,
        },
      });
      if (error && msg) showStatus(msg, error.message, "error");
      else if (data?.url) {
        persistPkceVerifierToCookie();
        window.location.assign(data.url);
      }
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

    container.querySelector(`[data-forgot="${loginContainerId}"]`)?.addEventListener("click", async () => {
      const email = document.getElementById(`auth-email-${loginContainerId}`).value.trim();
      const msg = document.getElementById(msgId);
      if (!email) {
        showStatus(msg, "Bitte zuerst oben deine E-Mail-Adresse eintragen.", "error");
        return;
      }
      storeAuthReturnTo();
      sessionStorage.setItem("auth_recovery_pending", String(Date.now()));
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
      if (error) {
        showStatus(msg, error.message, "error");
        return;
      }
      persistPkceVerifierToCookie();
      showStatus(msg, "Falls ein Konto existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte E-Mail prüfen.", "success");
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
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recoveryMode = true;
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
