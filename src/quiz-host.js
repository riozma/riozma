let quizHost = {
  client: null,
  session: null,
  quiz: null,
  questions: [],
  userId: null,
  renderedKey: null,
  timerInterval: null,
  answerPollInterval: null,
  totalPlayers: 0,
  revealTriggered: false,
  introTimeout: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  quizHost.client = getSupabase();
  const sessionId = new URLSearchParams(window.location.search).get("session");
  if (!sessionId) {
    window.location.replace("/quiz/library.html");
    return;
  }

  const { data: { session: authSession } } = await quizHost.client.auth.getSession();
  if (!authSession?.user?.id) {
    window.location.replace(`/quiz/library.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return;
  }
  quizHost.userId = authSession.user.id;

  const { data: session, error } = await quizHost.client
    .from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error || !session || session.host_user_id !== quizHost.userId) {
    window.location.replace("/quiz/library.html");
    return;
  }
  quizHost.session = session;

  const { data: quiz } = await quizHost.client.from("quizzes").select("*").eq("id", session.quiz_id).single();
  quizHost.quiz = quiz;
  document.getElementById("host-quiz-title").textContent = quiz?.title || "";

  const topbarCode = document.getElementById("host-topbar-code");
  topbarCode.textContent = `Code: ${session.join_code}`;
  topbarCode.classList.remove("d-none");

  const { data: questions } = await quizHost.client
    .from("quiz_questions")
    .select("*, quiz_question_options(*)")
    .eq("quiz_id", session.quiz_id)
    .order("sort_order", { ascending: true });
  quizHost.questions = (questions || []).map((q) => ({
    ...q,
    quiz_question_options: (q.quiz_question_options || []).sort((a, b) => a.sort_order - b.sort_order),
  }));

  bindHostActions();
  subscribeRealtime();
  await renderHostState(session);
});

function subscribeRealtime() {
  quizHost.client
    .channel(`quiz-host-session-${quizHost.session.id}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "quiz_players", filter: `session_id=eq.${quizHost.session.id}`,
    }, () => refreshLobbyIfVisible())
    .subscribe();
}

function bindHostActions() {
  document.getElementById("btn-start-quiz").addEventListener("click", startQuiz);
  document.getElementById("btn-reveal").addEventListener("click", revealAnswers);
  document.getElementById("btn-to-leaderboard").addEventListener("click", showLeaderboardStep);
  document.getElementById("btn-next-question").addEventListener("click", nextQuestion);
  document.getElementById("btn-end-quiz").addEventListener("click", endQuiz);
  document.getElementById("btn-restart-quiz").addEventListener("click", restartQuiz);
  document.getElementById("btn-collect-next").addEventListener("click", goToVotingFromCollect);
}

function currentQuestion() {
  return quizHost.questions[quizHost.session.current_question_index];
}

async function restartQuiz(e) {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Starte…";
  const { data, error } = await quizHost.client.rpc("create_quiz_session", { p_quiz_id: quizHost.quiz.id });
  if (error) {
    alert(error.message);
    btn.disabled = false;
    btn.textContent = "Neu starten (frische Runde)";
    return;
  }
  // Full navigation (not a state reset) guarantees a completely fresh session:
  // new join code, zero players, question index back at -1.
  window.location.href = `/quiz/host.html?session=${encodeURIComponent(data.id)}`;
}

async function updateSession(patch) {
  const { data, error } = await quizHost.client
    .from("quiz_sessions").update(patch).eq("id", quizHost.session.id).select().single();
  if (error) {
    alert(error.message);
    return;
  }
  quizHost.session = data;
  await renderHostState(data);
}

function statusForQuestion(question) {
  return question.question_type === "open_text" ? "collect" : "question";
}

async function startQuiz() {
  const question = quizHost.questions[0];
  await updateSession({
    status: statusForQuestion(question), current_question_index: 0,
    question_started_at: new Date().toISOString(), answer_started_at: null,
  });
}

async function goToVotingFromCollect() {
  await updateSession({ status: "question", answer_started_at: new Date().toISOString() });
}

async function revealAnswers() {
  stopTimer();
  stopAnswerPoll();
  stopIntroTimer();

  const question = currentQuestion();
  try {
    if (question.question_type === "majority") {
      await quizHost.client.rpc("finalize_majority_scoring", {
        p_session_id: quizHost.session.id, p_question_id: question.id,
      });
    } else if (question.question_type === "vote_player") {
      await quizHost.client.rpc("finalize_vote_player_scoring", {
        p_session_id: quizHost.session.id, p_question_id: question.id,
      });
    } else if (question.question_type === "open_text") {
      await quizHost.client.rpc("finalize_open_text_scoring", {
        p_session_id: quizHost.session.id, p_question_id: question.id,
      });
    }
  } catch (err) {
    console.error("Auswertung fehlgeschlagen:", err);
  }

  await updateSession({ status: "reveal" });
}

