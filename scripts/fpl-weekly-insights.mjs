#!/usr/bin/env node
// FPL Weekly Insights: Redaktionsplan für die nächste Ausgabe aus den Nutzungszahlen.
//
// Idee (einfach gehalten): Aus Klicks auf Originalquellen, Reaktionen, Kommentaren und Öffnen wird je Rubrik, Region,
// Thema und Quelle ein geglätteter Interessenwert berechnet (neuere Wochen zählen mehr). Daraus entsteht ein Plan mit
// Themenplätzen. Ein fester Teil der Plätze ist bewusst "Entdecken": Bereiche, die zuletzt wenig vorkamen. So verengt
// sich der Newsletter nicht auf das, was ohnehin geklickt wird (kein Filterblasen-Effekt). Qualitätsregeln gelten immer,
// unabhängig von den Zahlen.
//
//   node scripts/fpl-weekly-insights.mjs            lesbare Zusammenfassung und JSON
//   node scripts/fpl-weekly-insights.mjs --json     nur JSON
//   node scripts/fpl-weekly-insights.mjs --no-network   ohne Abruf der Zahlen (Kaltstart-Plan)
//   node scripts/fpl-weekly-insights.mjs --slots 8  Anzahl News-Plätze (Standard 7)
//
// Die Zahlen kommen aus der Supabase-Funktion fplw_stats (nur Summen, keine personenbezogenen Daten).

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ISSUES = path.join(ROOT, "fpl/weekly/issues");
const args = process.argv.slice(2);
const JSON_ONLY = args.includes("--json");
const NO_NET = args.includes("--no-network");
const SLOTS = Number(args[args.indexOf("--slots") + 1]) || 7;

const CATEGORIES = ["digital", "robotics", "circular", "swiss", "market"];
const REGIONS = ["CH", "EU", "UK", "US", "Asia", "Global"];
const HALF_LIFE_WEEKS = 6; // Nach 6 Wochen zählt eine Ausgabe nur noch halb
const K = 5; // Glättung: wenige Zahlen ziehen zum Durchschnitt
const SOURCE_WEIGHT = { primary: 1, trade: 0.9, general: 0.7, branded: 0.4 }; // Qualität gewichtet Klicks, nie umgekehrt
const MAX_PER_CATEGORY = 3;
const MAX_PER_DOMAIN = 2;

const RULES = [
  "Every item links to the original source or the best available source; prefer primary sources, then specialist press.",
  "Zahlen nie über Qualität stellen: Beiträge werden nicht übernommen, weil sie geklickt werden, sondern weil sie stimmen und etwas erklären.",
  "Branded or sponsored content only as a last resort and always labelled; it never fills an 'explore' slot.",
  "At most 2 items per source domain per issue; at least half of the items from primary or trade sources.",
  "At least 1 Swiss item (if there is one worth reading) and at least 2 items from outside Europe/Switzerland per issue.",
  "Every item gets a 'background' box: assume the reader does not know the small or international company.",
  "The explore share is never below 25 percent of the slots, whatever the numbers say.",
  "Background is specific to the article: what the (small) company does and how it works, or how the thing was handled so far; never a generic definition.",
  "Focus: normally the best curriculum candidate; if something fundamental happened this week, a 'breaking' focus (no concept_id) may replace it, never twice in a row.",
];

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const domainOf = (u) => new URL(u).hostname.replace(/^www\./, "");

function isoWeekStart(week) {
  const [y, w] = week.split("-").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  return new Date(jan4.getTime() + ((w - 1) * 7 - (day - 1)) * 86400000);
}

async function loadIssues() {
  const dirs = (await readdir(ISSUES, { withFileTypes: true })).filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  const out = [];
  for (const week of dirs) {
    try {
      out.push({ week, ...(await readJson(path.join(ISSUES, week, "issue.json"))) });
    } catch { /* kaputte Ausgabe überspringen */ }
  }
  return out;
}

async function loadStats() {
  if (NO_NET) return [];
  try {
    const cfg = await readFile(path.join(ROOT, "src/supabase-config.js"), "utf8");
    const url = cfg.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
    const key = cfg.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
    const res = await fetch(`${url}/rest/v1/rpc/fplw_stats`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (e) {
    console.error(`(stats unavailable: ${e.message}, planning without usage data)`);
    return [];
  }
}

// Gemeinsame Zähllogik mit dem Renderer (src/fpl-weekly.js, rankNews): Klick 3, Reaktion 2, Kommentar 2, Öffnen 1
const engagement = (s) => 3 * (+s.clicks || 0) + 2 * (+s.reactions || 0) + 2 * (+s.comments || 0) + (+s.opens || 0);

function newArm() {
  return { items: 0, exposure: 0, engagement: 0 };
}

function addTo(map, key, w, views, e) {
  if (!key) return;
  const a = map.get(key) || newArm();
  a.items += w;
  a.exposure += w * Math.max(views, 1);
  a.engagement += w * e;
  map.set(key, a);
}

function score(arm, globalRate, totalItems, exploreC) {
  const rate = (arm.engagement + K * globalRate) / (arm.exposure + K);
  const bonus = exploreC * Math.sqrt(Math.log(totalItems + 2) / (arm.items + 1));
  return { rate, bonus, ucb: rate + bonus };
}

function entropy(values) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum || values.length < 2) return 1;
  const h = -values.reduce((a, v) => (v > 0 ? a + (v / sum) * Math.log(v / sum) : a), 0);
  return h / Math.log(values.length);
}

