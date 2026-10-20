// Trailer-Spalt (nur Laptop, ab 900 px): Linie -> öffnet sich nach oben/unten, sobald das Video geladen ist
// -> spielt einmal -> schliesst sich wieder zur Linie. Hover = kurzes Anlupfen, Klick = nochmal abspielen.
// Auf dem Handy gibt es stattdessen den Abschnitt «Trailer» mit Steuerung.
(function () {
  const slit = document.getElementById("slit");
  const video = document.getElementById("hero-video");
  if (!slit || !video) return;
  const wide = window.matchMedia("(min-width: 900px)");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  let ready = false;
  let started = false;

  function setState(state) {
    slit.classList.toggle("open", state === "open");
    slit.classList.toggle("closed", state !== "open");
    slit.classList.toggle("loading", state === "loading");
    slit.setAttribute("aria-label", state === "open" ? "Trailer" : "Play the trailer");
  }

  function play() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    video.currentTime = 0;
    setState("open");
    slit.classList.add("playing");
    const p = video.play();
    if (p && p.catch) p.catch(() => setState("closed"));
  }

  function load() {
    if (started) return;
    started = true;
    setState("loading");
    video.src = "/fpl/trailer.mp4";
    video.preload = "auto";
    video.load();
    const onReady = () => {
      if (ready) return;
      ready = true;
      setState("closed");
      if (wide.matches && !calm.matches) setTimeout(play, 350);
    };
    video.addEventListener("canplaythrough", onReady, { once: true });
    video.addEventListener("error", () => setState("closed"), { once: true });
  }

  video.addEventListener("ended", () => {
    slit.classList.remove("playing");
    setState("closed");
  });

  function activate() {
    if (!started) {
      load();
      const wait = () => { if (ready) play(); else setTimeout(wait, 150); };
      wait();
      return;
    }
    if (!slit.classList.contains("open")) {
      if (ready) play();
    } else {
      video.muted = !video.muted; // Klick auf das laufende Video: Ton an/aus
    }
  }

  slit.addEventListener("click", activate);
  slit.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });

  if (wide.matches) load();
  wide.addEventListener("change", () => {
    if (wide.matches) load();
    else {
      video.pause();
      setState("closed");
    }
  });
})();