async function triggerAutoReveal() {
  if (quizHost.revealTriggered || quizHost.session.status !== "question") return;
  quizHost.revealTriggered = true;
  await revealAnswers();
}

async function showLeaderboardStep() {
  await updateSession({ status: "leaderboard" });
}

async function nextQuestion() {
  const next = quizHost.session.current_question_index + 1;
  if (next >= quizHost.questions.length) {
    await updateSession({ status: "ended", ended_at: new Date().toISOString() });
    return;
  }
  await updateSession({
    status: statusForQuestion(quizHost.questions[next]), current_question_index: next,
    question_started_at: new Date().toISOString(), answer_started_at: null,
  });
}

async function endQuiz() {
  if (!confirm("Quiz jetzt beenden?")) return;
  stopTimer();
  stopAnswerPoll();
  stopIntroTimer();
  await updateSession({ status: "ended", ended_at: new Date().toISOString() });
}

function showHostSection(...ids) {
  ["host-lobby", "host-players-wrap", "host-collect", "host-question", "host-reveal", "host-leaderboard", "host-ended"]
    .forEach((sid) => document.getElementById(sid).classList.toggle("d-none", !ids.includes(sid)));
  document.getElementById("btn-end-quiz").classList.toggle("d-none", ids.includes("host-ended"));
}

async function renderHostState(session) {
  const key = `${session.status}:${session.current_question_index}:${session.answer_started_at ? "open" : "intro"}`;
  const isNewState = key !== quizHost.renderedKey;
  quizHost.renderedKey = key;

  if (session.status === "lobby") {
    showHostSection("host-lobby", "host-players-wrap");
    renderQrAndCode();
    await refreshLobbyIfVisible();
    return;
  }

  if (session.status === "collect") {
    showHostSection("host-collect");
    const question = quizHost.questions[session.current_question_index];
    if (isNewState) {
      quizHost.revealTriggered = false;
      document.getElementById("host-collect-text").textContent = question.question_text;
      const img = document.getElementById("host-collect-image");
      const url = question.image_path ? quizImageUrl(question.image_path) : "";
      img.src = url;
      img.classList.toggle("d-none", !url);
    }
    startCollectPoll(question);
    return;
  }

  if (session.status === "question") {
    showHostSection("host-question");
    const question = quizHost.questions[session.current_question_index];
    const isTileType = question.question_type === "standard" || question.question_type === "majority";

    if (!session.answer_started_at) {
      if (isNewState) {
        quizHost.revealTriggered = false;
        renderHostQuestionText(question);
        document.getElementById("host-timer").classList.add("d-none");
        document.getElementById("host-answer-grid").classList.add("d-none");
        document.getElementById("host-reveal-toolbar").classList.add("d-none");
        document.getElementById("host-vote-caption").classList.add("d-none");
        document.getElementById("host-intro-caption").classList.remove("d-none");
        document.getElementById("host-answer-count").textContent = "";
      }
      scheduleIntroReveal(session, question);
      return;
    }

    if (isNewState) {
      stopIntroTimer();
      renderHostQuestionText(question);
      document.getElementById("host-timer").classList.remove("d-none");
      document.getElementById("host-reveal-toolbar").classList.remove("d-none");
      document.getElementById("host-intro-caption").classList.add("d-none");
      if (isTileType) {
        renderHostAnswerGrid(question);
        document.getElementById("host-answer-grid").classList.remove("d-none");
        document.getElementById("host-vote-caption").classList.add("d-none");
      } else {
        document.getElementById("host-answer-grid").classList.add("d-none");
        document.getElementById("host-vote-caption").classList.remove("d-none");
      }
      startTimer(session.answer_started_at, question.time_limit_sec);
      startAnswerPoll(question);
    }
    return;
  }

  if (session.status === "reveal") {
    stopTimer();
    stopAnswerPoll();
    stopIntroTimer();
    showHostSection("host-reveal");
    await renderReveal(quizHost.questions[session.current_question_index]);
    return;
  }

  if (session.status === "leaderboard") {
    showHostSection("host-leaderboard");
    await renderHostLeaderboard("host-leaderboard-list", 10);
    return;
  }

  if (session.status === "ended") {
    stopTimer();
    stopAnswerPoll();
    stopIntroTimer();
    showHostSection("host-ended");
    await renderHostLeaderboard("host-final-leaderboard-list", null);
  }
}

