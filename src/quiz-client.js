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
  return siteUrl(`/quiz/join.html?code=${encodeURIComponent(code)}`);
}

const QUIZ_POINTS_MODE_LABELS = {
  speed: "Geschwindigkeit (wie Kahoot)",
  fixed: "Fixe Punktzahl",
  none: "Keine Punkte (nur richtig/falsch)",
};

function quizFormatScore(n) {
  return new Intl.NumberFormat("de-CH").format(Math.round(n || 0));
}
