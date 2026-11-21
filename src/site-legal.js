// Gemeinsam für alle Seiten: Plausible-Statistik (ohne Cookies, ohne persönliche Daten)
// und Links zu Impressum und Datenschutz im Footer.
(function () {
  "use strict";

  // Statistik nur auf der echten Seite zählen, nicht lokal oder in Vorschauen.
  var isProduction = location.hostname === "riozma.ch";
  var optOut = false;
  try { optOut = localStorage.getItem("plausible_ignore") === "true"; } catch (e) {}

  if (isProduction && !optOut) {
    var s = document.createElement("script");
    s.defer = true;
    s.setAttribute("data-domain", "riozma.ch");
    s.src = "https://plausible.io/js/script.js";
    document.head.appendChild(s);
  }

  function addLegalLinks() {
    if (document.documentElement.classList.contains("embed")) return;
    var footers = document.querySelectorAll(".site-footer");
    for (var i = 0; i < footers.length; i++) {
      if (footers[i].querySelector(".site-legal")) continue;
      var p = document.createElement("p");
      p.className = "site-legal";
      p.innerHTML = '<a href="/impressum/">Impressum</a> · <a href="/datenschutz/">Datenschutz</a>';
      footers[i].appendChild(p);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addLegalLinks);
  else addLegalLinks();
})();
