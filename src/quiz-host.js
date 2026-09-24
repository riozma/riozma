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

async function startQuiz() {
  await updateSession({
    status: "question", current_question_index: 0,
    question_started_at: new Date().toISOString(), answer_started_at: null,
  });
}

async function revealAnswers() {
  stopTimer();
  stopAnswerPoll();
  stopIntroTimer();
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
    status: "question", current_question_index: next,
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
  ["host-lobby", "host-players-wrap", "host-question", "host-reveal", "host-leaderboard", "host-ended"]
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

  if (session.status === "question") {
    showHostSection("host-question");
    const question = quizHost.questions[session.current_question_index];

    if (!session.answer_started_at) {
      if (isNewState) {
        quizHost.revealTriggered = false;
        renderHostQuestionText(question);
        document.getElementById("host-timer").classList.add("d-none");
        document.getElementById("host-answer-grid").classList.add("d-none");
        document.getElementById("host-reveal-toolbar").classList.add("d-none");
        document.getElementById("host-intro-caption").classList.remove("d-none");
        document.getElementById("host-answer-count").textContent = "";
      }
      scheduleIntroReveal(session, question);
      return;
    }

    if (isNewState) {
      stopIntroTimer();
      renderHostQuestionText(question);
      renderHostAnswerGrid(question);
      document.getElementById("host-timer").classList.remove("d-none");
      document.getElementById("host-answer-grid").classList.remove("d-none");
      document.getElementById("host-reveal-toolbar").classList.remove("d-none");
      document.getElementById("host-intro-caption").classList.add("d-none");
      startTimer(session.answer_started_at, question.time_limit_sec);
      startAnswerPoll();
    }
    return;
  }

  if (session.status === "reveal") {
    stopTimer();
    stopAnswerPoll();
    stopIntroTimer();
    showHostSection("host-reveal");
    await renderRevealBars(quizHost.questions[session.current_question_index]);
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

async function startAnswerPoll() {
  stopAnswerPoll();
  const question = quizHost.questions[quizHost.session.current_question_index];

  const { count: playerCount } = await quizHost.client
    .from("quiz_players")
    .select("id", { count: "exact", head: true })
    .eq("session_id", quizHost.session.id);
  quizHost.totalPlayers = playerCount || 0;

  const tick = async () => {
    const { count } = await quizHost.client
      .from("quiz_answers")
      .select("id", { count: "exact", head: true })
      .eq("session_id", quizHost.session.id)
      .eq("question_id", question.id);
    document.getElementById("host-answer-count").textContent = `${count || 0} von ${quizHost.totalPlayers} haben geantwortet`;
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

async function renderRevealBars(question) {
  document.getElementById("host-reveal-text").textContent = question.question_text;
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
