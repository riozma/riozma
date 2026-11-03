/* "What a study says": per question, key findings of the Digital Next Gen Trendmonitor 2026
   (Bauen digital Schweiz / buildingSMART Switzerland, May 2026). Page numbers are the printed
   page numbers; the PDF page is one higher (cover page). */

const FPL_STUDY = {
  title: "Digital Next Gen Trendmonitor 2026",
  by: "Bauen digital Schweiz / buildingSMART Switzerland, May 2026",
  sample: "Survey of 69 professionals from Swiss construction (pom+), plus expert workshops",
  pdf: "https://bauen-digital.ch/download/digital-next-gen-trendmonitor-2026/?tmstv=1793684938",
  page: "https://bauen-digital.ch/publikationen/",
};

const FPL_STUDY_Q = {
  1: {
    teaser: "Bottom-up from pain points, or stuck in the pilot trap",
    chart: {
      title: "Who drives digital initiatives?",
      unit: "% of companies, by company size",
      page: 13,
      rows: [
        { label: "Management (top-down)", value: 30, text: "28–33%" },
        { label: "Core business (bottom-up)", value: 25, text: "≈25%", hi: true },
        { label: "Innovation department", value: 22, text: "21–23%" },
        { label: "No clear driver (SMEs)", value: 12, text: "10–15%" },
      ],
    },
    facts: [
      { text: "Use cases emerge in the departments themselves, out of concrete day-to-day pain.", page: 13 },
      { text: "Companies mostly react with training and process optimisation. Buying new technology (9–12%) or investing more (<9%) is rare.", page: 16 },
      { text: "Pilot trap: missing standards (e.g. openBIM workflows) are used as a reason to postpone. Often analog processes are only copied into digital tools (“electronic paper”).", page: 33 },
      { text: "Recommendation: tie every use case to hard KPIs (project margin, lead time, risk) and budget 3–5% of revenue for innovation.", page: 35 },
    ],
  },
  2: {
    teaser: "71% expect a lot from AI, only 20% use it productively",
    chart: {
      title: "AI & machine learning",
      unit: "% of respondents",
      page: 19,
      rows: [
        { label: "Expect high or very high benefit", value: 71, text: "71%" },
        { label: "Already in productive use", value: 20, text: "20%", hi: true, page: 34 },
        { label: "See it at the peak of the hype", value: 24, text: "24%", page: 23 },
        { label: "See it on the slope of enlightenment", value: 29, text: "29%", page: 23 },
      ],
    },
    facts: [
      { text: "Use cases in planning today: project audits of contracts and minutes, 4D logistics planning, finding gaps in tenders.", page: 24 },
      { text: "In operation: pre-filtering drone images for cracks and corrosion, predictive maintenance, extracting data from invoices and defect lists.", page: 26 },
      { text: "“Context is King”: results depend less on the algorithm than on how well the AI understands the project context. Smart algorithms fail on unstructured data.", page: 24 },
      { text: "Risks: bias, and loss of skills when engineers can no longer check AI suggestions for plausibility. For safety-critical decisions, a human decides.", page: 25 },
    ],
  },
  3: {
    teaser: "Costs, data and standards, not a lack of people",
    chart: {
      title: "Rated a major barrier",
      unit: "% of respondents",
      page: 15,
      rows: [
        { label: "Investment & costs", value: 38, text: "38%", hi: true },
        { label: "Data availability, security, ownership", value: 36, text: "36%" },
        { label: "No common standards & interoperability", value: 34, text: "34%" },
        { label: "Legacy systems", value: 30, text: "30%" },
        { label: "Skills shortage & turnover", value: 21, text: "21%", page: 16 },
      ],
    },
    facts: [
      { text: "Paradox: costs are the top barrier, yet about half of the companies invest at most 1% of revenue. Most of it goes into keeping old systems running.", page: 32 },
      { text: "Not a skills shortage but a skills deployment problem: digital talents are hired, then meet rigid, analog structures.", page: 32 },
      { text: "Data silos between planning, construction and operation, no data strategies, no data architects.", page: 26 },
      { text: "Open legal questions: liability for AI-supported decisions and contracts for shared data pools.", page: 35 },
    ],
  },
  4: {
    teaser: "Platforms & BIM, AI & data, industrial prefabrication",
    chart: {
      title: "High or very high business benefit",
      unit: "% of respondents",
      page: 18,
      rows: [
        { label: "Platforms & portals", value: 84, text: "84%", hi: true },
        { label: "BIM", value: 75, text: "≈75%", page: 19 },
        { label: "Data analytics", value: 71, text: "71%", page: 19 },
        { label: "AI & machine learning", value: 71, text: "71%", page: 19 },
        { label: "Robotics & drones", value: 46, text: "46%", page: 19 },
        { label: "Sensors (IoT)", value: 41, text: "41%", page: 19 },
        { label: "VR & AR", value: 35, text: "≈35%", page: 19 },
        { label: "3D printing, smart materials, blockchain", value: 12, text: "9–15%", page: 19 },
      ],
    },
    facts: [
      { text: "The report’s three: platforms and BIM as the standard, AI and data analytics, and individualised serial prefabrication where the model drives the machine directly.", page: 30 },
      { text: "Robotics is more mature than expected: 23% place robots and drones on the plateau of productivity.", page: 23 },
      { text: "Watchlist only: 3D printing, smart materials and blockchain have no proven business case yet.", page: 37 },
      { text: "Productivity is the main goal (83%). New business models matter to only 30%.", page: 11 },
    ],
  },
  5: {
    teaser: "Data skills and judgement, but nothing about studies",
    chart: {
      title: "Share of digital talent in construction",
      unit: "% of the workforce (LinkedIn data)",
      page: 8,
      rows: [
        { label: "2023", value: 1.2, text: "1.2%" },
        { label: "2025", value: 1.6, text: "1.6%", hi: true },
      ],
      max: 2,
      note: "Still the lowest density of all sectors, but the fastest growth.",
    },
    facts: [
      { text: "New profiles wanted: data architects, prompt engineers, integration specialists.", page: 36 },
      { text: "Preparing and structuring data is the key skill; “data hygiene” for contracts, standards and plans.", page: 24 },
      { text: "Being able to check AI results for plausibility, so planning skills are not lost.", page: 25 },
      { text: "Thinking of the 3D model as a parts list for prefabrication, not only as a visualisation.", page: 36 },
      { text: "The report says nothing about how to learn this during your studies. That part is up to us.", gap: true },
    ],
  },
};

