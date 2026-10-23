(function () {
  "use strict";

  var client = getSupabase();
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["v-loading", "v-auth", "v-mail", "v-recovery", "v-name", "v-pending", "v-denied", "v-admin"];
  var mode = "new";
  var recovery = false;
  var pollTimer = null;

  function show(id) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    if (pollTimer && id !== "v-pending") { clearInterval(pollTimer); pollTimer = null; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function say(id, text, ok) { var el = $(id); el.textContent = text || ""; el.classList.toggle("ok", !!ok); }
  function friendly(msg) {
    msg = String(msg || "");
    if (/invalid login/i.test(msg)) return "E-Mail oder Passwort stimmt nicht. Bitte prüfe beides.";
    if (/not confirmed/i.test(msg)) return "Bitte klicke zuerst auf den Link in der E-Mail, die wir dir geschickt haben.";
    if (/already registered|already been registered/i.test(msg)) return "Mit dieser E-Mail gibt es schon ein Konto. Bitte wähle oben «Ich habe schon ein Konto».";
    if (/password/i.test(msg) && /(least|short|weak)/i.test(msg)) return "Das Passwort ist zu kurz. Bitte mindestens 6 Zeichen.";
    if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Bitte warte einen Moment und versuche es dann nochmals.";
    if (/network|fetch/i.test(msg)) return "Keine Verbindung zum Internet. Bitte versuche es nochmals.";
    return "Das hat leider nicht geklappt: " + msg;
  }
  var MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // ---- Anmelden / Konto erstellen ----
  function setMode(m) {
    mode = m;
    var isNew = m === "new";
    $("t-new").setAttribute("aria-selected", isNew);
    $("t-login").setAttribute("aria-selected", !isNew);
    $("fld-name").hidden = !isNew;
    $("pw-hint").hidden = !isNew;
    $("a-forgot").hidden = isNew;
    $("a-pw").autocomplete = isNew ? "new-password" : "current-password";
    $("a-submit").textContent = isNew ? "Konto erstellen" : "Anmelden";
    $("g-lead").textContent = isNew
      ? "Damit nur die Familie den Stammbaum sieht, legst du einmal ein kostenloses Konto an. Das dauert eine Minute."
      : "Willkommen zurück! Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.";
    say("a-msg", "");
  }
  $("t-new").onclick = function () { setMode("new"); };
  $("t-login").onclick = function () { setMode("login"); };
  $("pw-toggle").onclick = function () {
    var f = $("a-pw"), hidden = f.type === "password";
    f.type = hidden ? "text" : "password";
    this.textContent = hidden ? "Verbergen" : "Anzeigen";
  };

  $("f-auth").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = $("a-name").value.trim(), mail = $("a-mail").value.trim(), pw = $("a-pw").value;
    if (mode === "new" && name.length < 2) return say("a-msg", "Bitte trage deinen Namen ein.");
    if (!MAIL_RE.test(mail)) return say("a-msg", "Bitte trage deine E-Mail-Adresse ein, zum Beispiel name@beispiel.ch.");
    if (mode === "new" && pw.length < 6) return say("a-msg", "Bitte wähle ein Passwort mit mindestens 6 Zeichen.");
    if (!pw) return say("a-msg", "Bitte trage dein Passwort ein.");
    var btn = $("a-submit");
    btn.disabled = true;
    say("a-msg", "");
    try {
      if (mode === "new") {
        storeAuthReturnTo();
        var r = await client.auth.signUp({ email: mail, password: pw, options: { data: { full_name: name }, emailRedirectTo: authRedirectUrl() } });
        if (r.error) return say("a-msg", friendly(r.error.message));
        if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
          setMode("login");
          return say("a-msg", "Mit dieser E-Mail gibt es schon ein Konto. Bitte melde dich hier an.");
        }
        if (!r.data.session) {
          persistPkceVerifierToCookie();
          $("m-addr").textContent = mail;
          show("v-mail");
        }
      } else {
        var s = await client.auth.signInWithPassword({ email: mail, password: pw });
        if (s.error) return say("a-msg", friendly(s.error.message));
      }
    } catch (err) {
      say("a-msg", friendly(err.message));
    } finally {
      btn.disabled = false;
    }
  });
  $("m-back").onclick = function () { setMode("login"); show("v-auth"); };

  $("a-forgot").onclick = async function () {
    var mail = $("a-mail").value.trim();
    if (!MAIL_RE.test(mail)) return say("a-msg", "Trage oben zuerst deine E-Mail-Adresse ein. Dann schicken wir dir einen Link für ein neues Passwort.");
    storeAuthReturnTo();
    sessionStorage.setItem("auth_recovery_pending", String(Date.now()));
    var r = await client.auth.resetPasswordForEmail(mail, { redirectTo: authRedirectUrl() });
    if (r.error) return say("a-msg", friendly(r.error.message));
    persistPkceVerifierToCookie();
    say("a-msg", "Wir haben dir eine E-Mail geschickt. Klicke darin auf den Link, dann kannst du ein neues Passwort festlegen.", true);
  };

  $("a-google").onclick = async function () {
    storeAuthReturnTo();
    var r = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: oauthReturnUrl(), skipBrowserRedirect: true } });
    if (r.error) return say("a-msg", friendly(r.error.message));
    if (r.data && r.data.url) { persistPkceVerifierToCookie(); location.assign(r.data.url); }
  };

  $("f-recovery").addEventListener("submit", async function (e) {
    e.preventDefault();
    var pw = $("r-pw").value;
    if (pw.length < 6) return say("r-msg", "Bitte wähle ein Passwort mit mindestens 6 Zeichen.");
    var r = await client.auth.updateUser({ password: pw });
    if (r.error) return say("r-msg", friendly(r.error.message));
    recovery = false;
    route((await client.auth.getSession()).data.session);
  });

  $("g-logout").onclick = async function () { await client.auth.signOut(); };

  // ---- Zugang prüfen ----
  var routing = false;
  async function route(session) {
    if (routing) return;
    routing = true;
    try { await routeInner(session); } finally { routing = false; }
  }
  async function routeInner(session) {
    $("g-user").hidden = !session;
    if (!session) { setMode(mode); show("v-auth"); return; }
    var u = session.user, meta = u.user_metadata || {};
    var who = meta.full_name || meta.name || u.email;
    $("g-user-name").textContent = who;
    if (recovery) { show("v-recovery"); return; }
    show("v-loading");
    var st = await client.rpc("stammbaum_status");
    var s = st.error ? "none" : st.data;
    if (s === "approved") { location.replace("/stammbaum/baum.html"); return; }
    if (s === "admin") { show("v-admin"); loadAdmin(); return; }
    if (s === "denied") { show("v-denied"); return; }
    if (s === "pending") { showPending(who); return; }
    // noch keine Anfrage: bei bekanntem Namen direkt senden, sonst nach dem Namen fragen
    if (meta.full_name || meta.name) { await sendRequest(meta.full_name || meta.name, "", who); return; }
    $("n-name").value = "";
    show("v-name");
  }

  function showPending(who) {
    $("p-name").textContent = String(who).split(/\s+/)[0] || "";
    show("v-pending");
    if (!pollTimer) pollTimer = setInterval(recheck, 20000);
  }
  async function recheck() {
    var st = await client.rpc("stammbaum_status");
    if (st.data === "approved") location.replace("/stammbaum/baum.html");
  }
  $("p-check").onclick = async function () {
    var b = this;
    b.textContent = "Prüfe …";
    await recheck();
    b.textContent = "Noch nicht freigegeben. Gleich nochmals prüfen";
    setTimeout(function () { b.textContent = "Jetzt nochmals prüfen"; }, 4000);
  };

  async function sendRequest(name, message, who) {
    var r = await client.rpc("stammbaum_request_access", { p_name: name, p_message: message });
    if (r.error) { show("v-name"); say("n-err", friendly(r.error.message)); return; }
    // Mail an Manuel; schlägt sie fehl, bleibt die Anfrage trotzdem gespeichert.
    client.functions.invoke("stammbaum-request").catch(function () {});
    if (r.data === "approved") { location.replace("/stammbaum/baum.html"); return; }
    if (r.data === "denied") { show("v-denied"); return; }
    showPending(who || name);
  }
  $("f-name").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("n-name").value.trim();
    if (name.length < 2) return say("n-err", "Bitte trage deinen Namen ein.");
    say("n-err", "");
    sendRequest(name, $("n-msg").value.trim(), name);
  });

  // ---- Admin ----
  var LABEL = { pending: "wartet", approved: "freigegeben", denied: "abgelehnt" };
  async function loadAdmin() {
    loadRequests();
    loadInvites();
  }
  async function loadRequests() {
    var r = await client.rpc("stammbaum_list_requests"), ul = $("ad-list");
    if (r.error) { ul.innerHTML = "<li>" + esc(r.error.message) + "</li>"; return; }
    if (!r.data.length) { ul.innerHTML = '<li class="g-small">Noch keine Anfragen.</li>'; return; }
    ul.innerHTML = r.data.map(function (a) {
      var b = "";
      if (a.status !== "approved") b += '<button class="go" data-id="' + a.user_id + '" data-st="approved">Freigeben</button> ';
      if (a.status === "pending") b += '<button data-id="' + a.user_id + '" data-st="denied">Ablehnen</button>';
      if (a.status === "approved") b = '<button data-id="' + a.user_id + '" data-st="denied">Entziehen</button>';
      return '<li><div class="who"><strong>' + esc(a.name || "?") + "</strong><small>" + esc(a.email) + (a.message ? " · " + esc(a.message) : "") + '</small></div><span class="st ' + a.status + '">' + LABEL[a.status] + "</span><div>" + b + "</div></li>";
    }).join("");
  }
  async function loadInvites() {
    var r = await client.rpc("stammbaum_list_invites"), ul = $("inv-list");
    if (r.error || !r.data.length) { ul.innerHTML = ""; return; }
    ul.innerHTML = r.data.map(function (a) {
      return '<li><div class="who">' + esc(a.email) + '</div><button data-rm="' + esc(a.email) + '">Entfernen</button></li>';
    }).join("");
  }
  $("ad-list").addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-id]");
    if (!b) return;
    b.disabled = true;
    await client.rpc("stammbaum_decide", { p_user: b.dataset.id, p_status: b.dataset.st });
    loadRequests();
  });
  $("inv-list").addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-rm]");
    if (!b) return;
    await client.rpc("stammbaum_remove_invite", { p_email: b.dataset.rm });
    loadInvites();
  });
  $("f-invite").addEventListener("submit", async function (e) {
    e.preventDefault();
    var mail = $("inv-mail").value.trim();
    var r = await client.rpc("stammbaum_invite", { p_email: mail });
    if (r.error) return say("inv-msg", r.error.message);
    $("inv-mail").value = "";
    say("inv-msg", mail + " ist freigegeben.", true);
    loadInvites();
  });

  // ---- Start ----
  async function start() {
    if (!client) {
      show("v-loading");
      $("v-loading").innerHTML = '<p class="g-big">Die Anmeldung ist gerade nicht verfügbar. Bitte versuche es später nochmals.</p>';
      return;
    }
    var hadCode = new URLSearchParams(location.search).has("code");
    var res = await completeAuthFromUrl(client);
    var pending = Number(sessionStorage.getItem("auth_recovery_pending") || 0);
    if (hadCode && pending && Date.now() - pending < 3600000) {
      recovery = true;
      sessionStorage.removeItem("auth_recovery_pending");
    }
    var session = (await client.auth.getSession()).data.session;
    client.auth.onAuthStateChange(function (event, s) {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      setTimeout(function () { route(s); }, 0);
    });
    await route(session);
    if (res.error && !session) {
      setMode("login");
      say("a-msg", "Der Link aus der E-Mail konnte in diesem Browser nicht geöffnet werden. Falls du deine E-Mail schon bestätigt hast, melde dich einfach hier mit E-Mail und Passwort an.");
    }
  }
  setMode("new");
  start();
})();
