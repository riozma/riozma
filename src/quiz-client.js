const QUIZ_TILE_STYLES = [
  { color: "#e21b3c", shape: "triangle" },
  { color: "#1368ce", shape: "diamond" },
  { color: "#d89e00", shape: "circle" },
  { color: "#26890c", shape: "square" },
];

function quizShapeSvg(shape) {
  switch (shape) {
    case "triangle":
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 L22 21 L2 21 Z"/></svg>';
    case "diamond":
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 L22 12 L12 22 L2 12 Z"/></svg>';
    case "circle":
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>';
    case "square":
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18"/></svg>';
    default:
      return "";
  }
}

function getQuizClientToken() {
  const KEY = "quiz_client_token";
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(KEY, token);
  }
  return token;
}

function quizImageUrl(path) {
  return path ? storagePublicUrl("quiz-images", path) : "";
}

function quizJoinUrl(code) {
  // Param must not be named/contain "code" — site-init.js treats any "?...code=..." as an
  // OAuth PKCE return and redirects away before this page's own script can read it.
  return siteUrl(`/quiz/join.html?c=${encodeURIComponent(code)}`);
}

const QUIZ_POINTS_MODE_LABELS = {
  speed: "Geschwindigkeit (wie Kahoot)",
  fixed: "Fixe Punktzahl",
  none: "Keine Punkte (nur richtig/falsch)",
};

function quizFormatScore(n) {
  return new Intl.NumberFormat("de-CH").format(Math.round(n || 0));
}

const QUIZ_QUESTION_TYPES = {
  standard: { label: "Standard (richtig/falsch vorgegeben)" },
  majority: { label: "Mehrheitsfrage (Mehrheit entscheidet)" },
  vote_player: { label: "Wer würde eher … (Spieler wählen)" },
  open_text: { label: "Freitext + Publikumswahl" },
};

function quizIntroDelaySec(questionText) {
  const len = (questionText || "").trim().length;
  if (len <= 40) return 3;
  if (len <= 90) return 4;
  return 5;
}

const QUIZ_RING_RADIUS = 18;
const QUIZ_RING_CIRCUMFERENCE = 2 * Math.PI * QUIZ_RING_RADIUS;

function quizRingSvg() {
  return `
    <svg class="quiz-intro-ring" viewBox="0 0 44 44">
      <circle class="quiz-intro-ring-bg" cx="22" cy="22" r="${QUIZ_RING_RADIUS}"></circle>
      <circle class="quiz-intro-ring-fg" cx="22" cy="22" r="${QUIZ_RING_RADIUS}"></circle>
    </svg>`;
}

// Draws a countdown ring that empties from "now" until totalSec after startedAt.
// Safe to call again after a reload — it resumes at the correct remaining fraction.
function quizStartRingCountdown(container, startedAt, totalSec) {
  if (!container || !totalSec) return;
  container.innerHTML = quizRingSvg();
  const fg = container.querySelector(".quiz-intro-ring-fg");
  const elapsedSec = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : 0;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const elapsedFrac = Math.min(1, Math.max(0, 1 - remainingSec / totalSec));

  fg.style.strokeDasharray = `${QUIZ_RING_CIRCUMFERENCE}`;
  fg.style.transition = "none";
  fg.style.strokeDashoffset = `${QUIZ_RING_CIRCUMFERENCE * elapsedFrac}`;
  void fg.getBoundingClientRect();
  fg.style.transition = `stroke-dashoffset ${remainingSec}s linear`;
  requestAnimationFrame(() => {
    fg.style.strokeDashoffset = `${QUIZ_RING_CIRCUMFERENCE}`;
  });
}
