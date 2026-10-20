// Trailer oben im Kopfbereich nur auf grossen Bildschirmen (Laptop, stumm, Klick schaltet den Ton ein); auf dem Handy gibt es den Abschnitt «Trailer» mit Steuerung.
(function () {
  const video = document.getElementById("hero-video");
  if (!video) return;
  const wide = window.matchMedia("(min-width: 900px)");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  function start() {
    if (!wide.matches || calm.matches) return;
    if (!video.getAttribute("src")) video.src = "/fpl/trailer.mp4";
    const p = video.play();
    if (p && p.then) p.then(() => video.classList.add("on")).catch(() => {});
  }
  wide.addEventListener("change", () => {
    if (wide.matches) start();
    else {
      video.pause();
      video.classList.remove("on");
    }
  });
  video.addEventListener("click", () => {
    video.muted = !video.muted;
  });
  start();
})();
