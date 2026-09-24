let quizEditSession = null;
let quizEditId = null;
let quizEditData = null;
let quizEditQuestions = [];

document.addEventListener("DOMContentLoaded", async () => {
  quizEditId = new URLSearchParams(window.location.search).get("id");
  if (!quizEditId) {
    window.location.replace("/quiz/library.html");
    return;
  }

  await initAuthUI({
    mode: "discreet",
    loginContainerId: "auth-container-dashboard",
    onAuthChange: async (session) => {
      quizEditSession = session;
      if (!session) {
        window.location.replace(`/quiz/library.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      await loadQuiz();
    },
  });

  bindTabs();
  bindStaticActions();
});

function bindTabs() {
  document.querySelectorAll(".quiz-editor-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".quiz-editor-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const target = tab.dataset.tab;
      document.getElementById("tab-overview").classList.toggle("d-none", target !== "overview");
      document.getElementById("tab-settings").classList.toggle("d-none", target !== "settings");
    });
  });
}

function bindStaticActions() {
  document.getElementById("btn-add-question").addEventListener("click", () => openQuestionDialog(null));
  document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
  document.getElementById("btn-start-from-edit").addEventListener("click", startFromEdit);

  const titleInput = document.getElementById("quiz-title-input");
  titleInput.addEventListener("blur", saveTitle);
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") titleInput.blur();
  });
}

async function loadQuiz() {
  const client = getSupabase();
  const { data: quiz, error } = await client.from("quizzes").select("*").eq("id", quizEditId).maybeSingle();
  if (error || !quiz) {
    window.location.replace("/quiz/library.html");
    return;
  }
  quizEditData = quiz;
  document.getElementById("quiz-title-input").value = quiz.title || "";
  document.getElementById("settings-title").value = quiz.title || "";
  document.getElementById("settings-max-players").value = quiz.max_players ?? "";
  document.getElementById("settings-points-mode").value = quiz.points_mode;
  document.getElementById("settings-points-value").value = quiz.points_per_question;

  await loadQuestions();
}

async function loadQuestions() {
  const client = getSupabase();
  const { data, error } = await client
    .from("quiz_questions")
    .select("*, quiz_question_options(*)")
    .eq("quiz_id", quizEditId)
    .order("sort_order", { ascending: true });

  if (error) {
    showStatus(document.getElementById("edit-message"), error.message, "error");
    return;
  }

  quizEditQuestions = (data || []).map((q) => ({
    ...q,
    quiz_question_options: (q.quiz_question_options || []).sort((a, b) => a.sort_order - b.sort_order),
  }));

  renderQuestionList();
}

function renderQuestionList() {
  const list = document.getElementById("quiz-question-list");
  if (!quizEditQuestions.length) {
    list.innerHTML = `<p class="text-muted">Noch keine Fragen – füge deine erste Frage hinzu.</p>`;
    return;
  }

  list.innerHTML = quizEditQuestions.map((q, idx) => `
    <div class="quiz-question-row" data-question-id="${q.id}">
      <span class="quiz-question-row-index">${idx + 1}.</span>
      <span class="quiz-question-row-text">${escapeHtml(q.question_text || "(ohne Text)")}</span>
      <div class="quiz-question-row-actions">
        <button type="button" data-move-up="${q.id}" title="Nach oben" ${idx === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-move-down="${q.id}" title="Nach unten" ${idx === quizEditQuestions.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-delete-question="${q.id}" title="Löschen">🗑</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-question-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-move-up], [data-move-down], [data-delete-question]")) return;
      openQuestionDialog(row.dataset.questionId);
    });
  });
  list.querySelectorAll("[data-move-up]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    moveQuestion(b.dataset.moveUp, -1);
  }));
  list.querySelectorAll("[data-move-down]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    moveQuestion(b.dataset.moveDown, 1);
  }));
  list.querySelectorAll("[data-delete-question]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteQuestion(b.dataset.deleteQuestion);
  }));
}

