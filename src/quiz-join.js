let quizJoin = {
  client: null,
  sessionId: null,
  playerId: null,
  joinCode: null,
  clientToken: null,
  channel: null,
  answered: false,
  lastResult: null,
  renderedKey: null,
  timerInterval: null,
  questionMeta: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  quizJoin.client = getSupabase();
  quizJoin.clientToken = getQuizClientToken();

  const codeFromUrl = new URLSearchParams(window.location.search).get("c");
  const codeInput = document.getElementById("input-code");
  if (codeFromUrl) codeInput.value = codeFromUrl.replace(/\D/g, "").slice(0, 6);

  bindCodeStep();
  bindNameStep();
});

function bindCodeStep() {
  const input = document.getElementById("input-code");
  const btn = document.getElementById("btn-code-next");
  const err = document.getElementById("code-error");

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
  });

  btn.addEventListener("click", () => {
    err.textContent = "";
    if (input.value.length !== 6) {
      err.textContent = "Bitte einen 6-stelligen Code eingeben.";
      return;
    }
    quizJoin.joinCode = input.value;
    document.getElementById("step-code").classList.add("d-none");
    document.getElementById("step-name").classList.remove("d-none");
    document.getElementById("input-name").focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btn.click();
  });
}

function bindNameStep() {
  const input = document.getElementById("input-name");
  const btn = document.getElementById("btn-name-join");
  const err = document.getElementById("name-error");

  async function submit() {
    err.textContent = "";
    const name = input.value.trim();
    if (!name) {
      err.textContent = "Bitte einen Namen eingeben.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const { data, error } = await quizJoin.client.rpc("join_quiz_session", {
        p_join_code: quizJoin.joinCode,
        p_name: name,
        p_client_token: quizJoin.clientToken,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      quizJoin.sessionId = row.session_id;
      quizJoin.playerId = row.player_id;
      enterGameStep();
      subscribeSession();
      const { data: session } = await quizJoin.client
        .from("quiz_sessions").select("*").eq("id", quizJoin.sessionId).maybeSingle();
      if (session) renderGameState(session);
    } catch (e2) {
      err.textContent = e2.message || "Beitritt fehlgeschlagen.";
      document.getElementById("step-name").classList.add("d-none");
      document.getElementById("step-code").classList.remove("d-none");
      document.getElementById("code-error").textContent = e2.message || "Beitritt fehlgeschlagen.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Beitreten";
    }
  }

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

function enterGameStep() {
  document.getElementById("step-code").classList.add("d-none");
  document.getElementById("step-name").classList.add("d-none");
  document.getElementById("step-game").classList.remove("d-none");
}

function subscribeSession() {
  if (quizJoin.channel) return;
  quizJoin.channel = quizJoin.client
    .channel(`quiz-session-${quizJoin.sessionId}`)
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "quiz_sessions", filter: `id=eq.${quizJoin.sessionId}`,
    }, (payload) => renderGameState(payload.new))
    .subscribe();
}

function showGameSection(id) {
  ["game-lobby", "game-intro", "game-question", "game-answered", "game-reveal", "game-leaderboard", "game-ended"]
    .forEach((sid) => document.getElementById(sid).classList.toggle("d-none", sid !== id));
}

async function renderGameState(session) {
  const key = `${session.status}:${session.current_question_index}:${session.answer_started_at ? "open" : "intro"}`;
  const isNewState = key !== quizJoin.renderedKey;
  quizJoin.renderedKey = key;

  if (session.status === "lobby") {
    stopTimer();
    showGameSection("game-lobby");
    return;
  }

  if (session.status === "question") {
    if (!isNewState) return;
    if (!session.answer_started_at) {
      quizJoin.answered = false;
      quizJoin.lastResult = null;
      await loadQuestionIntro();
      return;
    }
    await loadCurrentQuestion(session);
    return;
  }

  if (session.status === "reveal") {
    stopTimer();
    const feedback = document.getElementById("reveal-feedback");
    if (!quizJoin.answered) {
      feedback.textContent = "Keine Antwort abgegeben";
      feedback.className = "quiz-feedback";
    } else if (quizJoin.lastResult?.is_correct) {
      feedback.textContent = `Richtig! +${quizFormatScore(quizJoin.lastResult.points_awarded)} Punkte`;
      feedback.className = "quiz-feedback is-correct";
    } else {
      feedback.textContent = "Leider falsch";
      feedback.className = "quiz-feedback is-wrong";
    }
    showGameSection("game-reveal");
    return;
  }

  if (session.status === "leaderboard") {
    stopTimer();
    await renderLeaderboard("leaderboard-list");
    showGameSection("game-leaderboard");
    return;
  }

  if (session.status === "ended") {
    stopTimer();
    await renderLeaderboard("final-leaderboard-list");
    showGameSection("game-ended");
  }
}

