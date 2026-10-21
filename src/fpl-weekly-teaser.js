// Block «FPL Weekly» auf /fpl/: zeigt die neueste Ausgabe aus /fpl/weekly/issues/index.json.
(function () {
  const box = document.getElementById("weekly-teaser");
  if (!box) return;
  fetch("/fpl/weekly/issues/index.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      const issues = (data.issues || []).slice().sort((a, b) => b.week.localeCompare(a.week));
      if (!issues.length) return;
      const i = issues[0];
      const a = document.createElement("a");
      a.className = "weekly";
      a.href = "/fpl/weekly/" + i.week + "/";
      const text = document.createElement("span");
      text.className = "weekly-text";
      const kicker = document.createElement("small");
      kicker.textContent = "FPL Weekly #" + i.issue + " · Week " + Number(i.week.split("-")[1]);
      const title = document.createElement("strong");
      title.textContent = i.title;
      const sum = document.createElement("span");
      sum.textContent = i.summary;
      text.append(kicker, title, sum);
      const go = document.createElement("span");
      go.className = "weekly-go";
      go.setAttribute("aria-hidden", "true");
      go.textContent = "→";
      a.append(text, go);
      const all = document.createElement("a");
      all.className = "weekly-all";
      all.href = "/fpl/weekly/";
      all.textContent = "All issues, learning path and glossary →";
      box.replaceChildren(a, all);
      box.hidden = false;
    })
    .catch(() => {});
})();
