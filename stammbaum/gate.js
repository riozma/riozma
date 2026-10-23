(function () {
  "use strict";

  var client = getSupabase();
  var $ = function (id) { return document.getElementById(id); };
  var panes = ["sbg-loading", "sbg-request", "sbg-pending", "sbg-denied", "sbg-admin"];
  function show(id) { panes.forEach(function (p) { $(p).hidden = p !== id; }); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function ownMail(session) { return (session.user.user_metadata && session.user.user_metadata.full_name) || ""; }

  async function onSession(session) {
    if (!session) { show(null); return; }
    show("sbg-loading");
    var st = await client.rpc("stammbaum_status");
    var s = st.error ? "none" : st.data;
    if (s === "approved") { location.replace("/stammbaum/baum.html"); return; }
    if (s === "admin") { show("sbg-admin"); loadRequests(); return; }
    if (s === "pending") { show("sbg-pending"); return; }
    if (s === "denied") { show("sbg-denied"); return; }
    $("sbg-name").value = $("sbg-name").value || ownMail(session);
    show("sbg-request");
  }

  $("sbg-request").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("sbg-req-err");
    err.textContent = "";
    var r = await client.rpc("stammbaum_request_access", { p_name: $("sbg-name").value, p_message: $("sbg-msg").value });
    if (r.error) { err.textContent = r.error.message; return; }
    // Mail an Manuel; schlägt sie fehl, bleibt die Anfrage trotzdem gespeichert und erscheint unter «Freigaben».
    client.functions.invoke("stammbaum-request").catch(function () {});
    show("sbg-pending");
  });

  var LABEL = { pending: "offen", approved: "freigegeben", denied: "abgelehnt" };
  async function loadRequests() {
    var r = await client.rpc("stammbaum_list_requests");
    var ul = $("sbg-list");
    if (r.error) { ul.innerHTML = "<li>" + esc(r.error.message) + "</li>"; return; }
    if (!r.data.length) { ul.innerHTML = '<li class="sbg-sub">Noch keine Anfragen.</li>'; return; }
    ul.innerHTML = r.data.map(function (a) {
      var btns = a.status !== "approved" ? '<button class="btn btn-sm btn-primary" data-id="' + a.user_id + '" data-st="approved">Freigeben</button>' : "";
      if (a.status === "pending") btns += ' <button class="btn btn-sm btn-outline-secondary" data-id="' + a.user_id + '" data-st="denied">Ablehnen</button>';
      if (a.status === "approved") btns = '<button class="btn btn-sm btn-outline-secondary" data-id="' + a.user_id + '" data-st="denied">Entziehen</button>';
      return '<li><div class="who"><strong>' + esc(a.name || "?") + "</strong><small>" + esc(a.email) + (a.message ? " · " + esc(a.message) : "") + '</small></div><span class="st ' + a.status + '">' + LABEL[a.status] + "</span><div>" + btns + "</div></li>";
    }).join("");
  }
  $("sbg-list").addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-id]");
    if (!b) return;
    b.disabled = true;
    await client.rpc("stammbaum_decide", { p_user: b.dataset.id, p_status: b.dataset.st });
    loadRequests();
  });

  $("sbg-file").addEventListener("change", async function () {
    var f = this.files[0], msg = $("sbg-upmsg");
    if (!f) return;
    try {
      var data = JSON.parse(await f.text());
      if (!Array.isArray(data.persons) || !Array.isArray(data.families)) throw new Error("Datei hat nicht das erwartete Format.");
      var r = await client.rpc("stammbaum_set", { p_data: data });
      if (r.error) throw r.error;
      msg.textContent = data.persons.length + " Personen gespeichert.";
    } catch (err) {
      msg.textContent = "Fehler: " + (err.message || err);
    }
  });

  if (!client) { $("sbg-auth").innerHTML = "<p class='sbg-note'>Anmeldung momentan nicht verfügbar.</p>"; return; }
  initAuthUI({
    mode: "full",
    loginContainerId: "sbg-auth",
    leadText: "Melde dich an, um Zugang zum Stammbaum anzufragen.",
    onAuthChange: onSession,
  });
})();
