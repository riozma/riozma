// Stammbaum: Bearbeiten (Rolle «editor»/«admin»), Fotos, Kontaktdaten und Export als Kontakt (vCard).
// Wird von stammbaum.js mit SBEdit.init(...) gestartet.
(function () {
  "use strict";

  var BUCKET = "stammbaum-photos";
  var CONTACT_KEYS = ["tel", "mob", "mail", "str", "ort", "land", "web", "notiz"];
  var FIELD_KEYS = ["n", "s", "t", "g", "b", "bp", "d", "dp", "rp", "o", "r", "no"];
  var ctx = null; // { P, sb, role, contacts, esc, plainName, fullName, onChange(i) }
  var urls = {}; // Speicherpfad -> signierte URL
  var $ = function (id) { return document.getElementById(id); };

  function canEdit() { return !!ctx && (ctx.role === "admin" || ctx.role === "editor"); }
  function esc(s) { return ctx.esc(s); }

  // Überlagerung anwenden: leerer Text entfernt das Feld.
  function applyEdit(p, e) {
    Object.keys(e || {}).forEach(function (k) {
      var v = e[k];
      if (v === "" || v == null) delete p[k];
      else p[k] = k === "l" ? 1 : v;
    });
    if (p.d) delete p.l;
  }

  // ---- Datum: Formular (TT.MM.JJJJ) <-> gespeichert (JJJJ-MM-TT) ----
  function toForm(d) {
    if (!d) return "";
    var m = d.match(/^(\d{4})-(\d\d)(?:-(\d\d))?$/);
    if (!m) return d;
    return (m[3] ? m[3] + "." : "") + m[2] + "." + m[1];
  }
  function fromForm(s) {
    s = String(s || "").trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    m = s.match(/^(\d{1,2})\.(\d{4})$/);
    if (m) return m[2] + "-" + ("0" + m[1]).slice(-2);
    return s;
  }

  // ---- Fotos ----
  function loadUrls(paths) {
    paths = paths.filter(function (p, n) { return p && !urls[p] && paths.indexOf(p) === n; });
    if (!paths.length) return Promise.resolve(false);
    return ctx.sb.storage.from(BUCKET).createSignedUrls(paths, 12 * 3600).then(function (r) {
      (r.data || []).forEach(function (x) { if (x && x.signedUrl && x.path) urls[x.path] = x.signedUrl; });
      return true;
    }).catch(function () { return false; });
  }
  function photoUrl(i) { var p = ctx && ctx.P[i]; return p && p.ph ? urls[p.ph] || null : null; }

  function loadImage(src) {
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { fail(new Error("Das Bild konnte nicht gelesen werden.")); };
      img.src = src;
    });
  }
  // Verkleinert ein Bild (Datei oder Blob) auf max. Kantenlänge und gibt ein JPEG zurück.
  function shrink(blob, max, quality) {
    var u = URL.createObjectURL(blob);
    return loadImage(u).then(function (img) {
      var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      var g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(ok, "image/jpeg", quality || 0.85); });
    }).finally(function () { URL.revokeObjectURL(u); });
  }
  function blobToBase64(blob) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(",")[1] || ""); };
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
  }
  // Kleines Foto für die Kontaktkarte (fetch statt <img>, damit das Canvas nicht gesperrt wird).
  function photoForVcard(i) {
    var u = photoUrl(i);
    if (!u) return Promise.resolve(null);
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); })
      .then(function (b) { return shrink(b, 320, 0.8); })
      .then(blobToBase64)
      .catch(function () { return null; });
  }

  // ---- Seitenpanel ----
  function panelTop(i) {
    var u = photoUrl(i);
    return u ? '<img class="sb-photo" src="' + esc(u) + '" alt="Foto von ' + esc(ctx.plainName(ctx.P[i])) + '">' : "";
  }
  function panelActions(i) {
    var h = '<div class="sb-actions">';
    if (canEdit()) h += '<button type="button" class="sb-btn" data-edit="' + i + '">Bearbeiten</button>';
    h += '<button type="button" class="sb-btn" data-vcf="' + i + '" title="Als Kontakt speichern, z. B. im Google-Konto oder auf dem Handy">Als Kontakt speichern</button>';
    return h + "</div>";
  }
  function panelContact(i) {
    if (!canEdit()) return "";
    var c = (ctx.contacts || {})[i];
    if (!c) return "";
    function rowLink(k, v, href) {
      return v ? "<dt>" + k + "</dt><dd>" + (href ? '<a href="' + esc(href) + '"' + (/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : "") + ">" + esc(v) + "</a>" : esc(v)) + "</dd>" : "";
    }
    var web = c.web ? (/^https?:\/\//i.test(c.web) ? c.web : "https://" + c.web) : "";
    var adr = [c.str, c.ort, c.land].filter(Boolean).join(", ");
    var h = "<h3>Kontakt <small class='sb-only'>nur für Bearbeiter sichtbar</small></h3><dl>" +
      rowLink("Telefon", c.tel, c.tel ? "tel:" + c.tel.replace(/[^\d+]/g, "") : "") +
      rowLink("Mobile", c.mob, c.mob ? "tel:" + c.mob.replace(/[^\d+]/g, "") : "") +
      rowLink("E-Mail", c.mail, c.mail ? "mailto:" + c.mail : "") +
      rowLink("Adresse", adr, "") +
      rowLink("Webseite", c.web, web) + "</dl>";
    if (c.notiz) h += '<div class="note">' + esc(c.notiz) + "</div>";
    return h;
  }

  // ---- vCard ----
  function vEsc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1"); }
  function fold(line) {
    // Zeilen nach max. 75 Bytes umbrechen (RFC 6350); Zeichenweise, damit Umlaute nicht zerschnitten werden.
    var out = [], cur = "", bytes = 0;
    for (var ch of line) {
      var cp = ch.codePointAt(0), b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  }
  function vcard(i, photo) {
    var p = ctx.P[i], c = canEdit() ? (ctx.contacts || {})[i] || {} : {};
    var L = ["BEGIN:VCARD", "VERSION:3.0"];
    L.push("N:" + [vEsc(p.s), vEsc(p.n), "", vEsc(p.t), ""].join(";"));
    L.push("FN:" + vEsc(ctx.fullName(p)));
    if (p.b && /^\d{4}-\d\d-\d\d$/.test(p.b)) L.push("BDAY:" + p.b);
    if (c.tel) L.push("TEL;TYPE=HOME,VOICE:" + vEsc(c.tel));
    if (c.mob) L.push("TEL;TYPE=CELL:" + vEsc(c.mob));
    if (c.mail) L.push("EMAIL;TYPE=INTERNET:" + vEsc(c.mail));
    if (c.str || c.ort || c.land) {
      var m = String(c.ort || "").match(/^(\S*\d\S*)\s+(.+)$/); // "8000 Zürich" -> PLZ + Ort
      L.push("ADR;TYPE=HOME:;;" + [vEsc(c.str), vEsc(m ? m[2] : c.ort), "", vEsc(m ? m[1] : ""), vEsc(c.land)].join(";"));
    }
    if (c.web) L.push("URL:" + vEsc(c.web));
    if (p.o) L.push("TITLE:" + vEsc(p.o));
    var note = [];
    if (p.bp) note.push("Geboren in " + p.bp);
    if (p.d) note.push("Gestorben " + p.d + (p.dp ? " in " + p.dp : ""));
    if (c.notiz) note.push(c.notiz);
    note.push("Aus dem Stammbaum der Familie König");
    L.push("NOTE:" + vEsc(note.join("\n")));
    L.push("CATEGORIES:Familie König");
    if (photo) L.push("PHOTO;ENCODING=b;TYPE=JPEG:" + photo);
    L.push("END:VCARD");
    return L.map(fold).join("\r\n") + "\r\n";
  }
  function download(name, text) {
    var blob = new Blob([text], { type: "text/vcard;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[\\/:*?"<>|]+/g, "").trim() + ".vcf";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportOne(i, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Wird erstellt …"; }
    photoForVcard(i).then(function (ph) {
      download(ctx.plainName(ctx.P[i]), vcard(i, ph));
      if (btn) { btn.disabled = false; btn.textContent = "Als Kontakt speichern"; }
      openVcfHelp(false);
    });
  }

  // Sammel-Export: alle mit Kontaktdaten, optional auch Lebende mit vollständigem Geburtsdatum.
  function exportCandidates(withBirthdays) {
    var r = [];
    ctx.P.forEach(function (p, i) {
      var hasC = !!(ctx.contacts || {})[i];
      var bday = p.l && p.b && /^\d{4}-\d\d-\d\d$/.test(p.b);
      if (hasC || (withBirthdays && bday)) r.push(i);
    });
    return r;
  }
  function updateVcfCount() {
    var n = exportCandidates($("sbv-bday").checked).length;
    $("sbv-count").textContent = n === 1 ? "1 Person" : n + " Personen";
    $("sbv-go").disabled = !n;
  }
  function openVcfHelp(bulk) {
    $("sbv-bulk").hidden = !bulk;
    $("sbv-title").textContent = bulk ? "Kontakte exportieren" : "Kontakt gespeichert";
    $("sbv-lead").textContent = bulk
      ? "Erstellt eine Kontaktdatei (.vcf), die du in dein Google-Konto, auf dem iPhone oder in Outlook übernehmen kannst. Geburtstage erscheinen danach automatisch im Kalender."
      : "Die Kontaktdatei (.vcf) wurde heruntergeladen. Auf dem Handy kannst du sie direkt öffnen und den Kontakt hinzufügen.";
    if (bulk) updateVcfCount();
    $("sb-vcf").hidden = false;
  }
  function exportAll() {
    var btn = $("sbv-go"), list = exportCandidates($("sbv-bday").checked), withPh = $("sbv-ph").checked;
    btn.disabled = true;
    var out = [], n = 0;
    (function next() {
      if (n >= list.length) {
        download("Familie König Kontakte", out.join(""));
        btn.textContent = "Datei herunterladen";
        btn.disabled = false;
        return;
      }
      btn.textContent = "Wird erstellt … " + (n + 1) + "/" + list.length;
      var i = list[n++];
      (withPh ? photoForVcard(i) : Promise.resolve(null)).then(function (ph) { out.push(vcard(i, ph)); next(); });
    })();
  }

  // ---- Bearbeiten ----
  var editIdx = null, newPhoto = null, removePhoto = false, previewUrl = null;
  function form() { return $("sbe-form"); }
  function setMsg(t, ok) { var m = $("sbe-msg"); m.textContent = t || ""; m.classList.toggle("ok", !!ok); }
  function drawPreview() {
    var box = $("sbe-ph"), u = newPhoto ? previewUrl : removePhoto ? null : photoUrl(editIdx);
    box.innerHTML = u ? '<img src="' + esc(u) + '" alt="">' : "<span>Kein Foto</span>";
    $("sbe-ph-rm").hidden = !u;
  }
  function openEdit(i) {
    if (!canEdit()) return;
    var p = ctx.P[i], f = form(), c = (ctx.contacts || {})[i] || {};
    editIdx = i; newPhoto = null; removePhoto = false;
    $("sbe-title").textContent = ctx.plainName(p) + " bearbeiten";
    FIELD_KEYS.forEach(function (k) {
      var el = f.elements[k];
      if (el) el.value = k === "b" || k === "d" ? toForm(p[k]) : p[k] || "";
    });
    f.elements.l.checked = !!p.l;
    CONTACT_KEYS.forEach(function (k) { f.elements["c_" + k].value = c[k] || ""; });
    $("sbe-file").value = "";
    setMsg("");
    drawPreview();
    $("sb-edit").hidden = false;
    f.elements.n.focus();
  }
  function closeEdit() {
    $("sb-edit").hidden = true;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    editIdx = null;
  }

  function friendly(e) {
    var m = String((e && e.message) || e || "");
    if (/Berechtigung|Kein Zugriff|42501|row-level/i.test(m)) return "Du hast keine Berechtigung zum Bearbeiten. Bitte melde dich bei Manuel.";
    if (/network|fetch/i.test(m)) return "Keine Verbindung zum Internet. Bitte versuche es nochmals.";
    return "Das hat leider nicht geklappt: " + m;
  }

  async function save(e) {
    e.preventDefault();
    var i = editIdx, p = ctx.P[i], f = form(), btn = $("sbe-save");
    var fields = {};
    FIELD_KEYS.forEach(function (k) {
      var el = f.elements[k];
      if (!el) return;
      var v = el.value.trim();
      if (k === "b" || k === "d") v = fromForm(v);
      if (v !== (p[k] || "")) fields[k] = v;
    });
    var living = f.elements.l.checked && !(fields.d !== undefined ? fields.d : p.d);
    if (living !== !!p.l) fields.l = living ? "1" : "";
    if (fields.n !== undefined && !fields.n && !(fields.s !== undefined ? fields.s : p.s)) return setMsg("Bitte mindestens Vor- oder Nachnamen angeben.");
    var contact = {}, oldC = (ctx.contacts || {})[i] || {}, cChanged = false;
    CONTACT_KEYS.forEach(function (k) {
      contact[k] = f.elements["c_" + k].value.trim();
      if (contact[k] !== (oldC[k] || "")) cChanged = true;
    });
    if (contact.mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.mail)) return setMsg("Die E-Mail-Adresse sieht nicht richtig aus.");

    btn.disabled = true;
    setMsg("Wird gespeichert …", true);
    try {
      if (Object.keys(fields).length || cChanged) {
        var r = await ctx.sb.rpc("stammbaum_save_person", { p_idx: i, p_fields: fields, p_contact: cChanged ? contact : null });
        if (r.error) throw r.error;
        applyEdit(p, fields);
        if (cChanged) {
          if (r.data && r.data.contact) ctx.contacts[i] = r.data.contact; else delete ctx.contacts[i];
        }
      }
      var oldPath = p.ph;
      if (newPhoto) {
        var jpg = await shrink(newPhoto, 1200, 0.85);
        var path = "p/" + i + "-" + Date.now().toString(36) + ".jpg";
        var up = await ctx.sb.storage.from(BUCKET).upload(path, jpg, { contentType: "image/jpeg", upsert: false });
        if (up.error) throw up.error;
        var ph = await ctx.sb.rpc("stammbaum_set_photo", { p_idx: i, p_path: path });
        if (ph.error) throw ph.error;
        p.ph = path;
        await loadUrls([path]);
      } else if (removePhoto && oldPath) {
        var rm = await ctx.sb.rpc("stammbaum_set_photo", { p_idx: i, p_path: "" });
        if (rm.error) throw rm.error;
        delete p.ph;
      }
      if (oldPath && oldPath !== p.ph) ctx.sb.storage.from(BUCKET).remove([oldPath]).catch(function () {});
      closeEdit();
      ctx.onChange(i);
    } catch (err) {
      setMsg(friendly(err));
    } finally {
      btn.disabled = false;
    }
  }

  function bind() {
    form().addEventListener("submit", save);
    $("sbe-cancel").onclick = closeEdit;
    $("sb-edit").addEventListener("click", function (e) { if (e.target === $("sb-edit")) closeEdit(); });
    $("sbe-file").addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { setMsg("Bitte ein Bild auswählen (JPG, PNG oder WebP)."); return; }
      if (file.size > 25 * 1024 * 1024) { setMsg("Das Bild ist zu gross (max. 25 MB)."); return; }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      newPhoto = file; removePhoto = false; previewUrl = URL.createObjectURL(file);
      setMsg("");
      drawPreview();
    });
    $("sbe-ph-rm").onclick = function () {
      newPhoto = null; removePhoto = true; $("sbe-file").value = "";
      drawPreview();
    };
    $("sbv-close").onclick = function () { $("sb-vcf").hidden = true; };
    $("sb-vcf").addEventListener("click", function (e) { if (e.target === $("sb-vcf")) $("sb-vcf").hidden = true; });
    $("sbv-bday").addEventListener("change", updateVcfCount);
    $("sbv-go").onclick = exportAll;
    $("sb-contacts").onclick = function () { openVcfHelp(true); };
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("sb-edit").hidden) closeEdit();
      if (!$("sb-vcf").hidden) $("sb-vcf").hidden = true;
    });
    ctx.panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-edit]");
      if (b) { openEdit(+b.dataset.edit); return; }
      b = e.target.closest("[data-vcf]");
      if (b) exportOne(+b.dataset.vcf, b);
    });
  }

  window.SBEdit = {
    // Überlagerungen anwenden, Fotos laden, Bedienelemente je nach Rolle einblenden.
    init: function (o) {
      ctx = o;
      ctx.contacts = ctx.contacts || {};
      Object.keys(o.edits || {}).forEach(function (k) { if (ctx.P[+k]) applyEdit(ctx.P[+k], o.edits[k]); });
      $("sb-contacts").hidden = !canEdit();
      document.querySelectorAll(".sb-editor-only").forEach(function (el) { el.hidden = !canEdit(); });
      bind();
      var paths = ctx.P.map(function (p) { return p.ph; }).filter(Boolean);
      return loadUrls(paths);
    },
    canEdit: canEdit,
    photoUrl: photoUrl,
    panelTop: panelTop,
    panelActions: panelActions,
    panelContact: panelContact,
  };
})();