function scheduleIntroReveal(session, question) {
  if (quizHost.introTimeout) return;
  const delayMs = quizIntroDelaySec(question.question_text) * 1000;
  const targetMs = new Date(session.question_started_at).getTime() + delayMs;
  const remaining = Math.max(0, targetMs - Date.now());
  quizHost.introTimeout = setTimeout(openAnswering, remaining);
}

function stopIntroTimer() {
  if (quizHost.introTimeout) {
    clearTimeout(quizHost.introTimeout);
    quizHost.introTimeout = null;
  }
}

async function openAnswering() {
  quizHost.introTimeout = null;
  if (quizHost.session.status !== "question" || quizHost.session.answer_started_at) return;
  await updateSession({ answer_started_at: new Date().toISOString() });
}

function renderQrAndCode() {
  document.getElementById("host-code").textContent = quizHost.session.join_code;
  const canvas = document.getElementById("host-qr");
  if (!window.QRCode) {
    console.error("QRCode-Bibliothek nicht geladen.");
    return;
  }
  QRCode.toCanvas(canvas, quizJoinUrl(quizHost.session.join_code), { width: 220 }, (err) => {
    if (err) console.error("QR-Code konnte nicht erzeugt werden:", err);
  });
}

async function refreshLobbyIfVisible() {
  if (quizHost.session.status !== "lobby") return;
  const { data: players } = await quizHost.client
    .from("quiz_players").select("*").eq("session_id", quizHost.session.id).order("joined_at", { ascending: true });
  document.getElementById("host-player-count").textContent = `${(players || []).length} Teilnehmer beigetreten`;
  document.getElementById("host-players").innerHTML = (players || [])
    .map((p) => `<span class="quiz-host-player-chip">${escapeHtmlLocalHost(p.name)}</span>`).join("");
}

