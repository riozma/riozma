const FPL_QUESTIONS = [
  "How does innovation find its way into practice?",
  "How and in which use cases will AI be used in construction planning?",
  "What are the barriers to innovation in practice?",
  "What do you think are the biggest three construction trends currently?",
  "What skills will the planners and engineers of tomorrow need, and how do we get them during our studies?",
];

let fplNotes = [];
let fplIsAdmin = false;
let fplUser = null;
let fplTmpToken = null;

function fplToken() {
  try {
    let t = localStorage.getItem("fpl_token");
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()) + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem("fpl_token", t);
    }
    return t;
  } catch (e) {
    if (!fplTmpToken) fplTmpToken = "session-" + Math.random().toString(36).slice(2) + Date.now();
    return fplTmpToken;
  }
}

function fplStatus(msg) {
  const el = document.getElementById("status");
  el.hidden = !msg;
  el.textContent = msg || "";
}

function fplErrorText(error, fallback) {
  if (error && error.message && error.message.includes("rate limit")) return "Slow down a little, you did many things in a short time.";
  return fallback;
}

function fplRotation(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((((h % 7) + 7) % 7) - 3) * 0.7;
}

function fplEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function fplShort(text, n = 60) {
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

/* ---------- dialog ---------- */

function fplDialog({ title, text = "", submitLabel, withText = true, build, onSubmit }) {
  const dlg = document.getElementById("dlg");
  const form = document.getElementById("dlg-form");
  form.replaceChildren();
  form.append(fplEl("h3", "", title));
  let area = null;
  if (withText) {
    area = fplEl("textarea");
    area.maxLength = 200;
    area.required = true;
    area.rows = 4;
    area.value = text;
    area.setAttribute("aria-label", "Post-it text");
    form.append(area);
  }
  const ctx = build ? build(form) : {};
  const msg = fplEl("p", "dlg-msg");
  msg.hidden = true;
  const row = fplEl("div", "dlg-row");
  const cancel = fplEl("button", "ghost", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => dlg.close());
  const ok = fplEl("button", "", submitLabel);
  ok.type = "submit";
  row.append(cancel, ok);
  form.append(msg, row);
  form.onsubmit = async (e) => {
    e.preventDefault();
    ok.disabled = true;
    const err = await onSubmit({ text: area ? area.value.trim() : "", ctx });
    ok.disabled = false;
    if (err) {
      msg.textContent = err;
      msg.hidden = false;
    } else {
      dlg.close();
    }
  };
  dlg.showModal();
  if (area) area.focus();
}

function fplRootsOf(q, excludeId) {
  return fplNotes.filter((n) => n.q === q && !n.parent_id && n.id !== excludeId);
}

/* ---------- note actions ---------- */

function fplReply(n) {
  const rootId = n.parent_id || n.id;
  fplDialog({
    title: "Reply to: " + fplShort(n.body, 70),
    submitLabel: "Stick it",
    onSubmit: async ({ text }) => {
      const { error } = await getSupabase().rpc("fpl_add_note", { p_q: n.q, p_body: text, p_token: fplToken(), p_parent: rootId });
      if (error) return fplErrorText(error, "Could not save your reply.");
      await fplLoad();
      return null;
    },
  });
}

function fplEdit(n) {
  fplDialog({
    title: "Edit post-it",
    text: n.body,
    submitLabel: "Save",
    onSubmit: async ({ text }) => {
      const { data, error } = await getSupabase().rpc("fpl_edit_note", { p_note: n.id, p_body: text });
      if (error || !data) return "You are not allowed to edit this post-it.";
      await fplLoad();
      return null;
    },
  });
}

async function fplDelete(n) {
  if (!confirm("Delete this post-it?")) return;
  const { data, error } = await getSupabase().rpc("fpl_delete_note", { p_note: n.id });
  if (error || !data) return fplStatus("You are not allowed to delete this post-it.");
  fplStatus("");
  await fplLoad();
}

function fplMove(n) {
  fplDialog({
    title: "Move post-it",
    withText: false,
    submitLabel: "Move",
    build: (form) => {
      const qSel = fplEl("select");
      FPL_QUESTIONS.forEach((t, i) => {
        const o = fplEl("option", "", (i + 1) + ". " + fplShort(t, 50));
        o.value = i + 1;
        qSel.append(o);
      });
      qSel.value = n.q;
      const pSel = fplEl("select");
      const fill = () => {
        pSel.replaceChildren();
        const none = fplEl("option", "", "Standalone (no reply)");
        none.value = "";
        pSel.append(none);
        fplRootsOf(Number(qSel.value), n.id).forEach((r) => {
          const o = fplEl("option", "", "Reply to: " + fplShort(r.body));
          o.value = r.id;
          pSel.append(o);
        });
        if (Number(qSel.value) === n.q && n.parent_id) pSel.value = n.parent_id;
      };
      qSel.addEventListener("change", fill);
      fill();
      const l1 = fplEl("label", "", "Question");
      l1.append(qSel);
      const l2 = fplEl("label", "", "Bundle with");
      l2.append(pSel);
      form.append(l1, l2);
      return { qSel, pSel };
    },
    onSubmit: async ({ ctx }) => {
      const { error } = await getSupabase().rpc("fpl_move_note", {
        p_note: n.id,
        p_q: Number(ctx.qSel.value),
        p_parent: ctx.pSel.value || null,
      });
      if (error) return "Could not move the post-it.";
      await fplLoad();
      return null;
    },
  });
}

async function fplVote(n, btn) {
  const client = getSupabase();
  if (!client) return;
  n.mine = !n.mine;
  n.votes += n.mine ? 1 : -1;
  fplPaintVote(n, btn);
  const { error } = await client.rpc("fpl_toggle_vote", { p_note: n.id, p_token: fplToken() });
  if (error) {
    fplStatus(fplErrorText(error, "Could not save your thumbs up."));
    await fplLoad();
  }
}

function fplPaintVote(n, btn) {
  btn.className = "vote" + (n.mine ? " on" : "");
  btn.setAttribute("aria-pressed", String(n.mine));
  btn.textContent = "👍 " + n.votes;
}

/* ---------- rendering ---------- */

function fplIconBtn(label, glyph, handler) {
  const b = fplEl("button", "icon", glyph);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", handler);
  return b;
}

function fplNoteEl(n) {
  const el = fplEl("div", "note" + (n.own ? " mine" : "") + (n.parent_id ? " reply" : ""));
  el.style.setProperty("--r", fplRotation(n.id) + "deg");
  const head = fplEl("div", "note-head");
  const vote = fplEl("button");
  vote.type = "button";
  vote.setAttribute("aria-label", "Thumbs up");
  fplPaintVote(n, vote);
  vote.addEventListener("click", () => fplVote(n, vote));
  head.append(vote, fplEl("span", "grow"), fplIconBtn("Reply", "💬", () => fplReply(n)));
  if (n.can_edit) head.append(fplIconBtn("Edit", "✎", () => fplEdit(n)));
  if (fplIsAdmin) head.append(fplIconBtn("Move or bundle", "⇄", () => fplMove(n)));
  if (n.can_edit) head.append(fplIconBtn("Delete", "✕", () => fplDelete(n)));
  el.append(head, fplEl("div", "note-body", n.body));
  return el;
}

function fplRender() {
  const root = document.getElementById("questions");
  root.replaceChildren();
  FPL_QUESTIONS.forEach((text, i) => {
    const q = i + 1;
    const sec = fplEl("section", "question");
    const h = fplEl("h3");
    h.append(fplEl("span", "", String(q)), text);

    const inQ = fplNotes.filter((n) => n.q === q);
    const ids = new Set(inQ.map((n) => n.id));
    const roots = inQ.filter((n) => !n.parent_id || !ids.has(n.parent_id));
    const replies = (id) => inQ.filter((n) => n.parent_id === id);
    const score = (r) => r.votes + replies(r.id).reduce((s, c) => s + c.votes, 0);
    roots.sort((a, b) => score(b) - score(a) || a.created_at.localeCompare(b.created_at));

    const grid = fplEl("div", "notes");
    roots.forEach((r) => {
      const thread = fplEl("div", "thread");
      thread.append(fplNoteEl(r));
      replies(r.id).forEach((c) => thread.append(fplNoteEl(c)));
      grid.append(thread);
    });

    const form = fplEl("form", "add");
    const input = fplEl("input");
    input.type = "text";
    input.maxLength = 200;
    input.required = true;
    input.placeholder = "Add your post-it …";
    input.setAttribute("aria-label", "Your post-it for question " + q);
    const btn = fplEl("button", "", "Stick it");
    btn.type = "submit";
    form.append(input, btn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      const client = getSupabase();
      if (!client) return fplStatus("The post-it board is unavailable right now.");
      btn.disabled = true;
      const { error } = await client.rpc("fpl_add_note", { p_q: q, p_body: body, p_token: fplToken() });
      btn.disabled = false;
      if (error) return fplStatus(fplErrorText(error, "Could not save your post-it. Please try again."));
      fplStatus("");
      await fplLoad();
    });

    sec.append(h, grid, form);
    root.append(sec);
  });
}

