// Videoseite: liest den Eintrag aus politik/beitraege.json. Ist dort "youtube" gesetzt, ersetzt der
// YouTube-Player die Videodatei. Kapitel springen im Player an die passende Stelle.
document.addEventListener("DOMContentLoaded", async () => {
  const player = document.querySelector("[data-video-slug]");
  if (!player) return;
  const slug = player.dataset.videoSlug;

  let entry = null;
  try {
    const res = await fetch("/politik/beitraege.json", { cache: "no-cache" });
    if (res.ok) entry = ((await res.json()).items || []).find((i) => i.slug === slug) || null;
  } catch {
    entry = null;
  }
  if (!entry) return;

  const ytId = youtubeId(entry.youtube);
  if (ytId) {
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?rel=0" title="${escapeAttr(entry.title)}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }

  const list = document.getElementById("video-chapters");
  if (!list || !entry.chapters) return;
  list.innerHTML = entry.chapters
    .map(([t, name]) => `<li><button type="button" class="video-chapter-btn" data-t="${toSeconds(t)}"><span class="video-chapter-time">${t}</span> ${escapeAttr(name)}</button></li>`)
    .join("");
  list.querySelectorAll("[data-t]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = Number(btn.dataset.t);
      const video = player.querySelector("video");
      if (video) {
        video.currentTime = sec;
        video.play();
      } else if (ytId) {
        player.querySelector("iframe").src = `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&autoplay=1&start=${sec}`;
      }
      player.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
});

function youtubeId(value) {
  if (!value) return "";
  const m = String(value).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(value) ? value : "";
}

function toSeconds(t) {
  return String(t).split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

function escapeAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
