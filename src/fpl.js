const FPL_QUESTIONS = [
  "How does innovation find its way into practice?",
  "How and in which use cases will AI be used in construction planning?",
  "What are the barriers to innovation in practice?",
  "What do you think are the biggest three construction trends currently?",
  "What skills will the planners and engineers of tomorrow need, and how do we get them during our studies?",
];

let fplNotes = [];
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

function fplRotation(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((((h % 7) + 7) % 7) - 3) * 0.7;
}

function fplRender() {
  const root = document.getElementById("questions");
  root.replaceChildren();
  FPL_QUESTIONS.forEach((text, i) => {
    const q = i + 1;
    const sec = document.createElement("section");
    sec.className = "question";
    const h = document.createElement("h3");
    const num = document.createElement("span");
    num.textContent = q;
    h.append(num, text);

    const grid = document.createElement("div");
    grid.className = "notes";
    fplNotes
      .filter((n) => n.q === q)
      .sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at))
      .forEach((n) => grid.append(fplNoteEl(n)));

    const form = document.createElement("form");
    form.className = "add";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 200;
    input.required = true;
    input.placeholder = "Add your post-it …";
    input.setAttribute("aria-label", "Your post-it for question " + q);
    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "Stick it";
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
      if (error) {
        return fplStatus(
          error.message.includes("rate limit")
            ? "Slow down a little, you added many post-its in a short time."
            : "Could not save your post-it. Please try again.",
        );
      }
      fplStatus("");
      await fplLoad();
    });

    sec.append(h, grid, form);
    root.append(sec);
  });
}

function fplVoteLabel(n) {
  return "👍 " + n.votes;
}

function fplNoteEl(n) {
  const el = document.createElement("div");
  el.className = "note" + (n.own ? " mine" : "");
  el.style.setProperty("--r", fplRotation(n.id) + "deg");
  const p = document.createElement("div");
  p.textContent = n.body;
  const foot = document.createElement("div");
  foot.className = "note-foot";

  const vote = document.createElement("button");
  vote.type = "button";
  vote.className = "vote" + (n.mine ? " on" : "");
  vote.setAttribute("aria-pressed", String(n.mine));
  vote.setAttribute("aria-label", "Thumbs up");
  vote.textContent = fplVoteLabel(n);
  vote.addEventListener("click", async () => {
    const client = getSupabase();
    if (!client) return;
    n.mine = !n.mine;
    n.votes += n.mine ? 1 : -1;
    vote.className = "vote" + (n.mine ? " on" : "");
    vote.setAttribute("aria-pressed", String(n.mine));
    vote.textContent = fplVoteLabel(n);
    const { error } = await client.rpc("fpl_toggle_vote", { p_note: n.id, p_token: fplToken() });
    if (error) {
      fplStatus("Could not save your thumbs up.");
      await fplLoad();
    }
  });
  foot.append(vote);

  if (n.own) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.title = "Remove your post-it";
    del.setAttribute("aria-label", "Remove your post-it");
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      await getSupabase().rpc("fpl_delete_note", { p_note: n.id, p_token: fplToken() });
      await fplLoad();
    });
    foot.append(del);
  }
  el.append(p, foot);
  return el;
}

async function fplLoad() {
  const client = getSupabase();
  if (!client) return fplStatus("The post-it board is unavailable right now.");
  const { data, error } = await client.rpc("fpl_list", { p_token: fplToken() });
  if (error) return fplStatus("Could not load the post-its. Please reload the page.");
  fplNotes = data.map((n) => ({ ...n, votes: Number(n.votes) }));
  fplRender();
}

fplRender();
fplLoad();