async function fplLoad() {
  const client = getSupabase();
  if (!client) return fplStatus("The post-it board is unavailable right now.");
  const [list, admin] = await Promise.all([
    client.rpc("fpl_list", { p_token: fplToken() }),
    client.rpc("fpl_is_admin"),
  ]);
  if (list.error) return fplStatus("Could not load the post-its. Please reload the page.");
  fplIsAdmin = admin.data === true;
  fplNotes = list.data.map((n) => ({ ...n, votes: Number(n.votes) }));
  fplRenderAuth();
  fplRender();
}

/* ---------- login ---------- */

function fplRenderAuth() {
  const bar = document.getElementById("authbar");
  bar.replaceChildren();
  if (fplUser) {
    bar.append(fplEl("span", "who", (fplIsAdmin ? "Admin · " : "") + (fplUser.email || "Signed in")));
    const out = fplEl("button", "", "Log out");
    out.type = "button";
    out.addEventListener("click", async () => {
      await getSupabase().auth.signOut();
    });
    bar.append(out);
  } else {
    const inn = fplEl("button", "", "Log in");
    inn.type = "button";
    inn.addEventListener("click", fplLoginDialog);
    bar.append(inn);
  }
  document.getElementById("anon-hint").hidden = !!fplUser;
}

function fplLoginDialog() {
  const client = getSupabase();
  if (!client) return fplStatus("Login is unavailable right now.");
  fplDialog({
    title: "Log in",
    withText: false,
    submitLabel: "Log in",
    build: (form) => {
      form.append(fplEl("p", "dlg-note", "Logged-in post-its can only be edited by you."));
      const g = fplEl("button", "google", "Continue with Google");
      g.type = "button";
      g.addEventListener("click", async () => {
        storeAuthReturnTo();
        const { data, error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: oauthReturnUrl(), skipBrowserRedirect: true },
        });
        if (error) {
          const m = form.querySelector(".dlg-msg");
          m.textContent = error.message;
          m.hidden = false;
        } else if (data && data.url) {
          persistPkceVerifierToCookie();
          window.location.assign(data.url);
        }
      });
      const email = fplEl("input");
      email.type = "email";
      email.placeholder = "Email";
      email.autocomplete = "email";
      email.required = true;
      const pw = fplEl("input");
      pw.type = "password";
      pw.placeholder = "Password (min. 6 characters)";
      pw.autocomplete = "current-password";
      pw.minLength = 6;
      pw.required = true;
      const up = fplEl("button", "ghost", "Sign up instead");
      up.type = "button";
      up.addEventListener("click", async () => {
        const m = form.querySelector(".dlg-msg");
        if (!email.value || pw.value.length < 6) {
          m.textContent = "Enter your email and a password with at least 6 characters.";
          m.hidden = false;
          return;
        }
        const { error } = await client.auth.signUp({ email: email.value.trim(), password: pw.value, options: { emailRedirectTo: authRedirectUrl() } });
        m.textContent = error ? error.message : "Account created. Please confirm your email if asked, then log in.";
        m.hidden = false;
      });
      form.append(g, fplEl("p", "dlg-note", "or with email"), email, pw, up);
      return { email, pw };
    },
    onSubmit: async ({ ctx }) => {
      const { error } = await client.auth.signInWithPassword({ email: ctx.email.value.trim(), password: ctx.pw.value });
      return error ? error.message : null;
    },
  });
}

async function fplInit() {
  fplRender();
  fplRenderAuth();
  const client = getSupabase();
  if (!client) return fplLoad();
  const res = await completeAuthFromUrl(client);
  if (res && res.error) fplStatus(res.error);
  const { data } = await client.auth.getSession();
  fplUser = data.session ? data.session.user : null;
  client.auth.onAuthStateChange((event, session) => {
    const next = session ? session.user : null;
    const changed = (next && next.id) !== (fplUser && fplUser.id);
    fplUser = next;
    if (changed) setTimeout(fplLoad, 0);
  });
  await fplLoad();
}

fplInit();