async function renderLeaderboard(targetId) {
  const { data: players } = await quizJoin.client
    .from("quiz_players")
    .select("*")
    .eq("session_id", quizJoin.sessionId)
    .order("score", { ascending: false });

  const list = document.getElementById(targetId);
  list.innerHTML = (players || []).map((p, idx) => `
    <div class="quiz-leaderboard-row ${p.id === quizJoin.playerId ? "is-me" : ""}">
      <span class="quiz-leaderboard-rank">${idx + 1}</span>
      <span class="quiz-leaderboard-name">${escapeHtmlLocal(p.name)}</span>
      <span>${quizFormatScore(p.score)}</span>
    </div>`).join("");
}

function escapeHtmlLocal(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function fetchCurrentQuestion() {
  const { data, error } = await quizJoin.client.rpc("get_quiz_current_question", {
    p_session_id: quizJoin.sessionId,
    p_client_token: quizJoin.clientToken,
  });
  if (error || !data || !data.length) return null;
  const q = Array.isArray(data) ? data[0] : data;
  quizJoin.questionMeta = q;
  return q;
}

async function loadQuestionIntro() {
  const q = await fetchCurrentQuestion();
  if (!q) return;

  const textEl = document.getElementById("intro-question-text");
  const imgEl = document.getElementById("intro-question-image");
  const captionEl = document.getElementById("intro-caption");

  if (q.no_projector_mode) {
    textEl.textContent = q.question_text;
    textEl.classList.remove("d-none");
    const url = q.image_path ? quizImageUrl(q.image_path) : "";
    imgEl.src = url;
    imgEl.classList.toggle("d-none", !url);
    captionEl.textContent = "Antworten erscheinen gleich …";
  } else {
    textEl.classList.add("d-none");
    imgEl.classList.add("d-none");
    captionEl.textContent = "📺 Schau auf den Beamer – die Frage wird gleich angezeigt!";
  }

  showGameSection("game-intro");
}

async function loadCurrentQuestion(session) {
  const q = await fetchCurrentQuestion();
  if (!q) return;

  if (q.already_answered) {
    quizJoin.answered = true;
    showGameSection("game-answered");
    return;
  }

  renderAnswerGrid(q);
  showGameSection("game-question");
  startTimer(q.answer_started_at || session.answer_started_at, q.time_limit_sec);
}

function renderAnswerGrid(q) {
  const grid = document.getElementById("answer-grid");
  const options = q.options || [];
  grid.style.gridTemplateColumns = "1fr 1fr";
  grid.style.gridTemplateRows = options.length > 2 ? "1fr 1fr" : "1fr";

  grid.innerHTML = options.map((opt) => {
    const tile = QUIZ_TILE_STYLES[opt.sort_order];
    return `
      <button type="button" class="quiz-answer-tile" data-option-id="${opt.id}" style="background:${tile.color}">
        <span class="quiz-answer-tile-icon">${quizShapeSvg(tile.shape)}</span>
        ${q.no_projector_mode ? `<span class="quiz-answer-tile-label">${escapeHtmlLocal(opt.option_text)}</span>` : ""}
      </button>`;
  }).join("");

  grid.querySelectorAll("[data-option-id]").forEach((tile) => {
    tile.addEventListener("click", () => submitAnswer(tile.dataset.optionId), { once: true });
  });
}

async function submitAnswer(optionId) {
  if (quizJoin.answered) return;
  quizJoin.answered = true;
  stopTimer();
  document.querySelectorAll("#answer-grid [data-option-id]").forEach((t) => {
    t.disabled = true;
    t.classList.toggle("is-selected", t.dataset.optionId === optionId);
  });

  try {
    const { data, error } = await quizJoin.client.rpc("submit_quiz_answer", {
      p_session_id: quizJoin.sessionId,
      p_client_token: quizJoin.clientToken,
      p_option_ids: [optionId],
    });
    if (error) throw new Error(error.message);
    quizJoin.lastResult = Array.isArray(data) ? data[0] : data;
  } catch (_) {
    quizJoin.lastResult = null;
  }
  showGameSection("game-answered");
}

function startTimer(startedAt, limitSec) {
  stopTimer();
  const timerEl = document.getElementById("question-timer");
  const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();

  function tick() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(limitSec - elapsed));
    timerEl.textContent = String(remaining);
    if (remaining <= 0) stopTimer();
  }
  tick();
  quizJoin.timerInterval = setInterval(tick, 250);
}

function stopTimer() {
  if (quizJoin.timerInterval) {
    clearInterval(quizJoin.timerInterval);
    quizJoin.timerInterval = null;
  }
}
