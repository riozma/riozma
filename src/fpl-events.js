// FPL-Events: Karte auf /fpl/ (#events-teaser) und Übersicht auf /fpl/event/ (#events-list).
// Daten aus /fpl/event/events.json; neuestes Event zuerst.
(function () {
  const teaser = document.getElementById("events-teaser");
  const list = document.getElementById("events-list");
  if (!teaser && !list) return;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function when(ev) {
    const d = new Date(ev.date + "T12:00:00");
    const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    return [day, ev.time, ev.place].filter(Boolean).join(" · ");
  }

  function badge(ev) {
    if (ev.date === today) return "Today";
    return ev.date > today ? "Upcoming" : "Past";
  }

  // Eine Event-Karte im Stil der Newsletter-Karte
  function card(ev) {
    const a = el("a", "weekly event");
    a.href = ev.url || "/fpl/event/" + ev.slug + "/";
    const text = el("span", "weekly-text");
    text.append(el("small", "", badge(ev) + " · " + when(ev)), el("strong", "", ev.title), el("span", "", ev.summary || ""));
    const go = el("span", "weekly-go", "→");
    go.setAttribute("aria-hidden", "true");
    a.append(text, go);
    return a;
  }

  fetch("/fpl/event/events.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      const events = (data.events || []).slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
      if (teaser && events.length) {
        teaser.replaceChildren(card(events[0]), Object.assign(el("a", "weekly-all", "All events →"), { href: "/fpl/event/" }));
        teaser.hidden = false;
      }
      if (list) {
        if (!events.length) return list.replaceChildren(el("p", "status", "No events yet."));
        const wrap = el("div", "event-list");
        events.forEach((ev) => wrap.append(card(ev)));
        list.replaceChildren(wrap);
      }
    })
    .catch(() => {
      if (list) list.replaceChildren(el("p", "status", "Could not load the events. Please reload the page."));
    });
})();
