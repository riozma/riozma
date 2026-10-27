// FPL Weekly: gemeinsamer Renderer für Ausgabe, Übersicht, Lernpfad und Glossar.
// Seitenart steht in <body data-fplw="issue|overview|concepts|glossary">, bei Ausgaben zusätzlich data-week="YYYY-WW".
// Daten: /fpl/weekly/issues/<woche>/issue.json + focus.html (+ images.json), /fpl/weekly/issues/index.json, /fpl/weekly/curriculum.json.
// Interaktion (Reaktionen, Kommentare, Umfrage, Moderation) läuft über die RPCs fplw_* in Supabase.
(function () {
  const BASE = "/fpl/weekly";
  const SITE = "https://riozma.ch";
  const CATS = {
    digital: "AI & Digitalization",
    tools: "AI Tools & Platforms",
    robotics: "Robotics & Automation",
    circular: "Circular & Low-Carbon",
    swiss: "Swiss & ETH",
    market: "Funding & Market",
  };
  const EMOJIS = ["👍", "💡", "🤔", "🔥"];
  const S = { user: null, isAdmin: false, summary: null, comments: [], week: null, panels: {}, open: new Set(), openItems: new Set(), stats: {} };

  /* ---------- Helfer ---------- */

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function token() {
    try {
      let t = localStorage.getItem("fpl_token");
      if (!t) {
        t = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()) + "-" + Math.random().toString(36).slice(2);
        localStorage.setItem("fpl_token", t);
      }
      return t;
    } catch (e) {
      if (!S.tmpToken) S.tmpToken = "session-" + Math.random().toString(36).slice(2) + Date.now();
      return S.tmpToken;
    }
  }

  function readSet(key) {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch (e) {
      return new Set();
    }
  }

  function writeSet(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch (e) {
      /* ignorieren */
    }
  }

  function fmtDate(iso) {
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (s < 60) return "just now";
    if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
    if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
    if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
    return fmtDate(iso);
  }

  function weekNo(week) {
    return Number(week.split("-")[1]);
  }

  async function getJson(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  function rpc(name, args) {
    const c = typeof getSupabase === "function" ? getSupabase() : null;
    if (!c) return Promise.resolve({ error: new Error("no backend") });
    return c.rpc(name, args);
  }

  function errText(error, fallback) {
    return error && error.message && error.message.includes("rate limit") ? "Slow down a little, you did many things in a short time." : fallback;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const t = el("textarea");
      t.value = text;
      document.body.append(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { /* ignorieren */ }
      t.remove();
      return ok;
    }
  }

  /* ---------- Dialog und Login ---------- */

  function dialog(title, build, onSubmit, submitLabel) {
    let dlg = document.getElementById("fplw-dlg");
    if (!dlg) {
      dlg = el("dialog");
      dlg.id = "fplw-dlg";
      dlg.append(el("form"));
      document.body.append(dlg);
    }
    const form = dlg.firstChild;
    form.replaceChildren(el("h3", "", title));
    form.method = "dialog";
    const ctx = build ? build(form) : {};
    const msg = el("p", "fplw-dlg-msg");
    msg.hidden = true;
    const row = el("div", "fplw-dlg-row");
    const cancel = el("button", "ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dlg.close());
    const ok = el("button", "", submitLabel || "OK");
    ok.type = "submit";
    row.append(cancel, ok);
    form.append(msg, row);
    form.onsubmit = async (e) => {
      e.preventDefault();
      ok.disabled = true;
      const err = await onSubmit(ctx);
      ok.disabled = false;
      if (err) {
        msg.textContent = err;
        msg.hidden = false;
      } else dlg.close();
    };
    dlg.showModal();
    return ctx;
  }

  function loginDialog() {
    const client = getSupabase();
    if (!client) return;
    dialog("Log in", (form) => {
      form.append(el("p", "fplw-dlg-note", "Logged-in comments can only be edited by you."));
      const g = el("button", "google", "Continue with Google");
      g.type = "button";
      g.addEventListener("click", async () => {
        storeAuthReturnTo();
        const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: oauthReturnUrl(), skipBrowserRedirect: true } });
        if (error) {
          const m = form.querySelector(".fplw-dlg-msg");
          m.textContent = error.message;
          m.hidden = false;
        } else if (data && data.url) {
          persistPkceVerifierToCookie();
          window.location.assign(data.url);
        }
      });
      const email = el("input");
      email.type = "email";
      email.placeholder = "Email";
      email.autocomplete = "email";
      email.required = true;
      const pw = el("input");
      pw.type = "password";
      pw.placeholder = "Password (min. 6 characters)";
      pw.autocomplete = "current-password";
      pw.minLength = 6;
      pw.required = true;
      const up = el("button", "ghost", "Sign up instead");
      up.type = "button";
      up.addEventListener("click", async () => {
        const m = form.querySelector(".fplw-dlg-msg");
        if (!email.value || pw.value.length < 6) {
          m.textContent = "Enter your email and a password with at least 6 characters.";
          m.hidden = false;
          return;
        }
        const { error } = await client.auth.signUp({ email: email.value.trim(), password: pw.value, options: { emailRedirectTo: authRedirectUrl() } });
        m.textContent = error ? error.message : "Account created. Please confirm your email if asked, then log in.";
        m.hidden = false;
      });
      form.append(g, el("p", "fplw-dlg-note", "or with email"), email, pw, up);
      return { email, pw };
    }, async (ctx) => {
      const { error } = await client.auth.signInWithPassword({ email: ctx.email.value.trim(), password: ctx.pw.value });
      return error ? error.message : null;
    }, "Log in");
  }

  /* ---------- Kopfleiste ---------- */

  function renderHeader() {
    const host = document.getElementById("fplw-header");
    if (!host) return;
    host.className = "fplw-bar";
    const inner = el("div", "fplw-bar-in");
    const brand = el("a", "fplw-brand", "FPL");
    brand.href = "/fpl/";
    const nav = el("nav", "fplw-nav");
    [["Newsletter", BASE + "/"], ["Concepts", BASE + "/concepts/"], ["Glossary", BASE + "/glossary/"], ["Wimmelblock", "/fpl/wimmelblock/"]].forEach(([t, h]) => {
      const a = el("a", "", t);
      a.href = h;
      if (location.pathname.replace(/index\.html$/, "") === h) a.setAttribute("aria-current", "page");
      nav.append(a);
    });
    const auth = el("div", "fplw-auth");
    auth.id = "fplw-auth";
    inner.append(brand, nav, auth);
    host.replaceChildren(inner);
    renderAuth();
  }

  function renderAuth() {
    const box = document.getElementById("fplw-auth");
    if (!box) return;
    box.replaceChildren();
    if (S.user) {
      box.append(el("span", "fplw-who", (S.isAdmin ? "Admin · " : "") + (S.user.email || "Signed in")));
      const out = el("button", "", "Log out");
      out.type = "button";
      out.addEventListener("click", () => getSupabase().auth.signOut());
      box.append(out);
    } else {
      const b = el("button", "", "Log in");
      b.type = "button";
      b.addEventListener("click", loginDialog);
      box.append(b);
    }
  }

  async function initAuth(onChange) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (!client) return;
    const res = await completeAuthFromUrl(client);
    if (res && res.error) console.warn(res.error);
    const { data } = await client.auth.getSession();
    S.user = data.session ? data.session.user : null;
    client.auth.onAuthStateChange((event, session) => {
      const next = session ? session.user : null;
      const changed = (next && next.id) !== (S.user && S.user.id);
      S.user = next;
      renderAuth();
      if (changed && onChange) setTimeout(onChange, 0);
    });
    renderAuth();
  }

  /* ---------- Reaktionen ---------- */

  function reactionState(target, emoji) {
    const r = ((S.summary && S.summary.reactions) || []).find((x) => x.target === target && x.emoji === emoji);
    return r || { count: 0, mine: false };
  }

  function reactionBar(target) {
    const bar = el("div", "fplw-react");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Reactions");
    EMOJIS.forEach((emoji) => {
      const b = el("button", "fplw-chip");
      b.type = "button";
      const paint = () => {
        const st = reactionState(target, emoji);
        b.className = "fplw-chip" + (st.mine ? " on" : "");
        b.setAttribute("aria-pressed", String(st.mine));
        b.textContent = emoji + (st.count ? " " + st.count : "");
      };
      paint();
      b.addEventListener("click", async () => {
        if (!S.summary) S.summary = { reactions: [] };
        let st = S.summary.reactions.find((x) => x.target === target && x.emoji === emoji);
        if (!st) {
          st = { target, emoji, count: 0, mine: false };
          S.summary.reactions.push(st);
        }
        st.mine = !st.mine;
        st.count += st.mine ? 1 : -1;
        paint();
        const { error } = await rpc("fplw_toggle_reaction", { p_issue: S.week, p_target: target, p_emoji: emoji, p_token: token() });
        if (error) {
          st.mine = !st.mine;
          st.count += st.mine ? 1 : -1;
          paint();
        }
      });
      bar.append(b);
    });
    return bar;
  }

  /* ---------- Kommentare ---------- */

  function commentPanel(target, label) {
    const wrap = el("div", "fplw-comments");
    const toggle = el("button", "fplw-link");
    toggle.type = "button";
    const panel = el("div", "fplw-cpanel");
    const list = el("div", "fplw-clist");
    panel.append(list, commentForm(target, null));
    wrap.append(toggle, panel);

    function mine() {
      return S.comments.filter((c) => c.target === target);
    }

    function render() {
      const items = mine();
      const open = S.open.has(target);
      toggle.textContent = (open ? "▾ " : "▸ ") + (label || "Comments") + " (" + items.filter((c) => !c.hidden).length + ")";
      toggle.setAttribute("aria-expanded", String(open));
      panel.hidden = !open;
      list.replaceChildren();
      const ids = new Set(items.map((c) => c.id));
      const roots = items.filter((c) => !c.parent_id || !ids.has(c.parent_id));
      roots.forEach((r) => {
        const thread = el("div", "fplw-thread");
        thread.append(commentEl(r, target));
        items.filter((c) => c.parent_id === r.id).forEach((c) => thread.append(commentEl(c, target, true)));
        list.append(thread);
      });
      if (!items.length) list.append(el("p", "fplw-muted", "No comments yet. Be the first."));
    }

    toggle.addEventListener("click", () => {
      if (S.open.has(target)) S.open.delete(target);
      else S.open.add(target);
      render();
    });
    S.panels[target] = render;
    render();
    return wrap;
  }

  function commentEl(c, target, isReply) {
    const box = el("div", "fplw-comment" + (isReply ? " reply" : "") + (c.hidden ? " hidden" : ""));
    const head = el("div", "fplw-chead");
    head.append(el("strong", "", c.name || "Anonymous"), el("span", "fplw-muted", " · " + ago(c.created_at) + (c.edited_at ? " (edited)" : "")));
    if (c.hidden) head.append(el("span", "fplw-badge off", "hidden"));
    const body = el("p", "fplw-cbody", c.body);
    const acts = el("div", "fplw-cacts");
    const reply = el("button", "fplw-link", "Reply");
    reply.type = "button";
    const slot = el("div");
    reply.addEventListener("click", () => {
      if (slot.firstChild) return slot.replaceChildren();
      slot.append(commentForm(target, c.parent_id || c.id, () => slot.replaceChildren()));
      slot.querySelector("textarea").focus();
    });
    acts.append(reply);
    if (c.can_edit) {
      const ed = el("button", "fplw-link", "Edit");
      ed.type = "button";
      ed.addEventListener("click", () => editComment(c));
      const del = el("button", "fplw-link", "Delete");
      del.type = "button";
      del.addEventListener("click", async () => {
        if (!confirm("Delete this comment?")) return;
        const { data } = await rpc("fplw_delete_comment", { p_id: c.id, p_token: token() });
        if (!data) alert("You are not allowed to delete this comment.");
        await loadComments();
      });
      acts.append(ed, del);
    }
    if (S.isAdmin) {
      const hide = el("button", "fplw-link", c.hidden ? "Unhide" : "Hide");
      hide.type = "button";
      hide.addEventListener("click", async () => {
        await rpc("fplw_hide_comment", { p_id: c.id, p_hidden: !c.hidden });
        await loadComments();
      });
      acts.append(hide);
    }
    box.append(head, body, acts, slot);
    return box;
  }

  function editComment(c) {
    dialog("Edit comment", (form) => {
      const t = el("textarea");
      t.maxLength = 1000;
      t.required = true;
      t.rows = 5;
      t.value = c.body;
      form.append(t);
      return { t };
    }, async (ctx) => {
      const { data, error } = await rpc("fplw_edit_comment", { p_id: c.id, p_body: ctx.t.value.trim(), p_token: token() });
      if (error || !data) return "You are not allowed to edit this comment.";
      await loadComments();
      return null;
    }, "Save");
  }

  function commentForm(target, parent, done) {
    const form = el("form", "fplw-cform");
    const name = el("input");
    name.type = "text";
    name.maxLength = 40;
    name.placeholder = "Name (optional)";
    name.setAttribute("aria-label", "Name (optional)");
    try { name.value = localStorage.getItem("fplw_name") || ""; } catch (e) { /* ignorieren */ }
    const text = el("textarea");
    text.maxLength = 1000;
    text.required = true;
    text.rows = parent ? 2 : 3;
    text.placeholder = parent ? "Write a reply …" : "Add a comment …";
    text.setAttribute("aria-label", parent ? "Reply" : "Comment");
    const msg = el("p", "fplw-dlg-msg");
    msg.hidden = true;
    const go = el("button", "", parent ? "Reply" : "Post");
    go.type = "submit";
    form.append(name, text, go, msg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      go.disabled = true;
      const { error } = await rpc("fplw_add_comment", { p_issue: S.week, p_target: target, p_body: text.value.trim(), p_name: name.value.trim() || null, p_token: token(), p_parent: parent });
      go.disabled = false;
      if (error) {
        msg.textContent = errText(error, "Could not post your comment.");
        msg.hidden = false;
        return;
      }
      try { localStorage.setItem("fplw_name", name.value.trim()); } catch (e2) { /* ignorieren */ }
      text.value = "";
      S.open.add(target);
      if (done) done();
      await loadComments();
    });
    return form;
  }

  async function loadComments() {
    const { data } = await rpc("fplw_list_comments", { p_issue: S.week, p_token: token() });
    S.comments = data || [];
    Object.values(S.panels).forEach((r) => r());
  }

  /* ---------- Ausgabe ---------- */

  function paragraphs(text) {
    const frag = document.createDocumentFragment();
    text.split("\n\n").forEach((p) => {
      const e = el("p", /^Why it matters/i.test(p) ? "fplw-why" : "", p);
      frag.append(e);
    });
    return frag;
  }

  const SOURCE_LABELS = { primary: "Primary source", trade: "Trade press", general: "Press", branded: "Branded content" };

  function track(target, kind) {
    rpc("fplw_track", { p_issue: S.week, p_target: target, p_kind: kind, p_token: token() }).then(() => {}, () => {});
  }

  // «Ask AI»: Dialog mit Claude, ChatGPT und Gemini. Der Prompt enthält den Link zum Originalartikel.
  function askAiPrompt(n) {
    return (
      "Please read this article and summarize it for me: " + n.source_url + "\n\n" +
      "Title: " + n.title + "\n\n" +
      "After the summary, stay open for my questions about it. Please explain companies, terms and concepts I might not know " +
      "(I have Bachelor-level knowledge in civil engineering), and tell me if you cannot open the link."
    );
  }

  function askAiDialog(n) {
    const prompt = askAiPrompt(n);
    const q = encodeURIComponent(prompt);
    const providers = [
      { name: "Claude", url: "https://claude.ai/new?q=" + q, copy: false },
      { name: "ChatGPT", url: "https://chatgpt.com/?q=" + q, copy: false },
      // Gemini kennt keinen Link mit vorbereitetem Prompt: Prompt wird kopiert, dort nur einfügen.
      { name: "Gemini", url: "https://gemini.google.com/app", copy: true },
    ];
    dialog("Ask an AI about this article", (form) => {
      form.append(el("p", "fplw-dlg-note", "Opens the chatbot with a ready-made prompt: summarize this article and answer your questions about it."));
      providers.forEach((p) => {
        const b = el("button", "fplw-ai", p.name + (p.copy ? " (prompt is copied, paste it)" : ""));
        b.type = "button";
        b.addEventListener("click", () => {
          window.open(p.url, "_blank", "noopener");
          if (p.copy) copyText(prompt);
          document.getElementById("fplw-dlg").close();
        });
        form.append(b);
      });
      return {};
    }, async () => null, "Close");
    const ok = document.querySelector("#fplw-dlg button[type=submit]");
    if (ok) ok.remove();
  }

  function newsItem(n, images, flags) {
    const target = "news:" + n.id;
    const d = el("details", "fplw-item");
    d.id = "news-" + n.id;
    d.open = S.openItems.has(n.id);
    const sum = el("summary", "fplw-sum");

    const fig = el("figure", "fplw-thumb");
    const img = el("img");
    const info = n.image_url ? { url: n.image_url, credit: n.image_credit } : images[n.id];
    const placeholder = "/src/img/fpl-weekly/" + n.category + ".svg";
    img.loading = "lazy";
    img.alt = "";
    img.src = info ? info.url : placeholder;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      if (!img.src.endsWith(placeholder)) img.src = placeholder;
    });
    fig.append(img);

    const txt = el("div", "fplw-sumtxt");
    const tags = el("div", "fplw-tags");
    tags.append(el("span", "", [n.region, CATS[n.category] || n.category].filter(Boolean).join(" · ")));
    if (flags && flags.popular) tags.append(el("span", "fplw-pop", "Most read"));
    txt.append(el("h3", "", n.title), tags);
    sum.append(fig, txt, el("span", "fplw-chev"));
    d.append(sum);

    const body = el("div", "fplw-more-body");
    const info2 = el("p", "fplw-info");
    info2.append(fmtDate(n.published_at) + " · " + n.source_name);
    if (n.source_type && SOURCE_LABELS[n.source_type]) info2.append(el("span", "fplw-stype " + n.source_type, SOURCE_LABELS[n.source_type]));
    body.append(info2);
    if (n.background) {
      const bg = el("details", "fplw-bg");
      bg.append(el("summary", "", "Background: what you need to know"), el("p", "", n.background));
      body.append(bg);
    }
    body.append(paragraphs(n.body));
    const src = el("a", "fplw-btn", "Read the original article →");
    src.href = n.source_url;
    src.target = "_blank";
    src.rel = "noopener noreferrer";
    ["click", "auxclick"].forEach((ev) => src.addEventListener(ev, () => track(target, "click")));
    const ask = el("button", "fplw-btn ghost", "Ask AI about this article");
    ask.type = "button";
    ask.addEventListener("click", () => askAiDialog(n));
    const btnRow = el("div", "fplw-btnrow");
    btnRow.append(src, ask);
    body.append(btnRow);
    if (n.more_sources && n.more_sources.length) {
      const more = el("p", "fplw-more", "More: ");
      n.more_sources.forEach((m, i) => {
        const a = el("a", "", m.name);
        a.href = m.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        ["click", "auxclick"].forEach((ev) => a.addEventListener(ev, () => track(target, "click")));
        if (i) more.append(", ");
        more.append(a);
      });
      body.append(more);
    }
    if (info && (info.credit || n.source_name)) body.append(el("p", "fplw-more", "Preview image: " + (info.credit || n.source_name)));
    body.append(reactionBar(target), commentPanel(target));
    d.append(body);

    d.addEventListener("toggle", () => {
      if (d.open) {
        S.openItems.add(n.id);
        track(target, "open");
      } else S.openItems.delete(n.id);
    });
    return d;
  }

  // Reihenfolge: redaktionelle Reihenfolge, mit wachsender Datenmenge zunehmend nach Interesse (Klicks, Reaktionen, Kommentare, Öffnen).
  function rankNews(items) {
    const N = items.length;
    const rows = items.map((n, i) => {
      const st = S.stats["news:" + n.id] || {};
      const e = 3 * (+st.clicks || 0) + 2 * (+st.reactions || 0) + 2 * (+st.comments || 0) + (+st.opens || 0);
      return { n, i, e, views: +st.views || 0 };
    });
    const views = Math.max(0, ...Object.values(S.stats).map((s) => +s.views || 0));
    const base = Math.max(views, 1);
    const mean = rows.reduce((a, r) => a + r.e, 0) / (N * base);
    const K = 5; // Vorannahme: wenige Daten ziehen zum Durchschnitt, damit Zufall nicht die Reihenfolge dreht
    rows.forEach((r) => (r.rate = (r.e + K * mean) / (base + K)));
    const maxRate = Math.max(...rows.map((r) => r.rate)) || 1;
    const w = views / (views + 20); // 0 = nur Redaktion, ab ca. 20 Besuchern je zur Hälfte
    rows.forEach((r) => {
      const editorial = N > 1 ? 1 - r.i / (N - 1) : 1;
      r.score = (1 - w) * editorial + w * (r.rate / maxRate);
    });
    rows.sort((a, b) => b.score - a.score || a.i - b.i);
    const top = rows.slice().sort((a, b) => b.rate - a.rate)[0];
    if (top && views >= 10 && top.e >= 3) top.popular = true;
    return rows;
  }

  function runScripts(root) {
    root.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value));
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }

  function badge(summary) {
    const m = summary && summary.moderation;
    const b = el("span", "fplw-badge " + (m ? "ok" : "off"));
    b.textContent = m ? "✓ Checked by moderator · " + fmtDate(m.checked_at) : "Not yet checked by a moderator";
    return b;
  }

  function provenance(issue) {
    const box = el("details", "fplw-prov");
    box.open = !!S.provOpen;
    box.addEventListener("toggle", () => (S.provOpen = box.open));
    const sum = el("summary", "", "AI disclaimer");
    box.append(sum);
    const inner = el("div", "fplw-prov-in");
    inner.append(el("p", "fplw-prov-main", "This issue was researched and written by AI (Claude) as part of an automated weekly task. Every item links to its original source."));
    inner.append(el("p", "fplw-muted", issue.generated.method + " Created " + fmtDate(issue.generated.created_at) + "."));
    const row = el("div", "fplw-prov-row");
    const status = el("span");
    status.replaceChildren(badge(S.summary));
    const mod = S.summary && S.summary.moderation;
    if (mod && mod.note) status.append(el("span", "fplw-muted", "  " + mod.note));
    row.append(status);
    if (S.isAdmin) {
      const btn = el("button", "fplw-btn small", mod ? "Undo" : "Mark as checked");
      btn.type = "button";
      btn.addEventListener("click", async () => {
        if (mod) {
          await rpc("fplw_set_checked", { p_issue: S.week, p_checked: false, p_note: null });
        } else {
          const note = prompt("Optional note for readers (leave empty for none):", "");
          if (note === null) return;
          await rpc("fplw_set_checked", { p_issue: S.week, p_checked: true, p_note: note });
        }
        await loadSummary();
        renderIssue.again();
      });
      row.append(btn);
    }
    inner.append(row);
    box.append(inner);
    return box;
  }

  function pollBlock(issue) {
    const q = issue.question;
    const box = el("div", "fplw-poll");
    function render() {
      box.replaceChildren();
      const counts = {};
      ((S.summary && S.summary.poll) || []).forEach((p) => (counts[p.option] = p.count));
      const mine = S.summary ? S.summary.my_poll : null;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      q.options.forEach((opt, i) => {
        const b = el("button", "fplw-opt" + (mine === i ? " on" : ""));
        b.type = "button";
        const label = el("span", "fplw-opt-l", opt);
        b.append(label);
        if (mine != null) {
          const c = counts[i] || 0;
          const pct = total ? Math.round((c / total) * 100) : 0;
          b.style.setProperty("--pct", pct + "%");
          b.append(el("span", "fplw-opt-n", c + " · " + pct + "%"));
        }
        b.addEventListener("click", async () => {
          const { error } = await rpc("fplw_poll_vote", { p_issue: S.week, p_option: i, p_token: token() });
          if (error) return;
          await loadSummary();
          render();
        });
        box.append(b);
      });
      box.append(el("p", "fplw-muted", mine == null ? "Vote to see the results." : total + " vote" + (total === 1 ? "" : "s") + ". You can change your vote."));
    }
    render();
    return box;
  }

  async function loadStats() {
    const { data } = await rpc("fplw_stats", { p_issue: S.week });
    S.stats = {};
    (data || []).forEach((r) => (S.stats[r.target] = r));
    S.statsLoaded = true;
  }

  async function loadSummary() {
    const { data } = await rpc("fplw_summary", { p_issue: S.week, p_token: token() });
    S.summary = data || { reactions: [], poll: [], my_poll: null, moderation: null, is_admin: false };
    S.isAdmin = !!S.summary.is_admin;
    renderAuth();
  }

  function shareText(issue) {
    let t = issue.summary;
    if (t.length > 220) {
      const cut = t.slice(0, 220);
      const i = cut.lastIndexOf(". ");
      t = i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + "…";
    }
    return "FPL Weekly #" + issue.issue + ": " + issue.title + "\n" + t;
  }

  function shareButton(issue, label) {
    const url = SITE + BASE + "/" + issue.week + "/";
    const s = el("button", "fplw-btn", label || "Share");
    s.type = "button";
    s.addEventListener("click", async () => {
      const text = shareText(issue);
      if (navigator.share) {
        try {
          await navigator.share({ title: "FPL Weekly #" + issue.issue, text, url });
        } catch (e) { /* abgebrochen */ }
        return;
      }
      const ok = await copyText(text + "\n" + url);
      s.textContent = ok ? "Text and link copied" : "Copy failed";
      setTimeout(() => (s.textContent = label || "Share"), 2000);
    });
    return s;
  }

  function sharing(issue, entry, neighbours) {
    const nav = el("nav", "fplw-end");
    const links = el("div", "fplw-pn");
    if (neighbours.prev) {
      const a = el("a", "", "← " + neighbours.prev.title);
      a.href = BASE + "/" + neighbours.prev.week + "/";
      links.append(a);
    }
    const all = el("a", "", "All issues");
    all.href = BASE + "/";
    links.append(all);
    if (neighbours.next) {
      const a = el("a", "", neighbours.next.title + " →");
      a.href = BASE + "/" + neighbours.next.week + "/";
      links.append(a);
    }
    const share = el("div", "fplw-share");
    const s = shareButton(issue, "Share this issue");
    const w = el("button", "fplw-btn ghost", "Copy for WhatsApp");
    w.type = "button";
    w.addEventListener("click", async () => {
      w.textContent = (await copyText(issue.whatsapp_teaser)) ? "Copied" : "Copy failed";
      setTimeout(() => (w.textContent = "Copy for WhatsApp"), 1800);
    });
    share.append(s, w);
    nav.append(links, share);
    return nav;
  }

  function renderIssue() {
    const ctx = renderIssue.ctx;
    const { issue, focusHtml, images, neighbours } = ctx;
    const app = document.getElementById("fplw-app");
    app.replaceChildren();
    S.panels = {};

    const head = el("header", "fplw-head");
    head.append(el("p", "fplw-eyebrow", "FPL Weekly #" + issue.issue + " · Week " + weekNo(issue.week) + " · " + fmtDate(issue.date)));
    head.append(el("h1", "", issue.title), el("p", "fplw-lead", issue.summary));
    const fl = el("a", "fplw-focuslink");
    fl.href = "#focus";
    const flText = el("span", "fplw-focuslink-t");
    flText.append(el("small", "", "Focus of the week"), el("strong", "", issue.focus.title));
    fl.append(flText, el("span", "fplw-focuslink-go", "↓"));
    fl.addEventListener("click", (e) => {
      const t = document.getElementById("focus");
      if (!t) return;
      e.preventDefault();
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      t.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
      try { history.replaceState(null, "", "#focus"); } catch (err) { /* ignorieren */ }
    });
    head.append(fl);
    head.append(el("p", "fplw-muted", "Covers " + fmtDate(issue.covers.from) + " – " + fmtDate(issue.covers.to)));
    const actions = el("div", "fplw-actions");
    actions.append(reactionBar("issue"), shareButton(issue, "Share"));
    head.append(actions);
    app.append(head, provenance(issue));

    const news = el("section", "fplw-news");
    news.append(el("h2", "fplw-news-h", "This week's news"), el("p", "fplw-muted fplw-news-sub", "Tap an item for background, the summary and the original source. The most read items rise to the top."));
    // Die Reihenfolge wird einmal festgelegt, sobald die Zahlen da sind, damit nichts springt, während jemand liest.
    let order;
    if (S.statsLoaded) {
      if (!renderIssue.order) renderIssue.order = rankNews(issue.news);
      order = renderIssue.order;
    } else order = issue.news.map((n, i) => ({ n, i }));
    const list = el("div", "fplw-items");
    order.forEach((r) => list.append(newsItem(r.n, images, { popular: r.popular })));
    news.append(list);
    app.append(news);

    // Fokus-Thema: breiter Abschnitt
    const fbandWrap = el("section", "fplw-focus-band");
    fbandWrap.id = "focus";
    const fin = el("div", "fplw-focus-in");
    fin.append(el("p", "fplw-eyebrow", "Focus of the week"), el("h2", "", issue.focus.title), el("p", "fplw-lead", issue.focus.subtitle));
    const focus = el("div", "fplw-focus");
    focus.innerHTML = focusHtml;
    fin.append(focus);
    runScripts(focus);
    if (issue.focus.glossary && issue.focus.glossary.length) {
      const g = el("div", "fplw-gloss");
      g.append(el("h3", "", "Glossary"));
      const dl = el("dl");
      issue.focus.glossary.forEach((t) => dl.append(el("dt", "", t.term), el("dd", "", t.definition)));
      g.append(dl);
      fin.append(g);
    }
    if (issue.focus.further_reading && issue.focus.further_reading.length) {
      const f = el("div", "fplw-gloss");
      f.append(el("h3", "", "Further reading"));
      const ul = el("ul");
      issue.focus.further_reading.forEach((r) => {
        const li = el("li");
        const a = el("a", "", r.title);
        a.href = r.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.append(a);
        ul.append(li);
      });
      f.append(ul);
      fin.append(f);
    }
    fin.append(reactionBar("focus"), commentPanel("focus", "Comments on the focus"));
    fbandWrap.append(fin);
    app.append(fbandWrap);

    const qs = el("section", "fplw-question");
    qs.id = "question";
    qs.append(el("p", "fplw-eyebrow", "Question of the week"), el("h2", "", issue.question.text), pollBlock(issue), commentPanel("question", "Discussion"));
    app.append(qs, sharing(issue, ctx.entry, neighbours));
    Object.values(S.panels).forEach((r) => r());
    if (!renderIssue.scrolled && location.hash) {
      renderIssue.scrolled = true;
      const t = document.getElementById(location.hash.slice(1));
      if (t) setTimeout(() => t.scrollIntoView(), 50);
    }
  }
  renderIssue.again = () => renderIssue();

  async function pageIssue() {
    const week = document.body.dataset.week;
    S.week = week;
    const app = document.getElementById("fplw-app");
    try {
      const dir = BASE + "/issues/" + week + "/";
      const issue = await getJson(dir + "issue.json");
      const [focusHtml, images, index] = await Promise.all([
        fetch(dir + (issue.focus.file || "focus.html"), { cache: "no-cache" }).then((r) => (r.ok ? r.text() : "")),
        getJson(dir + "images.json").catch(() => ({})),
        getJson(BASE + "/issues/index.json").catch(() => ({ issues: [] })),
      ]);
      const list = (index.issues || []).slice().sort((a, b) => a.week.localeCompare(b.week));
      const i = list.findIndex((x) => x.week === week);
      const neighbours = { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
      renderIssue.ctx = { issue, focusHtml, images, neighbours, entry: list[i] };
      S.summary = { reactions: [], poll: [], my_poll: null, moderation: null };
      if (location.hash.startsWith("#news-")) S.openItems.add(location.hash.slice(6));
      const data = Promise.all([loadSummary(), loadComments(), loadStats()]);
      await Promise.race([data, new Promise((r) => setTimeout(r, 1800))]);
      renderIssue();
      track("issue", "view");
      initAuth(async () => {
        await Promise.all([loadSummary(), loadComments(), loadStats()]);
        renderIssue();
      });
      data.then(() => renderIssue());
    } catch (e) {
      console.error(e);
      app.replaceChildren(el("p", "fplw-error", "This issue could not be loaded."));
    }
  }

  /* ---------- Übersicht ---------- */

  async function pageOverview() {
    const app = document.getElementById("fplw-app");
    initAuth();
    let issues = [];
    try {
      issues = (await getJson(BASE + "/issues/index.json")).issues || [];
    } catch (e) {
      app.replaceChildren(el("p", "fplw-error", "The issue list could not be loaded."));
      return;
    }
    issues.sort((a, b) => b.week.localeCompare(a.week));
    const extra = {};
    rpc("fplw_overview", {}).then(({ data }) => {
      (data || []).forEach((r) => (extra[r.issue] = r));
      draw();
    });
    let cat = "all";
    let q = "";
    const head = el("header", "fplw-head");
    head.append(el("p", "fplw-eyebrow", "Future Planning Lab"), el("h1", "", "FPL Weekly"), el("p", "fplw-lead", "A weekly briefing on digitalization, AI, automation and circular construction, written for civil engineering students. Plus one focus topic each week that builds up your knowledge step by step."));
    const tools = el("div", "fplw-tools");
    const chips = el("div", "fplw-chips");
    [["all", "All"], ...Object.entries(CATS)].forEach(([k, v]) => {
      const b = el("button", "fplw-chip" + (k === "all" ? " on" : ""), v);
      b.type = "button";
      b.addEventListener("click", () => {
        cat = k;
        chips.querySelectorAll(".fplw-chip").forEach((c) => c.classList.toggle("on", c === b));
        draw();
      });
      chips.append(b);
    });
    const search = el("input", "fplw-search");
    search.type = "search";
    search.placeholder = "Search titles …";
    search.setAttribute("aria-label", "Search titles");
    search.addEventListener("input", () => {
      q = search.value.trim().toLowerCase();
      draw();
    });
    tools.append(chips, search);
    const list = el("div", "fplw-list");
    app.replaceChildren(head, tools, list);

    function draw() {
      list.replaceChildren();
      const shown = issues.filter((i) => (cat === "all" || (i.categories || []).includes(cat)) && (!q || (i.title + " " + (i.focus_title || "")).toLowerCase().includes(q)));
      shown.forEach((i) => {
        const a = el("a", "fplw-icard");
        a.href = BASE + "/" + i.week + "/";
        const ex = extra[i.week];
        const top = el("div", "fplw-meta");
        top.append(el("span", "fplw-eyebrow", "#" + i.issue + " · Week " + weekNo(i.week) + " · " + fmtDate(i.date)));
        a.append(top, el("h2", "", i.title), el("p", "", i.summary));
        if (i.focus_title) a.append(el("p", "fplw-focus-line", "🔍 Focus: " + i.focus_title));
        const foot = el("div", "fplw-meta");
        foot.append(badge({ moderation: ex && ex.checked_at ? { checked_at: ex.checked_at } : null }), el("span", "fplw-muted", "💬 " + (ex ? ex.comments : 0)));
        a.append(foot);
        list.append(a);
      });
      if (!shown.length) list.append(el("p", "fplw-muted", "No issues match."));
    }
    draw();
  }

  /* ---------- Lernpfad ---------- */

  async function pageConcepts() {
    const app = document.getElementById("fplw-app");
    initAuth();
    let data;
    try {
      data = await getJson(BASE + "/curriculum.json");
    } catch (e) {
      app.replaceChildren(el("p", "fplw-error", "The learning path could not be loaded."));
      return;
    }
    const read = readSet("fplw_read");
    const byId = {};
    data.concepts.forEach((c) => (byId[c.id] = c));
    const head = el("header", "fplw-head");
    const total = data.concepts.filter((c) => c.status === "published").length;
    const prog = el("p", "fplw-muted");
    head.append(el("p", "fplw-eyebrow", "FPL Weekly"), el("h1", "", "Learning path"), el("p", "fplw-lead", "Each weekly focus topic is one concept. Together they build a path from the basics of digital planning to AI, automation and circular construction."), prog);
    app.replaceChildren(head);
    function paintProgress() {
      const n = data.concepts.filter((c) => c.status === "published" && read.has(c.id)).length;
      prog.textContent = n + " of " + total + " published concepts read · " + data.concepts.length + " planned in total";
    }
    paintProgress();
    data.modules.forEach((m) => {
      const sec = el("section", "fplw-module");
      sec.append(el("h2", "", m.id + " · " + m.title));
      if (m.description) sec.append(el("p", "fplw-muted", m.description));
      data.concepts.filter((c) => c.module === m.id).sort((a, b) => a.order - b.order).forEach((c) => {
        const pub = c.status === "published";
        const row = el("div", "fplw-concept" + (pub ? "" : " planned"));
        const main = el("div");
        if (pub && c.issue) {
          const a = el("a", "", c.title);
          a.href = BASE + "/" + c.issue + "/#focus";
          main.append(el("strong", "", ""), a);
          main.firstChild.remove();
        } else main.append(el("strong", "", c.title));
        const sub = [];
        if (pub && c.issue) sub.push("Issue " + c.issue);
        else sub.push("Planned");
        if (c.prerequisites && c.prerequisites.length) sub.push("Builds on: " + c.prerequisites.map((p) => (byId[p] ? byId[p].title : p)).join(", "));
        main.append(el("div", "fplw-muted", sub.join(" · ")));
        row.append(main);
        if (pub) {
          const lab = el("label", "fplw-read");
          const cb = el("input");
          cb.type = "checkbox";
          cb.checked = read.has(c.id);
          cb.addEventListener("change", () => {
            if (cb.checked) read.add(c.id);
            else read.delete(c.id);
            writeSet("fplw_read", read);
            paintProgress();
          });
          lab.append(cb, document.createTextNode(" Read"));
          row.append(lab);
        }
        sec.append(row);
      });
      app.append(sec);
    });
  }

  /* ---------- Glossar ---------- */

  async function pageGlossary() {
    const app = document.getElementById("fplw-app");
    initAuth();
    let issues = [];
    try {
      issues = (await getJson(BASE + "/issues/index.json")).issues || [];
    } catch (e) {
      app.replaceChildren(el("p", "fplw-error", "The glossary could not be loaded."));
      return;
    }
    const terms = [];
    await Promise.all(issues.map(async (i) => {
      try {
        const d = await getJson(BASE + "/issues/" + i.week + "/issue.json");
        ((d.focus && d.focus.glossary) || []).forEach((t) => terms.push({ term: t.term, definition: t.definition, week: i.week, issue: i.issue }));
      } catch (e) { /* Ausgabe überspringen */ }
    }));
    terms.sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
    const head = el("header", "fplw-head");
    head.append(el("p", "fplw-eyebrow", "FPL Weekly"), el("h1", "", "Glossary"), el("p", "fplw-lead", "All terms explained in the weekly focus topics, in alphabetical order."));
    const search = el("input", "fplw-search");
    search.type = "search";
    search.placeholder = "Search terms …";
    search.setAttribute("aria-label", "Search terms");
    const list = el("div", "fplw-gl");
    app.replaceChildren(head, search, list);
    function draw() {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      let letter = "";
      terms.filter((t) => !q || (t.term + " " + t.definition).toLowerCase().includes(q)).forEach((t) => {
        const l = t.term[0].toUpperCase();
        if (l !== letter) {
          letter = l;
          list.append(el("h2", "fplw-letter", l));
        }
        const row = el("div", "fplw-term");
        row.append(el("dt", "", t.term), el("dd", "", t.definition));
        const a = el("a", "fplw-muted", "Issue #" + t.issue + " →");
        a.href = BASE + "/" + t.week + "/#focus";
        row.append(a);
        list.append(row);
      });
      if (!list.firstChild) list.append(el("p", "fplw-muted", "No terms match."));
    }
    search.addEventListener("input", draw);
    draw();
  }

  /* ---------- Start ---------- */

  renderHeader();
  const page = document.body.dataset.fplw;
  if (page === "issue") pageIssue();
  else if (page === "overview") pageOverview();
  else if (page === "concepts") pageConcepts();
  else if (page === "glossary") pageGlossary();
})();
