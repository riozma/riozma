let quizLibrarySession = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initAuthUI({
    mode: "full",
    loginContainerId: "auth-container",
    leadText: "Melde dich an, um deine Quizzes zu verwalten.",
    onAuthChange: async (session) => {
      quizLibrarySession = session;
      const loginSection = document.getElementById("login-section");
      const dashboardSection = document.getElementById("dashboard-section");
      if (session) {
        loginSection.classList.add("d-none");
        dashboardSection.classList.remove("d-none");
        renderDashboardAuth(session);
        await loadQuizzes();
        bindNewQuizButton();
      } else {
        loginSection.classList.remove("d-none");
        dashboardSection.classList.add("d-none");
        renderDashboardAuth(null);
      }
    },
  });
});

function bindNewQuizButton() {
  const btn = document.getElementById("btn-new-quiz");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => createNewQuizFromLibrary(btn));
}

async function createNewQuizFromLibrary(btn) {
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Erstelle…",
    successLabel: "✓",
    run: async () => {
      const { data, error } = await client
        .from("quizzes")
        .insert({ owner_id: quizLibrarySession.user.id, title: "Neues Quiz" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      window.location.href = `/quiz/edit.html?id=${encodeURIComponent(data.id)}`;
      return true;
    },
  });
}

async function loadQuizzes() {
  const client = getSupabase();
  const grid = document.getElementById("quiz-library-grid");
  const msg = document.getElementById("library-message");

  const { data: quizzes, error } = await client
    .from("quizzes")
    .select("*")
    .eq("owner_id", quizLibrarySession.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    showStatus(msg, error.message, "error");
    return;
  }

  if (!quizzes.length) {
    grid.innerHTML = `<p class="text-muted">Noch keine Quizzes – erstelle dein erstes Quiz.</p>`;
    return;
  }

  const { data: counts } = await client
    .from("quiz_questions")
    .select("quiz_id")
    .in("quiz_id", quizzes.map((q) => q.id));
  const countMap = {};
  (counts || []).forEach((r) => {
    countMap[r.quiz_id] = (countMap[r.quiz_id] || 0) + 1;
  });

  grid.innerHTML = quizzes.map((q) => renderQuizCard(q, countMap[q.id] || 0)).join("");

  grid.querySelectorAll("[data-start-quiz]").forEach((b) => {
    b.addEventListener("click", () => startQuizSession(b.dataset.startQuiz, b));
  });
  grid.querySelectorAll("[data-delete-quiz]").forEach((b) => {
    b.addEventListener("click", () => deleteQuiz(b.dataset.deleteQuiz, b));
  });
}

function renderQuizCard(quiz, questionCount) {
  return `
    <article class="quiz-library-card">
      <h3>${escapeHtml(quiz.title || "Ohne Titel")}</h3>
      <p class="quiz-library-card-meta">${questionCount} Frage${questionCount === 1 ? "" : "n"}</p>
      <div class="quiz-library-card-actions">
        <a class="btn btn-sm btn-outline-secondary" href="/quiz/edit.html?id=${encodeURIComponent(quiz.id)}">Bearbeiten</a>
        <button type="button" class="btn btn-sm btn-primary" data-start-quiz="${quiz.id}" ${questionCount ? "" : "disabled title=\"Erst Fragen hinzufügen\""}>Starten</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-delete-quiz="${quiz.id}">Löschen</button>
      </div>
    </article>`;
}

async function startQuizSession(quizId, btn) {
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Starte…",
    successLabel: "✓",
    run: async () => {
      const { data, error } = await client.rpc("create_quiz_session", { p_quiz_id: quizId });
      if (error) throw new Error(error.message);
      window.location.href = `/quiz/host.html?session=${encodeURIComponent(data.id)}`;
      return true;
    },
  });
}

async function deleteQuiz(quizId, btn) {
  if (!confirm("Dieses Quiz wirklich unwiderruflich löschen?")) return;
  const client = getSupabase();
  await withActionFeedback({
    button: btn,
    loadingLabel: "Löschen…",
    successLabel: "✓ Gelöscht",
    run: async () => {
      const { error } = await client.from("quizzes").delete().eq("id", quizId);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: loadQuizzes,
  });
}