function escapeHtmlLocalHost(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHostQuestionText(question) {
  document.getElementById("host-question-text").textContent = question.question_text;
  const img = document.getElementById("host-question-image");
  const url = question.image_path ? quizImageUrl(question.image_path) : "";
  img.src = url;
  img.classList.toggle("d-none", !url);
}

function renderHostAnswerGrid(question) {
  const grid = document.getElementById("host-answer-grid");
  grid.innerHTML = question.quiz_question_options.map((opt) => {
    const tile = QUIZ_TILE_STYLES[opt.sort_order];
    return `
      <div class="quiz-answer-tile" style="background:${tile.color};cursor:default;">
        <span class="quiz-answer-tile-icon">${quizShapeSvg(tile.shape)}</span>
        <span>${escapeHtmlLocalHost(opt.option_text)}</span>
      </div>`;
  }).join("");

  document.getElementById("host-answer-count").textContent = "";
}

const ANSWER_TABLE_BY_TYPE = {
  standard: "quiz_answers",
  majority: "quiz_answers",
  vote_player: "quiz_player_votes",
  open_text: "quiz_open_text_votes",
};

async function startAnswerPoll(question) {
  stopAnswerPoll();

  const { count: playerCount } = await quizHost.client
    .from("quiz_players")
    .select("id", { count: "exact", head: true })
    .eq("session_id", quizHost.session.id);
  quizHost.totalPlayers = playerCount || 0;

  const table = ANSWER_TABLE_BY_TYPE[question.question_type] || "quiz_answers";
  const label = question.question_type === "vote_player" || question.question_type === "open_text"
    ? "abgestimmt" : "geantwortet";

  const tick = async () => {
    const { count } = await quizHost.client
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("session_id", quizHost.session.id)
      .eq("question_id", question.id);
    document.getElementById("host-answer-count").textContent = `${count || 0} von ${quizHost.totalPlayers} haben ${label}`;
    if (quizHost.totalPlayers > 0 && (count || 0) >= quizHost.totalPlayers) {
      await triggerAutoReveal();
    }
  };
  tick();
  quizHost.answerPollInterval = setInterval(tick, 1500);
}

function stopAnswerPoll() {
  if (quizHost.answerPollInterval) {
    clearInterval(quizHost.answerPollInterval);
    quizHost.answerPollInterval = null;
  }
}

async function startCollectPoll(question) {
  stopAnswerPoll();

  const { count: playerCount } = await quizHost.client
    .from("quiz_players")
    .select("id", { count: "exact", head: true })
    .eq("session_id", quizHost.session.id);
  quizHost.totalPlayers = playerCount || 0;

  const tick = async () => {
    const { count } = await quizHost.client
      .from("quiz_open_text_answers")
      .select("id", { count: "exact", head: true })
      .eq("session_id", quizHost.session.id)
      .eq("question_id", question.id);
    document.getElementById("host-collect-count").textContent = `${count || 0} von ${quizHost.totalPlayers} haben eingereicht`;
    if (quizHost.totalPlayers > 0 && (count || 0) >= quizHost.totalPlayers) {
      stopAnswerPoll();
      if (quizHost.session.status === "collect") await goToVotingFromCollect();
    }
  };
  tick();
  quizHost.answerPollInterval = setInterval(tick, 1500);
}

async function renderReveal(question) {
  document.getElementById("host-reveal-text").textContent = question.question_text;
  const barsEl = document.getElementById("host-bars");
  const listEl = document.getElementById("host-reveal-list");

  if (question.question_type === "vote_player") {
    barsEl.classList.add("d-none");
    listEl.classList.remove("d-none");
    await renderVotePlayerReveal(question);
    return;
  }
  if (question.question_type === "open_text") {
    barsEl.classList.add("d-none");
    listEl.classList.remove("d-none");
    await renderOpenTextReveal(question);
    return;
  }
  listEl.classList.add("d-none");
  barsEl.classList.remove("d-none");
  await renderRevealBars(question);
}

async function renderVotePlayerReveal(question) {
  const { data: stats, error } = await quizHost.client.rpc("get_quiz_player_vote_stats", {
    p_session_id: quizHost.session.id, p_question_id: question.id,
  });
  const listEl = document.getElementById("host-reveal-list");
  if (error || !stats) {
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = stats.map((s) => `
    <div class="quiz-leaderboard-row ${s.is_winner ? "is-me" : ""}">
      <span class="quiz-leaderboard-name">${escapeHtmlLocalHost(s.player_name)}</span>
      <span>${s.vote_count} Stimme${s.vote_count === 1 ? "" : "n"}</span>
    </div>`).join("");
}

async function renderOpenTextReveal(question) {
  const { data: stats, error } = await quizHost.client.rpc("get_quiz_open_text_stats", {
    p_session_id: quizHost.session.id, p_question_id: question.id,
  });
  const listEl = document.getElementById("host-reveal-list");
  if (error || !stats) {
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = stats.map((s) => `
    <div class="quiz-leaderboard-row">
      <span class="quiz-leaderboard-name">"${escapeHtmlLocalHost(s.answer_text)}" — ${escapeHtmlLocalHost(s.player_name)}</span>
      <span>${s.votes_received} Stimme${s.votes_received === 1 ? "" : "n"}</span>
    </div>`).join("");
}

async function renderRevealBars(question) {
  const { data: stats, error } = await quizHost.client.rpc("get_quiz_answer_stats", {
    p_session_id: quizHost.session.id,
    p_question_id: question.id,
  });
  if (error || !stats) return;

  const max = Math.max(1, ...stats.map((s) => Number(s.answer_count) || 0));
  document.getElementById("host-bars").innerHTML = stats.map((s) => {
    const tile = QUIZ_TILE_STYLES[s.sort_order];
    const pct = Math.round((Number(s.answer_count) / max) * 100);
    return `
      <div class="quiz-host-bar-row ${s.is_correct ? "is-correct" : ""}">
        <span class="quiz-host-bar-icon" style="color:${tile.color}">${quizShapeSvg(tile.shape)}</span>
        <div class="quiz-host-bar-track"><div class="quiz-host-bar-fill" style="width:${pct}%;background:${tile.color}"></div></div>
        <span class="quiz-host-bar-count">${s.answer_count}</span>
      </div>`;
  }).join("");
}

async function renderHostLeaderboard(targetId, limit) {
  let query = quizHost.client
    .from("quiz_players").select("*").eq("session_id", quizHost.session.id).order("score", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data: players } = await query;
  document.getElementById(targetId).innerHTML = (players || []).map((p, idx) => `
    <div class="quiz-leaderboard-row">
      <span class="quiz-leaderboard-rank">${idx + 1}</span>
      <span class="quiz-leaderboard-name">${escapeHtmlLocalHost(p.name)}</span>
      <span>${quizFormatScore(p.score)}</span>
    </div>`).join("");
}

function startTimer(startedAt, limitSec) {
  stopTimer();
  const timerEl = document.getElementById("host-timer");
  const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
  function tick() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(limitSec - elapsed));
    timerEl.textContent = String(remaining);
    if (remaining <= 0) {
      stopTimer();
      triggerAutoReveal();
    }
  }
  tick();
  quizHost.timerInterval = setInterval(tick, 250);
}

function stopTimer() {
  if (quizHost.timerInterval) {
    clearInterval(quizHost.timerInterval);
    quizHost.timerInterval = null;
  }
}
