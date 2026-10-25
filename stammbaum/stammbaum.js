(function () {
  "use strict";

  var W = 230, H = 88, GX = 60, GY = 16;
  var MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

  var P, F, ROOT;
  var state = { focus: 0, sel: null, mode: "both", level: 2 };
  function upGens() { return state.level; }
  function downGens() { return Math.max(1, state.level - 1); }
  var view = { x: 0, y: 0, k: 1 };

  var $ = function (id) { return document.getElementById(id); };
  var stage = $("sb-stage"), world = $("sb-world"), nodesEl = $("sb-nodes"), edges = $("sb-edges");
  var panel = $("sb-panel"), qEl = $("sb-q"), resEl = $("sb-results");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u");
  }

  // ---- Daten-Helfer ----
  function fullName(p) { return ((p.t ? p.t + " " : "") + p.n + " " + p.s).replace(/\s+/g, " ").trim() || "Unbekannt"; }
  function plainName(p) { return (p.n + " " + p.s).replace(/\s+/g, " ").trim() || "Unbekannt"; }
  function yr(d) { var m = d && d.match(/^\d{4}/); return m ? +m[0] : null; }
  function fmtDate(d) {
    if (!d) return "";
    var m = d.match(/^(\d{4})-(\d\d)(?:-(\d\d))?$/);
    if (!m) return d;
    return (m[3] ? +m[3] + ". " : "") + MONTHS[+m[2] - 1] + " " + m[1];
  }
  function lifeYears(p) {
    var b = yr(p.b), d = yr(p.d);
    if (p.l) return b ? "* " + b : "lebt";
    if (b && d) return b + " – " + d;
    if (b) return "* " + b;
    if (d) return "† " + d;
    return "";
  }
  function parentsOf(i) {
    var p = P[i];
    if (!p.fc) return [];
    var f = F[p.fc[0]], r = [];
    if (f.h != null) r.push(f.h);
    if (f.w != null) r.push(f.w);
    return r;
  }
  function childrenOf(i) {
    var r = [];
    (P[i].fs || []).forEach(function (fi) { F[fi].c.forEach(function (c) { if (r.indexOf(c) < 0) r.push(c); }); });
    return r.sort(function (a, b) { return (yr(P[a].b) || 9999) - (yr(P[b].b) || 9999); });
  }
  function partnersOf(i) {
    var r = [];
    (P[i].fs || []).forEach(function (fi) {
      var f = F[fi], o = f.h === i ? f.w : f.h;
      if (o != null) r.push({ id: o, fam: f });
    });
    return r;
  }
  function siblingsOf(i) {
    var p = P[i];
    if (!p.fc) return [];
    var r = [];
    p.fc.forEach(function (fi) { F[fi].c.forEach(function (c) { if (c !== i && r.indexOf(c) < 0) r.push(c); }); });
    return r;
  }
  function genderClass(p) { return p.g === "M" ? "m" : p.g === "F" ? "f" : ""; }

  // ---- Layout ----
  // Gibt Knoten {id, x, y, gen, more} und Kanten {a, b} zurück; y in Slots, Wurzel bei y=0.
  function layoutUp(root, maxGen) {
    var slot = 0, nodes = [], links = [];
    function walk(i, gen, path) {
      var ps = gen < maxGen ? parentsOf(i).filter(function (p) { return path.indexOf(p) < 0; }) : [];
      var kids = ps.map(function (p) { return walk(p, gen + 1, path.concat(p)); });
      var y = kids.length ? kids.reduce(function (s, k) { return s + k.y; }, 0) / kids.length : slot++;
      var n = { id: i, gen: gen, y: y, more: gen >= maxGen && parentsOf(i).length > 0 };
      nodes.push(n);
      kids.forEach(function (k) { links.push({ a: k, b: n }); });
      return n;
    }
    var r = walk(root, 0, [root]);
    nodes.forEach(function (n) { n.y -= r.y; n.x = -n.gen * (W + GX); });
    return { nodes: nodes, links: links };
  }
  function layoutDown(root, maxGen) {
    var slot = 0, nodes = [], links = [];
    function walk(i, gen, path) {
      var cs = gen < maxGen ? childrenOf(i).filter(function (c) { return path.indexOf(c) < 0; }) : [];
      var kids = cs.map(function (c) { return walk(c, gen + 1, path.concat(c)); });
      var y = kids.length ? (kids[0].y + kids[kids.length - 1].y) / 2 : slot++;
      var n = { id: i, gen: gen, y: y, more: gen >= maxGen ? childrenOf(i).length : 0 };
      nodes.push(n);
      kids.forEach(function (k) { links.push({ a: n, b: k }); });
      return n;
    }
    var r = walk(root, 0, [root]);
    nodes.forEach(function (n) { n.y -= r.y; n.x = n.gen * (W + GX); });
    return { nodes: nodes, links: links };
  }

  // ---- Rendering ----
  var lastBox = null;
  function render(fit) {
    var root = state.focus, nodes = [], links = [];
    var up = state.mode !== "down" ? layoutUp(root, upGens()) : layoutUp(root, 0);
    var down = state.mode !== "up" ? layoutDown(root, downGens()) : layoutDown(root, 0);
    nodes = up.nodes.concat(down.nodes.filter(function (n) { return n.gen > 0; }));
    links = up.links.concat(down.links);
    var rowH = H + GY;

    var html = "", more = "";
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    nodes.forEach(function (n) {
      var p = P[n.id], x = n.x, y = n.y * rowH - H / 2;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + W);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + H);
      var line3 = "";
      if (n.gen >= 0 && (n.x >= 0 || n.gen === 0)) {
        var pt = partnersOf(n.id);
        if (pt.length) line3 = '<span class="p">∞ ' + esc(pt.map(function (q) { return plainName(P[q.id]); }).join(" · ")) + "</span>";
      }
      if (!line3) line3 = '<span class="y">' + esc(lifeYears(p)) + "</span>";
      else line3 = '<span class="y">' + esc(lifeYears(p)) + "</span>" + line3;
      var cls = "sb-card " + genderClass(p) + (p.l ? " living" : "") + (n.id === root && n.gen === 0 ? " focus" : "") + (n.id === state.sel ? " sel" : "");
      html += '<button type="button" class="' + cls + '" data-id="' + n.id + '" style="left:' + x + "px;top:" + y + 'px" title="' + esc(fullName(p)) + '">' +
        '<span class="n">' + esc(p.n || "?") + '</span><span class="s">' + esc(p.s) + "</span>" + line3 + "</button>";
      if (n.more) {
        var mx = n.x < 0 ? x - 11 : x + W - 11;
        more += '<button type="button" class="sb-more" data-id="' + n.id + '" style="left:' + mx + "px;top:" + (y + H / 2 - 11) + 'px" title="Weitere Generationen anzeigen">' + (n.x < 0 ? "+" : "+" + n.more) + "</button>";
      }
    });
    nodesEl.innerHTML = html + more;

    var d = "";
    links.forEach(function (l) {
      var a = l.a, b = l.b; // a links, b rechts
      var x1 = a.x + W, y1 = a.y * rowH, x2 = b.x, y2 = b.y * rowH, mx = (x1 + x2) / 2;
      d += '<path d="M' + x1 + " " + y1 + "C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2 + '"/>';
    });
    edges.innerHTML = d;
    lastBox = { x: minX - 40, y: minY - 40, w: maxX - minX + 80, h: maxY - minY + 80 };
    if (fit) fitView(true);
  }

  // ---- Pan & Zoom ----
  function applyView(anim) {
    world.classList.toggle("anim", !!anim);
    world.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.k + ")";
  }
  function fitView(anim, all) {
    if (!lastBox) return;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    if (!panel.hidden) {
      if (window.innerWidth > 720) sw -= panel.offsetWidth; else sh -= panel.offsetHeight;
    }
    var k = Math.min(1, sw / lastBox.w, sh / lastBox.h);
    // Lesbarkeit geht vor: nie kleiner als 0.8. Passt der Baum so nicht, kommt die Fokusperson in die Mitte.
    k = all ? Math.max(0.2, k) : Math.max(0.8, k);
    view.k = k;
    view.x = lastBox.w * k > sw ? sw / 2 - (W / 2) * k : (sw - lastBox.w * k) / 2 - lastBox.x * k;
    view.y = lastBox.h * k > sh ? sh / 2 : (sh - lastBox.h * k) / 2 - lastBox.y * k;
    applyView(anim);
  }
  function zoomAt(cx, cy, f) {
    var k = Math.min(2.2, Math.max(0.15, view.k * f));
    f = k / view.k;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.k = k;
    applyView(false);
  }
  var mapOn = false;
  function setView(map) {
    mapOn = !!map;
    $("sb-world").hidden = mapOn;
    $("sb-map").hidden = !mapOn;
    $("sb-bar-tree").hidden = mapOn;
    $("sb-bar-map").hidden = !mapOn;
    $("sb-v-tree").classList.toggle("on", !mapOn);
    $("sb-v-map").classList.toggle("on", mapOn);
    $("sb-fit").textContent = mapOn ? "Alle Punkte" : "Alles zeigen";
    setTop();
    if (mapOn) SBMap.show(true); else { SBMap.show(false); fitView(false); }
  }
  $("sb-v-tree").onclick = function () { setView(false); };
  $("sb-v-map").onclick = function () { setView(true); };
  var pointers = new Map(), dragMoved = false, pinch0 = 0;
  stage.addEventListener("pointerdown", function (e) {
    if (mapOn || e.target.closest(".sb-zoom")) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false;
    if (pointers.size === 2) { var a = Array.from(pointers.values()); pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  });
  stage.addEventListener("pointermove", function (e) {
    var prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) {
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!dragMoved) { dragMoved = true; stage.classList.add("drag"); try { stage.setPointerCapture(e.pointerId); } catch (_) {} hideHint(); }
      view.x += dx; view.y += dy;
      prev.x = e.clientX; prev.y = e.clientY;
      applyView(false);
    } else if (pointers.size === 2) {
      prev.x = e.clientX; prev.y = e.clientY;
      var a = Array.from(pointers.values()), dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      var r = stage.getBoundingClientRect();
      if (pinch0) zoomAt((a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top, dist / pinch0);
      pinch0 = dist; dragMoved = true;
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (!pointers.size) setTimeout(function () { stage.classList.remove("drag"); dragMoved = false; }, 0);
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("wheel", function (e) {
    if (mapOn) return;
    e.preventDefault();
    var r = stage.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    hideHint();
  }, { passive: false });
  function hideHint() {}
  function zoomBtn(f) { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, f); }
  $("sb-zin").onclick = function () { if (mapOn) SBMap.zoom(1.6); else zoomBtn(1.25); };
  $("sb-zout").onclick = function () { if (mapOn) SBMap.zoom(1 / 1.6); else zoomBtn(0.8); };
  $("sb-fit").onclick = function () { if (mapOn) SBMap.fit(); else fitView(true, true); };
  window.addEventListener("resize", function () { if (!mapOn) fitView(false); });

  // ---- Navigation ----
  function focusOn(i, push) {
    if (mapOn) setView(false);
    state.focus = i;
    state.sel = i;
    showPanel(i);
    render(true);
    if (push !== false) history.pushState(null, "", "#" + i);
    document.title = plainName(P[i]) + " – Stammbaum";
  }
  nodesEl.addEventListener("click", function (e) {
    if (dragMoved) return;
    var el = e.target.closest("[data-id]");
    if (el) focusOn(+el.dataset.id);
  });
  window.addEventListener("popstate", function () {
    var i = idFromHash();
    if (i != null) focusOn(i, false);
  });
  function idFromHash() {
    var m = location.hash.match(/^#(\d+)$/);
    return m && P[+m[1]] ? +m[1] : null;
  }

  // ---- Seitenpanel ----
  function personLi(i, extra) {
    var p = P[i];
    return '<li><button type="button" data-go="' + i + '"><span>' + esc(plainName(p)) + "</span><small>" + esc(extra || lifeYears(p)) + "</small></button></li>";
  }
  function section(title, items) { return items ? "<h3>" + title + "</h3><ul class='sb-links'>" + items + "</ul>" : ""; }
  function row(k, v) { return v ? "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>" : ""; }

  function showPanel(i) {
    var p = P[i], h = '<button class="x" type="button" data-close aria-label="Schliessen">Schliessen</button>';
    h += "<h2>" + esc(fullName(p)) + "</h2>";
    var hasDetail = p.b || p.bp || p.o || p.no || p.d;
    h += '<p class="sub">' + (p.g === "M" ? "Mann" : p.g === "F" ? "Frau" : "") + (p.l ? " · lebt" : lifeYears(p) ? " · " + esc(lifeYears(p)) : "") + "</p>";
    if (p.l && !hasDetail) {
      h += '<p class="priv">Zu dieser Person sind keine weiteren Angaben gespeichert.</p>';
    } else {
      var age = yr(p.b) && yr(p.d) ? yr(p.d) - yr(p.b) : null;
      h += "<h3>Lebensdaten</h3><dl>" + row("Geboren", fmtDate(p.b)) + row("in", p.bp) + row("Gestorben", fmtDate(p.d)) + row("in", p.dp) +
        (age != null && age >= 0 && age < 120 ? row("Alter", "ca. " + age + " Jahre") : "") + row("Beruf", p.o) + row("Konfession", { LU: "lutherisch", RK: "römisch-katholisch", RE: "reformiert", EV: "evangelisch" }[p.r] || p.r) + "</dl>";
      if (p.no) h += '<h3>Notiz</h3><div class="note">' + esc(p.no) + "</div>";
    }
    var par = parentsOf(i);
    h += section("Eltern", par.map(function (q) { return personLi(q, P[q].g === "M" ? "Vater" : "Mutter"); }).join(""));
    h += section("Partner", partnersOf(i).map(function (q) {
      var f = q.fam, d = f.m ? "∞ " + (yr(f.m) || f.m) : f.div ? "geschieden" : "";
      return personLi(q.id, d);
    }).join(""));
    var ch = childrenOf(i);
    h += section("Kinder (" + ch.length + ")", ch.map(function (q) { return personLi(q); }).join(""));
    var sib = siblingsOf(i);
    h += section("Geschwister (" + sib.length + ")", sib.map(function (q) { return personLi(q); }).join(""));
    var kin = countAnc(i);
    h += "<h3>Stammbaum</h3><p class='sub'>" + kin.n + " bekannte Vorfahren in " + kin.g + " Generation" + (kin.g === 1 ? "" : "en") + ", " + countDesc(i) + " bekannte Nachkommen.</p>";
    panel.innerHTML = h;
    panel.hidden = false;
    panel.scrollTop = 0;
  }
  function countAnc(i) {
    var seen = {}, max = 0;
    (function w(x, g) { parentsOf(x).forEach(function (q) { if (!seen[q]) { seen[q] = 1; max = Math.max(max, g + 1); w(q, g + 1); } }); })(i, 0);
    return { n: Object.keys(seen).length, g: max };
  }
  function countDesc(i) {
    var seen = {};
    (function w(x) { childrenOf(x).forEach(function (q) { if (!seen[q]) { seen[q] = 1; w(q); } }); })(i);
    return Object.keys(seen).length;
  }
  panel.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { panel.hidden = true; state.sel = null; render(true); return; }
    var g = e.target.closest("[data-go]");
    if (g) focusOn(+g.dataset.go);
    var s = e.target.closest("[data-search]");
    if (s) { qEl.value = s.dataset.search; qEl.focus(); runSearch(); }
  });

  function showOverview() {
    var living = 0, byS = {}, byP = {}, minB = 1e9, maxChildren = 0, maxChildrenId = null;
    P.forEach(function (p, i) {
      if (p.l) living++;
      if (p.s) byS[p.s] = (byS[p.s] || 0) + 1;
      if (p.bp) byP[p.bp] = (byP[p.bp] || 0) + 1;
      var b = yr(p.b); if (b && b < minB) minB = b;
      var c = childrenOf(i).length; if (c > maxChildren) { maxChildren = c; maxChildrenId = i; }
    });
    function top(o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n); }
    var gens = countAnc(ROOT).g;
    var h = '<button class="x" type="button" data-close aria-label="Schliessen">Schliessen</button><h2>Überblick</h2>';
    h += '<p class="sub">Zusammengetragen von Heinz und Erich König. Stand 2024.</p>';
    h += '<div class="sb-kpis"><div><b>' + P.length + "</b><span>Personen</span></div><div><b>" + F.length + "</b><span>Familien</span></div><div><b>" + minB + "</b><span>ältestes Geburtsjahr</span></div>" +
      "<div><b>" + gens + "</b><span>Generationen ab Start</span></div><div><b>" + (P.length - living) + "</b><span>verstorben</span></div><div><b>" + maxChildren + "</b><span>Kinder (Rekord)</span></div></div>";
    h += "<h3>Häufigste Familiennamen</h3><div class='sb-chips'>" + top(byS, 14).map(function (s) { return '<button type="button" data-search="' + esc(s) + '">' + esc(s) + " · " + byS[s] + "</button>"; }).join("") + "</div>";
    h += "<h3>Häufigste Geburtsorte</h3><div class='sb-chips'>" + top(byP, 12).map(function (s) { return '<button type="button" data-search="' + esc(s) + '">' + esc(s) + " · " + byP[s] + "</button>"; }).join("") + "</div>";
    if (maxChildrenId != null) h += section("Grösste Familie", personLi(maxChildrenId, maxChildren + " Kinder"));
    h += "<h3>Tipp</h3><p class='sub'>Klicke eine Karte an, um die Person in die Mitte zu holen. Das Zeichen am Kartenrand zeigt, dass es weitere Verwandte gibt.</p>";
    panel.innerHTML = h;
    panel.hidden = false;
    panel.scrollTop = 0;
  }

  // ---- Suche ----
  var hits = [], hitIdx = -1, index = [];
  function runSearch() {
    var q = norm(qEl.value).trim();
    if (!q) { closeResults(); return; }
    var terms = q.split(/\s+/);
    hits = [];
    for (var i = 0; i < index.length; i++) {
      var s = index[i], ok = true, score = 0;
      for (var t = 0; t < terms.length; t++) {
        var pos = s.name.indexOf(terms[t]);
        if (pos >= 0) { score += pos === 0 || s.name[pos - 1] === " " ? 3 : 1; } else if (s.extra.indexOf(terms[t]) >= 0) score += 0.5; else { ok = false; break; }
      }
      if (ok) hits.push({ i: i, score: score });
    }
    hits.sort(function (a, b) { return b.score - a.score || (yr(P[a.i].b) || 9999) - (yr(P[b.i].b) || 9999); });
    hits = hits.slice(0, 14);
    hitIdx = hits.length ? 0 : -1;
    drawResults();
  }
  function drawResults() {
    resEl.hidden = false;
    qEl.setAttribute("aria-expanded", "true");
    resEl.innerHTML = hits.length ? hits.map(function (h, n) {
      var p = P[h.i];
      return '<li role="option" data-id="' + h.i + '" class="' + (n === hitIdx ? "on" : "") + '"><span>' + esc(plainName(p)) + "</span><small>" + esc([lifeYears(p), p.bp].filter(Boolean).join(" · ")) + "</small></li>";
    }).join("") : '<li class="none">Keine Treffer</li>';
  }
  function closeResults() { resEl.hidden = true; qEl.setAttribute("aria-expanded", "false"); }
  qEl.addEventListener("input", runSearch);
  qEl.addEventListener("focus", function () { if (qEl.value) runSearch(); });
  qEl.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!hits.length) return;
      hitIdx = (hitIdx + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      drawResults();
    } else if (e.key === "Enter" && hitIdx >= 0) {
      pick(hits[hitIdx].i);
    } else if (e.key === "Escape") closeResults();
  });
  function pick(i) { closeResults(); qEl.value = ""; qEl.blur(); focusOn(i); }
  resEl.addEventListener("mousedown", function (e) {
    var li = e.target.closest("[data-id]");
    if (li) { e.preventDefault(); pick(+li.dataset.id); }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".sb-search")) closeResults(); });

  // ---- Steuerung ----
  function syncLevel() {
    $("sb-less").disabled = state.level <= 1;
    $("sb-more").disabled = state.level >= 7;
  }
  $("sb-less").onclick = function () { state.level = Math.max(1, state.level - 1); syncLevel(); render(true); };
  $("sb-more").onclick = function () { state.level = Math.min(7, state.level + 1); syncLevel(); render(true); };
  syncLevel();
  document.querySelector(".sb-bar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(function (x) { x.classList.toggle("on", x === b); });
    render(true);
  });
  $("sb-home").onclick = function () { focusOn(ROOT); };
  $("sb-info").onclick = showOverview;
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== qEl) { e.preventDefault(); qEl.focus(); }
  });

  // ---- Hilfe ----
  function helpSeen() { try { return localStorage.getItem("sb_help_seen") === "1"; } catch (_) { return false; } }
  function openHelp() { $("sb-modal").hidden = false; $("sb-modal-ok").focus(); }
  function closeHelp() { $("sb-modal").hidden = true; try { localStorage.setItem("sb_help_seen", "1"); } catch (_) {} }
  $("sb-help").onclick = openHelp;
  $("sb-modal-ok").onclick = closeHelp;
  $("sb-modal").addEventListener("click", function (e) { if (e.target === $("sb-modal")) closeHelp(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("sb-modal").hidden) closeHelp(); });
  $("sb-logout").onclick = function () {
    if (sb) sb.auth.signOut().then(function () { location.replace("/stammbaum/"); });
  };
  function setTop() {
    var h = document.querySelector(".sb-top").offsetHeight + document.querySelector(".sb-bar").offsetHeight;
    document.documentElement.style.setProperty("--top", h + "px");
  }
  window.addEventListener("resize", setTop);
  setTop();

  // ---- Start ----
  var sb = typeof getSupabase === "function" ? getSupabase() : null;
  function toGate() { location.replace("/stammbaum/"); }
  if (!sb) { toGate(); return; }
  sb.rpc("stammbaum_get").then(function (res) {
    if (res.error || !res.data || !res.data.persons) throw new Error("kein Zugriff");
    return sb.rpc("stammbaum_status").then(function (st) {
      if (st.data === "admin") $("sb-admin").hidden = false;
      return res.data;
    });
  }).then(function (d) {
    P = d.persons; F = d.families; ROOT = d.root;
    index = P.map(function (p) {
      return { name: norm(p.n + " " + p.s), extra: norm([p.b, p.d, p.bp, p.dp, p.o].filter(Boolean).join(" ")) };
    });
    SBMap.init({ persons: P, places: d.places, panel: panel, esc: esc, plainName: plainName, lifeYears: lifeYears });
    if (!SBMap.hasData()) $("sb-v-map").hidden = true;
    var start = idFromHash();
    state.focus = start != null ? start : ROOT;
    if (start != null) { state.sel = start; showPanel(start); }
    render(true);
    document.title = plainName(P[state.focus]) + " – Stammbaum";
    $("sb-loading").classList.add("off");
    if (!helpSeen()) openHelp();
  }).catch(toGate);
})();
