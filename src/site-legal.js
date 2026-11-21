// Gemeinsam für alle Seiten: GoatCounter-Statistik (ohne Cookies, ohne persönliche Daten)
// und Links zu Impressum und Datenschutz im Footer.
(function () {
  "use strict";

  // Statistik nur auf der echten Seite zählen, nicht lokal oder in Vorschauen.
  // Eigene Besuche ausschliessen: in der Konsole localStorage.skipgc = "t" setzen.
  if (location.hostname === "riozma.ch") {
    var s = document.createElement("script");
    s.async = true;
    s.setAttribute("data-goatcounter", "https://riozma.goatcounter.com/count");
    s.src = "https://gc.zgo.at/count.js";
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
