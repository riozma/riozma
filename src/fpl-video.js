// Trailer-Spalt (nur Laptop, ab 900 px): Linie -> öffnet sich nach unten, sobald das Video geladen ist
// -> spielt einmal -> schliesst sich wieder zur Linie. Hover = kurzes Anlupfen, Klick = nochmal abspielen.
// Während es läuft: Pause/Weiter, Ton und Schliessen über die Knöpfe unten links (Klick aufs Video oder Leertaste pausiert ebenfalls).
// Auf dem Handy gibt es stattdessen den Abschnitt «Trailer» mit eigener Steuerung.
(function () {
  const slit = document.getElementById("slit");
  const video = document.getElementById("hero-video");
  if (!slit || !video) return;
  const wide = window.matchMedia("(min-width: 900px)");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  let ready = false;
  let started = false;

  // Steuerung
  const bar = document.createElement("div");
  bar.className = "slit-ctrl";
  function ctrlButton(label, text) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.textContent = text;
    return b;
  }
  const pauseBtn = ctrlButton("Pause", "❚❚");
  const soundBtn = ctrlButton("Sound on", "🔇");
  const closeBtn = ctrlButton("Close trailer", "✕");
  bar.append(pauseBtn, soundBtn, closeBtn);
  slit.querySelector(".slit-inner").append(bar);

  function paintControls() {
    const paused = video.paused;
    pauseBtn.textContent = paused ? "▶" : "❚❚";
    pauseBtn.setAttribute("aria-label", paused ? "Play" : "Pause");
    pauseBtn.title = paused ? "Play" : "Pause";
    soundBtn.textContent = video.muted ? "🔇" : "🔊";
    soundBtn.setAttribute("aria-label", video.muted ? "Sound on" : "Sound off");
    soundBtn.title = video.muted ? "Sound on" : "Sound off";
  }

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

  function togglePause() {
    if (video.paused) video.play();
    else video.pause();
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

  ["play", "pause", "volumechange"].forEach((ev) => video.addEventListener(ev, paintControls));
  video.addEventListener("ended", () => {
    slit.classList.remove("playing");
    setState("closed");
  });

  pauseBtn.addEventListener("click", togglePause);
  soundBtn.addEventListener("click", () => {
    video.muted = !video.muted;
  });
  closeBtn.addEventListener("click", () => {
    video.pause();
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
      togglePause(); // Klick auf das Video: Pause/Weiter
    }
  }

  slit.addEventListener("click", (e) => {
    if (e.target.closest(".slit-ctrl")) return; // Knöpfe machen ihr eigenes Ding
    activate();
  });
  slit.addEventListener("keydown", (e) => {
    if (e.target.closest(".slit-ctrl")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });

  paintControls();
  if (wide.matches) load();
  wide.addEventListener("change", () => {
    if (wide.matches) load();
    else {
      video.pause();
      setState("closed");
    }
  });
})();
