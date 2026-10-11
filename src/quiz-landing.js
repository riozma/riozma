let quizLandingSession = null;

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("quiz-auth-container");
  const toggle = document.getElementById("quiz-auth-toggle");
  let formOpen = false;

  function syncAuthUi() {
    const loggedIn = !!quizLandingSession;
    toggle.classList.toggle("d-none", loggedIn);
    container.classList.toggle("quiz-auth-card", !loggedIn);
    container.classList.toggle("d-none", !loggedIn && !formOpen);
  }

  toggle.addEventListener("click", () => {
    formOpen = !formOpen;
    syncAuthUi();
  });

  await initAuthUI({
    mode: "full",
    loginContainerId: "quiz-auth-container",
    leadText: "Melde dich an, um Quizzes zu erstellen und zu hosten.",
    onAuthChange: (session) => {
      quizLandingSession = session;
      document.getElementById("quiz-owner-actions").classList.toggle("d-none", !session);
      syncAuthUi();
    },
  });

  document.getElementById("quiz-btn-create").addEventListener("click", createNewQuiz);
});

async function createNewQuiz(e) {
  const btn = e.currentTarget;
  if (!quizLandingSession) return;
  const client = getSupabase();
  const snapshot = { text: btn.textContent, disabled: btn.disabled };
  btn.disabled = true;
  btn.textContent = "Erstelle…";
  try {
    const { data, error } = await client
      .from("quizzes")
      .insert({ owner_id: quizLandingSession.user.id, title: "Neues Quiz" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    window.location.href = `/quiz/edit.html?id=${encodeURIComponent(data.id)}`;
  } catch (err) {
    btn.disabled = snapshot.disabled;
    btn.textContent = snapshot.text;
    alert(err.message || "Quiz konnte nicht erstellt werden.");
  }
}