const fplStudyOpen = new Set();

function fplStudyPageLink(page) {
  const a = fplEl("a", "study-p", "p. " + page);
  a.href = FPL_STUDY.pdf + "#page=" + (page + 1);
  a.target = "_blank";
  a.rel = "noopener";
  a.title = "Open the report at page " + page;
  return a;
}

function fplStudyEl(q) {
  const data = FPL_STUDY_Q[q];
  if (!data) return null;
  const box = fplEl("details", "study");
  box.open = fplStudyOpen.has(q);
  box.addEventListener("toggle", () => (box.open ? fplStudyOpen.add(q) : fplStudyOpen.delete(q)));

  const sum = fplEl("summary");
  sum.append(fplEl("span", "study-tag", "What a study says"), fplEl("span", "study-teaser", data.teaser));
  box.append(sum);

  const c = data.chart;
  const fig = fplEl("figure", "study-chart");
  const cap = fplEl("figcaption");
  cap.append(fplEl("strong", "", c.title), fplEl("span", "", " · " + c.unit + " · "), fplStudyPageLink(c.page));
  fig.append(cap);
  const max = c.max || 100;
  c.rows.forEach((r) => {
    const row = fplEl("div", "bar-row" + (r.hi ? " hi" : ""));
    const track = fplEl("div", "bar-track");
    const fill = fplEl("i");
    fill.style.width = Math.max(2, (r.value / max) * 100) + "%";
    track.append(fill);
    row.append(fplEl("span", "bar-label", r.label), track, fplEl("span", "bar-val", r.text));
    fig.append(row);
  });
  if (c.note) fig.append(fplEl("p", "study-note", c.note));
  box.append(fig);

  const ul = fplEl("ul", "study-facts");
  data.facts.forEach((f) => {
    const li = fplEl("li", f.gap ? "gap" : "", f.text + " ");
    if (f.page) li.append(fplStudyPageLink(f.page));
    ul.append(li);
  });
  box.append(ul);

  const src = fplEl("p", "study-src");
  const a = fplEl("a", "", FPL_STUDY.title);
  a.href = FPL_STUDY.pdf;
  a.target = "_blank";
  a.rel = "noopener";
  src.append("Source: ", a, " (PDF, German), " + FPL_STUDY.by + ". " + FPL_STUDY.sample + ".");
  box.append(src);
  return box;
}