async function moveQuestion(questionId, direction) {
  const idx = quizEditQuestions.findIndex((q) => q.id === questionId);
  const swapIdx = idx + direction;
  if (idx < 0 || swapIdx < 0 || swapIdx >= quizEditQuestions.length) return;

  const client = getSupabase();
  const a = quizEditQuestions[idx];
  const b = quizEditQuestions[swapIdx];
  const [aOrder, bOrder] = [a.sort_order, b.sort_order];

  await client.from("quiz_questions").update({ sort_order: bOrder }).eq("id", a.id);
  await client.from("quiz_questions").update({ sort_order: aOrder }).eq("id", b.id);

  await loadQuestions();
}

async function deleteQuestion(questionId) {
  if (!confirm("Diese Frage wirklich löschen?")) return;
  const client = getSupabase();
  const { error } = await client.from("quiz_questions").delete().eq("id", questionId);
  if (error) {
    showStatus(document.getElementById("edit-message"), error.message, "error");
    return;
  }
  await loadQuestions();
}

async function openQuestionDialog(questionId) {
  const existing = questionId ? quizEditQuestions.find((q) => q.id === questionId) : null;
  const result = await showQuizQuestionDialog({
    quizId: quizEditId,
    question: existing,
    options: existing?.quiz_question_options,
  });
  if (!result) return;

  const client = getSupabase();
  const msg = document.getElementById("edit-message");

  if (result.action === "delete") {
    await deleteQuestion(questionId);
    return;
  }

  try {
    let qId = questionId;
    if (existing) {
      const { error } = await client.from("quiz_questions").update({
        question_text: result.question_text,
        image_path: result.image_path,
        answer_mode: result.answer_mode,
        time_limit_sec: result.time_limit_sec,
      }).eq("id", questionId);
      if (error) throw new Error(error.message);

      await client.from("quiz_question_options").delete().eq("question_id", questionId);
    } else {
      const nextOrder = quizEditQuestions.length
        ? Math.max(...quizEditQuestions.map((q) => q.sort_order)) + 1
        : 0;
      const { data, error } = await client.from("quiz_questions").insert({
        quiz_id: quizEditId,
        sort_order: nextOrder,
        question_text: result.question_text,
        image_path: result.image_path,
        answer_mode: result.answer_mode,
        time_limit_sec: result.time_limit_sec,
      }).select().single();
      if (error) throw new Error(error.message);
      qId = data.id;
    }

    const { error: optErr } = await client.from("quiz_question_options").insert(
      result.options.map((o) => ({ ...o, question_id: qId })),
    );
    if (optErr) throw new Error(optErr.message);

    await loadQuestions();
  } catch (err) {
    showStatus(msg, err.message || "Frage konnte nicht gespeichert werden.", "error");
  }
}

async function saveTitle() {
  const client = getSupabase();
  const title = document.getElementById("quiz-title-input").value.trim() || "Ohne Titel";
  document.getElementById("quiz-title-input").value = title;
  document.getElementById("settings-title").value = title;
  await client.from("quizzes").update({ title }).eq("id", quizEditId);
}

async function saveSettings() {
  const client = getSupabase();
  const msg = document.getElementById("settings-message");
  const maxPlayersRaw = document.getElementById("settings-max-players").value;
  const title = document.getElementById("settings-title").value.trim() || "Ohne Titel";
  const payload = {
    title,
    max_players: maxPlayersRaw ? Number(maxPlayersRaw) : null,
    points_mode: document.getElementById("settings-points-mode").value,
    points_per_question: Number(document.getElementById("settings-points-value").value) || 0,
  };
  const { error } = await client.from("quizzes").update(payload).eq("id", quizEditId);
  if (!error) {
    document.getElementById("quiz-title-input").value = title;
    document.getElementById("settings-title").value = title;
  }
  showStatus(msg, error ? error.message : "✓ Gespeichert", error ? "error" : "success");
}

async function startFromEdit(e) {
  const btn = e.currentTarget;
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Starte…",
    successLabel: "✓",
    run: async () => {
      const { data, error } = await client.rpc("create_quiz_session", { p_quiz_id: quizEditId });
      if (error) throw new Error(error.message);
      window.location.href = `/quiz/host.html?session=${encodeURIComponent(data.id)}`;
      return true;
    },
  });
}
