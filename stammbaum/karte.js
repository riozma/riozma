(function () {
  "use strict";

  // Weltkarte (Web-Mercator) mit Geburts-, Todes- und Wohnorten. Punkte werden je Zoomstufe zu Gruppen zusammengefasst.
  var W0 = 1000;                       // Weltbreite in Kartenkoordinaten
  var COLORS = { b: "#2f8f4a", d: "#c4372f", r: "#2f6fb0" };
  var LABELS = { b: "Geburtsort", d: "Todesort", r: "Wohnort" };
  var ROLE = { b: "Geboren", d: "Gestorben", r: "Wohnt" };
  var MAX_S = 2400, MIN_S = 0.5;

  var ctx, stage, svg, gWorld, gMarks, land, locs = [], clusters = [], layers = { b: true, d: true, r: false };
  var view = { s: 1, tx: 0, ty: 0 };
  var worldLoaded = false, worldLoading = false, ready = false, active = false, raf = 0, unlocated = 0;

  function proj(lon, lat) {
    lat = Math.max(-80, Math.min(80, lat));
    var x = (lon + 180) / 360 * W0;
    var y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * W0;
    return [x, y];
  }
  function cleanName(n) {
    return n.replace(/\/(D|)$/, "").replace(/\/.*$/, "").replace(/\s*\((Ru|\?)\)|\?/g, "").replace(/\s+(USA|Latvia|Can\.)$/, "").replace(/,.*$/, "").trim();
  }

  // ---- Orte aus den Personen aufbauen ----
  function buildLocations(persons, places) {
    var byKey = {};
    var missing = {};
    persons.forEach(function (p, i) {
      ["b", "d", "r"].forEach(function (layer) {
        var name = p[layer + "p"];
        if (!name) return;
        var g = places[name];
        if (!g) { missing[name] = 1; return; }
        var key = g[0] + "," + g[1] + "," + (g[2] ? 1 : 0);
        var L = byKey[key];
        if (!L) {
          var pr = proj(g[1], g[0]);
          L = byKey[key] = { lat: g[0], lon: g[1], approx: !!g[2], x: pr[0], y: pr[1], names: {}, ppl: { b: [], d: [], r: [] } };
        }
        var cn = cleanName(name);
        L.names[cn] = (L.names[cn] || 0) + 1;
        L.ppl[layer].push(i);
      });
    });
    locs = Object.keys(byKey).map(function (k) {
      var L = byKey[k];
      var best = Object.keys(L.names).sort(function (a, b) { return L.names[b] - L.names[a]; })[0];
      L.name = best + (L.approx ? " (ungefähr)" : "");
      return L;
    });
    unlocated = Object.keys(missing).length;
  }

  // ---- Weltkarte laden (TopoJSON) ----
  function decodeWorld(topo) {
    var sc = topo.transform.scale, tr = topo.transform.translate;
    var arcs = topo.arcs.map(function (arc) {
      var x = 0, y = 0;
      return arc.map(function (pt) { x += pt[0]; y += pt[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; });
    });
    function ring(idxs) {
      var pts = [];
      idxs.forEach(function (i) {
        var a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
        for (var k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
      });
      return pts;
    }
    var d = [];
    function poly(rings) {
      rings.forEach(function (r) {
        var pts = ring(r);
        d.push("M" + pts.map(function (p) {
          var q = proj(p[0], p[1]);
          return q[0].toFixed(2) + " " + q[1].toFixed(2);
        }).join("L") + "Z");
      });
    }
    topo.objects.countries.geometries.forEach(function (g) {
      if (g.type === "Polygon") poly(g.arcs);
      else if (g.type === "MultiPolygon") g.arcs.forEach(poly);
    });
    return d.join("");
  }
  function loadWorld() {
    if (worldLoaded || worldLoading) return;
    worldLoading = true;
    fetch("/stammbaum/world-50m.json").then(function (r) { return r.json(); }).then(function (t) {
      land.setAttribute("d", decodeWorld(t));
      worldLoaded = true;
    }).catch(function () { note("Die Weltkarte konnte nicht geladen werden. Die Punkte sind trotzdem sichtbar."); });
  }

  // ---- Ansicht ----
  function size() { return { w: stage.clientWidth, h: stage.clientHeight }; }
  function applyView() {
    gWorld.setAttribute("transform", "translate(" + view.tx + " " + view.ty + ") scale(" + view.s + ")");
    schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; renderMarks(); }); }
  function fitBox(lon0, lat0, lon1, lat1) {
    var a = proj(lon0, lat1), b = proj(lon1, lat0), sz = size();
    var dx = b[0] - a[0], dy = b[1] - a[1];
    view.s = Math.max(MIN_S, Math.min(MAX_S, Math.min(sz.w / dx, sz.h / dy) * 0.92));
    view.tx = sz.w / 2 - (a[0] + dx / 2) * view.s;
    view.ty = sz.h / 2 - (a[1] + dy / 2) * view.s;
    applyView();
  }
  function showEurope() { fitBox(-3, 43, 32, 61); }
  function showWorld() { fitBox(-130, -38, 150, 62); }
  function showAll() {
    var pts = locs.filter(function (L) { return count(L) > 0; });
    if (!pts.length) return showEurope();
    var lon0 = 1e9, lon1 = -1e9, lat0 = 1e9, lat1 = -1e9;
    pts.forEach(function (L) { lon0 = Math.min(lon0, L.lon); lon1 = Math.max(lon1, L.lon); lat0 = Math.min(lat0, L.lat); lat1 = Math.max(lat1, L.lat); });
    fitBox(lon0 - 3, lat0 - 3, lon1 + 3, lat1 + 3);
  }
  function zoomAt(cx, cy, f) {
    var s = Math.max(MIN_S, Math.min(MAX_S, view.s * f));
    f = s / view.s;
    view.tx = cx - (cx - view.tx) * f;
    view.ty = cy - (cy - view.ty) * f;
    view.s = s;
    applyView();
  }

  // ---- Gruppieren und zeichnen ----
  function count(L) {
    var n = 0;
    ["b", "d", "r"].forEach(function (k) { if (layers[k]) n += L.ppl[k].length; });
    return n;
  }
  function radius(n) { return Math.min(34, 8 + 4.2 * Math.sqrt(n - 1)); }

  function cluster() {
    var items = locs.map(function (L) { return { L: L, n: count(L) }; }).filter(function (o) { return o.n > 0; });
    items.sort(function (a, b) { return b.n - a.n; });
    var out = [];
    items.forEach(function (o) {
      var sx = o.L.x * view.s + view.tx, sy = o.L.y * view.s + view.ty;
      var hit = null, dmin = 1e9;
      for (var i = 0; i < out.length; i++) {
        var c = out[i], d = Math.hypot(c.sx - sx, c.sy - sy);
        if (d < 0.7 * (radius(c.n) + radius(o.n)) && d < dmin) { dmin = d; hit = c; }
      }
      if (hit) {
        var tot = hit.n + o.n;
        hit.sx = (hit.sx * hit.n + sx * o.n) / tot;
        hit.sy = (hit.sy * hit.n + sy * o.n) / tot;
        hit.n = tot;
        hit.locs.push(o.L);
      } else {
        out.push({ sx: sx, sy: sy, n: o.n, locs: [o.L] });
      }
    });
    return out;
  }

  function slice(cx, cy, r, a0, a1, color) {
    var x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0), x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
    return '<path d="M' + cx + " " + cy + "L" + x0.toFixed(1) + " " + y0.toFixed(1) + "A" + r + " " + r + " 0 " + (a1 - a0 > Math.PI ? 1 : 0) + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + 'Z" fill="' + color + '"/>';
  }

  function renderMarks() {
    if (!active) return;
    clusters = cluster();
    var sz = size(), h = "";
    clusters.forEach(function (c, i) {
      if (c.sx < -50 || c.sy < -50 || c.sx > sz.w + 50 || c.sy > sz.h + 50) return;
      var r = radius(c.n), cx = c.sx.toFixed(1), cy = c.sy.toFixed(1);
      var parts = { b: 0, d: 0, r: 0 };
      c.locs.forEach(function (L) { ["b", "d", "r"].forEach(function (k) { if (layers[k]) parts[k] += L.ppl[k].length; }); });
      var kinds = ["b", "d", "r"].filter(function (k) { return parts[k] > 0; });
      var title = c.locs.slice(0, 6).map(function (L) { return L.name; }).join(", ") + (c.locs.length > 6 ? " …" : "") + ": " + c.n + (c.n === 1 ? " Eintrag" : " Einträge");
      var approx = c.locs.length === 1 && c.locs[0].approx;
      h += '<g class="m" data-c="' + i + '" tabindex="0" role="button" aria-label="' + title.replace(/"/g, "") + '"><title>' + title.replace(/</g, "&lt;") + "</title>";
      if (kinds.length === 1) {
        h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="' + COLORS[kinds[0]] + '"/>';
      } else {
        var a = 0;
        kinds.forEach(function (k) {
          var da = parts[k] / c.n * Math.PI * 2;
          h += slice(+cx, +cy, +r.toFixed(1), a, a + da, COLORS[k]);
          a += da;
        });
      }
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="none" stroke="#fff" stroke-width="2"' + (approx ? ' stroke-dasharray="3 2"' : "") + "/>";
      if (c.n > 1) h += '<text x="' + cx + '" y="' + (c.sy + 5).toFixed(1) + '" text-anchor="middle" class="mt" style="font-size:' + (r > 14 ? 15 : 12) + 'px">' + c.n + "</text>";
      if (c.locs.length === 1 && (r > 12 || view.s > 25)) {
        h += '<text x="' + cx + '" y="' + (c.sy + r + 15).toFixed(1) + '" text-anchor="middle" class="ml">' + c.locs[0].name.replace(/</g, "&lt;") + "</text>";
      }
      h += "</g>";
    });
    gMarks.innerHTML = h;
  }

  // ---- Auswahl ----
  function personItem(i, role) {
    var p = ctx.persons[i];
    return '<li><button type="button" data-go="' + i + '"><span>' + ctx.esc(ctx.plainName(p)) + "</span><small>" + ctx.esc(ctx.lifeYears(p)) + "</small></button></li>";
  }
  function openCluster(c) {
    var h = '<button class="x" type="button" data-close aria-label="Schliessen">Schliessen</button>';
    var names = c.locs.map(function (L) { return L.name; });
    h += "<h2>" + ctx.esc(c.locs.length === 1 ? names[0] : c.locs.length + " Orte in der Nähe") + "</h2>";
    h += '<p class="sub">' + c.n + (c.n === 1 ? " Eintrag" : " Einträge") + ". Klicke eine Person an, um sie im Stammbaum zu sehen.</p>";
    var sorted = c.locs.slice().sort(function (a, b) { return count(b) - count(a); });
    sorted.forEach(function (L) {
      if (c.locs.length > 1) h += "<h3>" + ctx.esc(L.name) + "</h3>";
      ["b", "d", "r"].forEach(function (k) {
        if (!layers[k] || !L.ppl[k].length) return;
        h += "<h3>" + ROLE[k] + " (" + L.ppl[k].length + ")</h3><ul class='sb-links'>" + L.ppl[k].map(function (i) { return personItem(i); }).join("") + "</ul>";
      });
      if (L.approx) h += "<p class='sub'>Dieser Ort ist nur ungefähr bekannt (in den Daten steht nur das Land oder die Gegend).</p>";
    });
    ctx.panel.innerHTML = h;
    ctx.panel.hidden = false;
    ctx.panel.scrollTop = 0;
  }
  function clickMark(g) {
    var c = clusters[+g.dataset.c];
    if (!c) return;
    if (c.locs.length > 1 && view.s < MAX_S / 2) {
      // mehrere Orte: hineinzoomen, damit sie sich trennen
      var f = 2.2;
      zoomAt(c.sx, c.sy, f);
      var sz = size();
      view.tx += sz.w / 2 - c.sx; view.ty += sz.h / 2 - c.sy;
      applyView();
      return;
    }
    openCluster(c);
  }

  // ---- Ebenen und Hinweise ----
  function note(t) { var n = document.getElementById("sbm-note"); if (n) n.textContent = t; }
  function refreshLayerButtons() {
    var tot = { b: 0, d: 0, r: 0 };
    locs.forEach(function (L) { ["b", "d", "r"].forEach(function (k) { tot[k] += L.ppl[k].length; }); });
    ["b", "d", "r"].forEach(function (k) {
      var btn = document.getElementById("sbm-" + k);
      btn.setAttribute("aria-pressed", layers[k]);
      btn.querySelector(".n").textContent = tot[k];
    });
    var all = layers.b || layers.d || layers.r;
    note(all
      ? "Ein grösserer Punkt bedeutet mehrere Personen am selben Ort. Beim Herauszoomen rücken nahe Punkte zusammen." + (unlocated ? " " + unlocated + " Ortsangaben konnten nicht auf der Karte eingetragen werden." : "")
      : "Wähle oben mindestens eine Art von Ort aus.");
  }

  // ---- Start und Ereignisse ----
  function bind() {
    ["b", "d", "r"].forEach(function (k) {
      document.getElementById("sbm-" + k).onclick = function () { layers[k] = !layers[k]; refreshLayerButtons(); renderMarks(); };
    });
    document.getElementById("sbm-eu").onclick = showEurope;
    document.getElementById("sbm-world").onclick = showWorld;
    document.getElementById("sbm-all").onclick = showAll;

    var pointers = new Map(), moved = false, pinch0 = 0;
    svg.addEventListener("pointerdown", function (e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pointers.size === 2) { var a = Array.from(pointers.values()); pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    });
    svg.addEventListener("pointermove", function (e) {
      var prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (pointers.size === 1) {
        var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) { moved = true; try { svg.setPointerCapture(e.pointerId); } catch (_) {} stage.classList.add("drag"); }
        view.tx += dx; view.ty += dy; prev.x = e.clientX; prev.y = e.clientY;
        applyView();
      } else if (pointers.size === 2) {
        prev.x = e.clientX; prev.y = e.clientY;
        var a = Array.from(pointers.values()), dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), r = stage.getBoundingClientRect();
        if (pinch0) zoomAt((a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top, dist / pinch0);
        pinch0 = dist; moved = true;
      }
    });
    function up(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = 0;
      if (!pointers.size) setTimeout(function () { stage.classList.remove("drag"); moved = false; }, 0);
    }
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0017));
    }, { passive: false });
    svg.addEventListener("click", function (e) {
      if (moved) return;
      var g = e.target.closest("g.m");
      if (g) clickMark(g);
    });
    svg.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var g = e.target.closest && e.target.closest("g.m");
      if (g) { e.preventDefault(); clickMark(g); }
    });
    window.addEventListener("resize", function () { if (active) schedule(); });
  }

  window.SBMap = {
    init: function (c) {
      ctx = c;
      stage = document.getElementById("sb-stage");
      svg = document.getElementById("sbm-svg");
      gWorld = document.getElementById("sbm-gworld");
      gMarks = document.getElementById("sbm-marks");
      land = document.getElementById("sbm-land");
      buildLocations(c.persons, c.places || {});
      bind();
      refreshLayerButtons();
      ready = true;
    },
    show: function (on) {
      active = on && ready;
      if (!active) return;
      loadWorld();
      if (!this._fitted) { this._fitted = true; showEurope(); } else schedule();
    },
    zoom: function (f) { var sz = size(); zoomAt(sz.w / 2, sz.h / 2, f); },
    fit: showAll,
    hasData: function () { return locs.length > 0; },
  };
})();