async function main() {
  const [issues, rawStats, curriculum] = await Promise.all([loadIssues(), loadStats(), readJson(path.join(ROOT, "fpl/weekly/curriculum.json"))]);
  const now = Date.now();
  const stats = new Map();
  rawStats.forEach((r) => stats.set(`${r.issue}|${r.target}`, r));

  const cats = new Map(CATEGORIES.map((c) => [c, newArm()]));
  const regions = new Map(REGIONS.map((r) => [r, newArm()]));
  const topics = new Map();
  const domains = new Map();
  const domainMeta = new Map();
  let totalViews = 0;
  let totalWeight = 0;
  let totalEngagement = 0;
  let totalExposure = 0;

  for (const issue of issues) {
    const ageWeeks = Math.max(0, (now - isoWeekStart(issue.week).getTime()) / (7 * 86400000));
    const w = Math.pow(0.5, ageWeeks / HALF_LIFE_WEEKS);
    const views = Math.max(0, ...rawStats.filter((r) => r.issue === issue.week).map((r) => +r.views || 0));
    totalViews += views;
    for (const n of issue.news) {
      const s = stats.get(`${issue.week}|news:${n.id}`) || {};
      const quality = SOURCE_WEIGHT[n.source_type] ?? 0.7;
      const e = engagement(s) * quality;
      const dom = domainOf(n.source_url);
      addTo(cats, n.category, w, views, e);
      addTo(regions, n.region, w, views, e);
      (n.topics || []).forEach((t) => addTo(topics, t, w, views, e));
      addTo(domains, dom, w, views, e);
      domainMeta.set(dom, n.source_type);
      totalWeight += w;
      totalEngagement += w * e;
      totalExposure += w * Math.max(views, 1);
    }
  }

  const coldStart = totalViews < 20;
  const globalRate = totalExposure ? totalEngagement / totalExposure : 0;
  const concentration = entropy(CATEGORIES.map((c) => cats.get(c).engagement));
  // Je einseitiger das Interesse, desto mehr wird bewusst Neues gesucht
  const exploreShare = coldStart ? 0.4 : concentration < 0.75 ? 0.4 : 0.25;
  const exploreC = (globalRate || 0.05) * (concentration < 0.75 ? 3 : 2) + 0.02;

  const catScores = CATEGORIES.map((c) => ({ category: c, ...score(cats.get(c), globalRate, totalWeight, exploreC), recent_items: +cats.get(c).items.toFixed(2) }));
  const exploreSlots = Math.max(2, Math.round(SLOTS * exploreShare));
  const exploitSlots = SLOTS - exploreSlots;

  // Plätze: jede Rubrik mindestens 1 (Abdeckung), Rest nach UCB bis höchstens 3 je Rubrik; die am wenigsten gezeigten Rubriken erhalten "explore".
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 1]));
  const slotsLeft = SLOTS - CATEGORIES.length;
  for (let i = 0; i < slotsLeft; i++) {
    const cap = coldStart || concentration < 0.75 ? MAX_PER_CATEGORY - 1 : MAX_PER_CATEGORY; // bei einseitigem Interesse höchstens 2 je Rubrik
    const open = catScores.filter((c) => counts[c.category] < cap).sort((a, b) => b.ucb - a.ucb);
    if (!open.length) break;
    counts[open[0].category]++;
  }
  const leastShown = catScores.slice().sort((a, b) => a.recent_items - b.recent_items || a.rate - b.rate).map((c) => c.category);
  const slots = [];
  const exploreFor = new Set(leastShown.slice(0, exploreSlots));
  for (const c of catScores.slice().sort((a, b) => b.ucb - a.ucb)) {
    for (let i = 0; i < counts[c.category]; i++) {
      const explore = exploreFor.has(c.category) && i === 0;
      slots.push({
        category: c.category,
        mode: explore ? "explore" : "exploit",
        note: explore
          ? "Explore: choose a story from a region or topic that has not appeared in recent issues; no click data is used for this slot."
          : "Exploit: topics and sources that readers engaged with, but a new angle, not a repeat.",
      });
    }
  }

  const regionScores = REGIONS.map((r) => ({ region: r, ...score(regions.get(r), globalRate, totalWeight, exploreC), recent_items: +regions.get(r).items.toFixed(2) }));
  const underRegions = regionScores.slice().sort((a, b) => a.recent_items - b.recent_items).slice(0, 2).map((r) => r.region);

  const topicRows = [...topics.entries()].map(([t, a]) => ({ topic: t, ...score(a, globalRate, totalWeight, exploreC), recent_items: +a.items.toFixed(2) }));
  const trending = topicRows.filter((t) => !coldStart).sort((a, b) => b.rate - a.rate).slice(0, 5).map((t) => t.topic);
  const underexplored = topicRows.sort((a, b) => a.recent_items - b.recent_items).slice(0, 6).map((t) => t.topic);

  const domainRows = [...domains.entries()].map(([d, a]) => ({ domain: d, type: domainMeta.get(d), ...score(a, globalRate, totalWeight, 0), recent_items: +a.items.toFixed(2) }));
  const preferred = domainRows.filter((d) => !coldStart && d.type !== "branded").sort((a, b) => b.rate - a.rate).slice(0, 5).map((d) => d.domain);
  const overused = domainRows.filter((d) => d.recent_items >= 2.5).map((d) => d.domain);

  // Fokus-Thema: nächste freie Konzepte; Modul-Interesse aus Reaktionen/Kommentaren zu früheren Fokus-Themen plus Entdecken
  const published = new Set(curriculum.concepts.filter((c) => c.status === "published").map((c) => c.id));
  const moduleStats = new Map(curriculum.modules.map((m) => [m.id, newArm()]));
  for (const issue of issues) {
    const concept = curriculum.concepts.find((c) => c.id === issue.focus.concept_id);
    if (!concept) continue;
    const s = stats.get(`${issue.week}|focus`) || {};
    const views = Math.max(0, ...rawStats.filter((r) => r.issue === issue.week).map((r) => +r.views || 0));
    const a = moduleStats.get(concept.module);
    a.items += 1;
    a.exposure += Math.max(views, 1);
    a.engagement += 2 * (+s.reactions || 0) + 2 * (+s.comments || 0) + (+s.opens || 0);
  }
  const focusCandidates = curriculum.concepts
    .filter((c) => c.status === "planned" && (c.prerequisites || []).every((p) => published.has(p)))
    .map((c) => {
      const sc = score(moduleStats.get(c.module), globalRate, issues.length, exploreC);
      return { id: c.id, title: c.title, module: c.module, order: c.order, score: +(sc.ucb - c.order * 0.001).toFixed(4), reason: `module ${c.module}: interest ${sc.rate.toFixed(3)}, explore bonus ${sc.bonus.toFixed(3)}` };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const plan = {
    generated_at: new Date().toISOString(),
    mode: coldStart ? "cold-start (too little usage data: plan follows coverage and diversity rules)" : "data-driven with exploration",
    data: { issues: issues.length, total_issue_views: totalViews },
    explore_share: exploreShare,
    interest_concentration: +concentration.toFixed(2),
    slots,
    regions: { least_covered: underRegions, need: "at least 1 CH and at least 2 outside Europe/CH", scores: regionScores.map((r) => ({ region: r.region, rate: +r.rate.toFixed(4), recent_items: r.recent_items })) },
    topics: { trending, underexplored },
    sources: { preferred_domains: preferred, overused_domains: overused, max_per_domain: MAX_PER_DOMAIN },
    focus_candidates: focusCandidates,
    category_scores: catScores.map((c) => ({ category: c.category, rate: +c.rate.toFixed(4), explore_bonus: +c.bonus.toFixed(4), recent_items: c.recent_items })),
    rules: RULES,
  };

  if (JSON_ONLY) return console.log(JSON.stringify(plan, null, 2));
  console.log(`FPL Weekly insights (${plan.mode})`);
  console.log(`Issues: ${issues.length}, issue views: ${totalViews}, explore share: ${exploreShare}, interest concentration: ${plan.interest_concentration}`);
  console.log("\nSlots for the next issue:");
  slots.forEach((s, i) => console.log(`  ${i + 1}. ${s.category.padEnd(9)} ${s.mode}`));
  console.log(`\nLeast covered regions: ${underRegions.join(", ")}`);
  console.log(`Trending topics: ${trending.join(", ") || "-"}`);
  console.log(`Underexplored topics: ${underexplored.join(", ") || "-"}`);
  console.log(`Preferred sources: ${preferred.join(", ") || "-"}${overused.length ? ` | already used often: ${overused.join(", ")}` : ""}`);
  console.log("\nFocus candidates:");
  focusCandidates.forEach((f, i) => console.log(`  ${i + 1}. ${f.id}: ${f.title} (${f.reason})`));
  console.log("\nFull plan as JSON:\n" + JSON.stringify(plan, null, 2));
}

await main();
