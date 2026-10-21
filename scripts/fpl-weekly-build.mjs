#!/usr/bin/env node
// FPL Weekly Build: prüft alle Ausgaben und erzeugt Seiten, Bildliste, Übersicht, RSS und Sitemap.
// Läuft ohne Abhängigkeiten (Node 18+). Idempotent: schreibt Dateien nur, wenn sich der Inhalt ändert.
//
//   node scripts/fpl-weekly-build.mjs               alles bauen (holt fehlende og:image-Bilder aus dem Netz)
//   node scripts/fpl-weekly-build.mjs --no-network  ohne Bilderabruf
//   node scripts/fpl-weekly-build.mjs --check       nur prüfen, nichts schreiben

import { readFile, writeFile, readdir, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEEKLY = path.join(ROOT, "fpl/weekly");
const ISSUES = path.join(WEEKLY, "issues");
const SITE = "https://riozma.ch";
const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const NO_NET = args.has("--no-network") || CHECK_ONLY;

const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

/* ---------- kleine Hilfen ---------- */

const exists = (p) => access(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stable = (o) => JSON.stringify(o, null, 2) + "\n";

async function writeIfChanged(file, content) {
  let old = null;
  try { old = await readFile(file, "utf8"); } catch { /* neu */ }
  if (old === content) return false;
  if (!CHECK_ONLY) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  console.log((CHECK_ONLY ? "would write " : "wrote ") + path.relative(ROOT, file));
  return true;
}

/* ---------- Mini-Validator für das Schema (Teilmenge von JSON Schema) ---------- */

function validate(value, schema, where, out) {
  const types = [].concat(schema.type || []);
  if (types.length) {
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
    const ok = types.some((t) => t === actual || (t === "number" && typeof value === "number"));
    if (!ok) return out.push(`${where}: expected ${types.join("|")}, got ${actual}`);
  }
  if (value === null) return;
  if (schema.enum && !schema.enum.includes(value)) out.push(`${where}: must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) out.push(`${where}: shorter than ${schema.minLength} characters`);
    if (schema.maxLength && value.length > schema.maxLength) out.push(`${where}: longer than ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${where}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) out.push(`${where}: must be >= ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) out.push(`${where}: needs at least ${schema.minItems} items`);
    if (schema.maxItems && value.length > schema.maxItems) out.push(`${where}: at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, `${where}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const key of schema.required || []) if (!(key in value)) out.push(`${where}: missing required field "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties || {})) if (key in value) validate(value[key], sub, `${where}.${key}`, out);
  }
}

/* ---------- Bilder (og:image) ---------- */

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const tag = html.match(re);
    if (!tag) continue;
    const c = tag[0].match(/content=["']([^"']+)["']/i);
    if (c) return c[1].replace(/&amp;/g, "&");
  }
  return null;
}

async function fetchOgImage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; FPLWeeklyBot/1.0; +https://riozma.ch/fpl/)", accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400000);
    const found = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
    if (!found) return null;
    const abs = new URL(found, res.url).href;
    return /^https?:\/\//.test(abs) ? abs : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildImages(dir, issue) {
  const file = path.join(dir, "images.json");
  let images = {};
  if (await exists(file)) images = await readJson(file);
  const next = {};
  for (const n of issue.news) {
    if (n.image_url) continue; // explizites Bild in issue.json hat Vorrang
    if (images[n.id]) next[n.id] = images[n.id]; // bereits geholt: nicht erneut anfragen
    else if (!NO_NET) {
      const url = await fetchOgImage(n.source_url);
      if (url) next[n.id] = { url, credit: new URL(n.source_url).hostname.replace(/^www\./, "") };
      else warn(`${issue.week}/${n.id}: no og:image found at ${n.source_url} (placeholder is used)`);
    }
  }
  await writeIfChanged(file, stable(next));
  return next;
}

/* ---------- Sicherheitsprüfung für focus.html ---------- */
// focus.html darf eigenes CSS und JS enthalten (Widgets). Weil die Aufgabe Inhalte aus dem offenen Web verarbeitet und
// direkt veröffentlicht, wird hier alles abgelehnt, was Daten abgreifen, umleiten oder nachladen könnte.
const ALLOWED_SCRIPT_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net"];
const FORBIDDEN_JS = [
  [/\bfetch\s*\(/, "fetch()"], [/XMLHttpRequest/, "XMLHttpRequest"], [/WebSocket/, "WebSocket"], [/sendBeacon/, "sendBeacon"], [/EventSource/, "EventSource"],
  [/document\s*\.\s*cookie/, "document.cookie"], [/localStorage|sessionStorage|indexedDB/, "browser storage"],
  [/\beval\s*\(/, "eval()"], [/new\s+Function\b/, "new Function"], [/\bimport\s*\(/, "dynamic import"], [/importScripts/, "importScripts"],
  [/window\s*\.\s*open|document\s*\.\s*write/, "window.open / document.write"],
  [/\blocation\s*(\.|=)/, "location"], [/\b(top|parent)\s*\./, "top/parent"], [/postMessage/, "postMessage"],
  [/supabase|getSupabase/i, "supabase"],
];

function lintFocus(html, where) {
  const bad = (msg) => fail(`${where}: focus.html is not allowed to contain ${msg}`);
  if (/<(iframe|object|embed|form|base|meta|link|frame)\b/i.test(html)) bad("iframe, object, embed, form, base, meta or link tags");
  if (/\son[a-z]+\s*=/i.test(html)) bad("inline event handlers (use addEventListener)");
  if (/javascript:|srcdoc\s*=/i.test(html)) bad("javascript: URLs or srcdoc");
  if (/@import/i.test(html)) bad("CSS @import");
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = m[1].match(/\ssrc\s*=\s*["']?([^"'\s>]+)/i);
    if (src) {
      let host = "";
      try { host = new URL(src[1]).hostname; } catch { /* relativ oder ungültig */ }
      if (!ALLOWED_SCRIPT_HOSTS.includes(host)) bad(`a script from "${src[1]}" (only cdnjs.cloudflare.com and cdn.jsdelivr.net)`);
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const [re, name] of FORBIDDEN_JS) if (re.test(m[1])) bad(name);
  }
}

/* ---------- Seiten ---------- */

// Content-Security-Policy: Selbst wenn jemand Schadcode einschleust, darf die Seite Daten nur an den eigenen Server und Supabase senden.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self'; connect-src 'self' https://lwxwcogvkhixfsfvkcvz.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

function issuePage(issue, images) {
  const url = `${SITE}/fpl/weekly/${issue.week}/`;
  const title = `FPL Weekly #${issue.issue}: ${issue.title}`;
  const firstImage = issue.news.map((n) => n.image_url || (images[n.id] && images[n.id].url)).find(Boolean);
  const list = issue.news.map((n) => `<li><a href="${esc(n.source_url)}">${esc(n.title)}</a> (${esc(n.source_name)})</li>`).join("");
  return `<!DOCTYPE html>
<!-- Generiert von scripts/fpl-weekly-build.mjs, nicht von Hand ändern. -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <script src="/src/site-init.js"></script>
  <title>${esc(title)}</title>
  <link rel="icon" href="/src/img/fpl-mark.svg" type="image/svg+xml">
  <meta name="description" content="${esc(issue.summary)}">
  <meta name="theme-color" content="#536A89">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(issue.summary)}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="FPL Weekly">
${firstImage ? `  <meta property="og:image" content="${esc(firstImage)}">\n  <meta name="twitter:card" content="summary_large_image">\n` : ""}  <link rel="alternate" type="application/rss+xml" title="FPL Weekly" href="/fpl/weekly/feed.xml">
  <link rel="stylesheet" href="/src/fpl-weekly.css">
</head>
<body data-fplw="issue" data-week="${issue.week}">
  <header id="fplw-header"></header>
  <main id="fplw-app">
    <h1>${esc(issue.title)}</h1>
    <p>${esc(issue.summary)}</p>
    <ul>${list}</ul>
    <noscript>Please enable JavaScript to read the full issue.</noscript>
  </main>
  <footer class="fplw-foot"><p>Future Planning Lab · ETH Zurich · <a href="/fpl/">FPL</a> · <a href="/fpl/weekly/feed.xml">RSS</a></p><p class="fplw-foot-note">We count anonymous opens and clicks (no personal data) to keep the newsletter relevant.</p></footer>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/src/supabase-config.js"></script>
  <script src="/src/supabase-client.js"></script>
  <script src="/src/fpl-weekly.js"></script>
</body>
</html>
`;
}

function rfc822(dateStr) {
  return new Date(dateStr + "T08:00:00Z").toUTCString();
}

function feed(entries) {
  const items = entries.map((e) => `    <item>
      <title>${esc(`FPL Weekly #${e.issue}: ${e.title}`)}</title>
      <link>${SITE}/fpl/weekly/${e.week}/</link>
      <guid isPermaLink="true">${SITE}/fpl/weekly/${e.week}/</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <description>${esc(e.summary)}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FPL Weekly</title>
    <link>${SITE}/fpl/weekly/</link>
    <description>Weekly briefing on digitalization, AI, automation and circular construction from the Future Planning Lab.</description>
    <language>en</language>
${entries.length ? `    <lastBuildDate>${rfc822(entries[0].date)}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;
}

async function updateSitemap(entries) {
  const file = path.join(ROOT, "sitemap.xml");
  let xml = await readFile(file, "utf8");
  xml = xml.replace(/^[ \t]*<url><loc>https:\/\/riozma\.ch\/fpl\/weekly\/[^<]*<\/loc><\/url>[ \t]*\r?\n/gm, "");
  const urls = [`${SITE}/fpl/weekly/`, `${SITE}/fpl/weekly/concepts/`, `${SITE}/fpl/weekly/glossary/`, ...entries.map((e) => `${SITE}/fpl/weekly/${e.week}/`)];
  const lines = urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") + "\n";
  xml = xml.replace(/<\/urlset>/, lines + "</urlset>");
  await writeIfChanged(file, xml);
}

/* ---------- Hauptablauf ---------- */

async function main() {
  const schema = await readJson(path.join(WEEKLY, "issue.schema.json"));
  const curFile = path.join(WEEKLY, "curriculum.json");
  const curriculum = await readJson(curFile);
  const conceptIds = new Set(curriculum.concepts.map((c) => c.id));

  const dirs = (await readdir(ISSUES, { withFileTypes: true })).filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  if (!dirs.length) fail("no issues found in fpl/weekly/issues/");

  const loaded = [];
  for (const week of dirs) {
    const dir = path.join(ISSUES, week);
    const where = `issues/${week}/issue.json`;
    if (!(await exists(path.join(dir, "issue.json")))) {
      fail(`${where}: file is missing`);
      continue;
    }
    let issue;
    try {
      issue = await readJson(path.join(dir, "issue.json"));
    } catch (e) {
      fail(`${where}: invalid JSON (${e.message})`);
      continue;
    }
    const errs = [];
    validate(issue, schema, "issue", errs);
    errs.forEach((e) => fail(`${where}: ${e}`));
    if (errs.length) continue;
    if (issue.week !== week) fail(`${where}: "week" is ${issue.week} but the folder is ${week}`);
    if (!(await exists(path.join(dir, issue.focus.file)))) fail(`${where}: focus file ${issue.focus.file} is missing`);
    const ids = new Set();
    for (const n of issue.news) {
      if (ids.has(n.id)) fail(`${where}: duplicate news id "${n.id}"`);
      ids.add(n.id);
    }
    if (issue.focus.concept_id && !conceptIds.has(issue.focus.concept_id)) warn(`${where}: concept_id ${issue.focus.concept_id} is not in curriculum.json`);
    if (issue.focus.kind === "breaking" && issue.focus.concept_id) warn(`${where}: a breaking focus normally has no concept_id`);
    if (await exists(path.join(dir, issue.focus.file))) lintFocus(await readFile(path.join(dir, issue.focus.file), "utf8"), where);
    loaded.push({ week, dir, issue });
  }

  // Doppelte Ausgabenummern und wiederholte Quellen früherer Ausgaben melden
  const numbers = new Map();
  const seenUrls = new Map();
  for (const { week, issue } of loaded) {
    if (numbers.has(issue.issue)) fail(`issue number ${issue.issue} is used by ${numbers.get(issue.issue)} and ${week}`);
    numbers.set(issue.issue, week);
    for (const n of issue.news) {
      const first = seenUrls.get(n.source_url);
      if (first && first !== week) warn(`${week}/${n.id}: source already used in issue ${first}`);
      else if (!first) seenUrls.set(n.source_url, week);
    }
  }

  if (problems.length) return;

  const entries = [];
  for (const { week, dir, issue } of loaded) {
    const images = await buildImages(dir, issue);
    await writeIfChanged(path.join(WEEKLY, week, "index.html"), issuePage(issue, images));
    entries.push({
      week,
      issue: issue.issue,
      date: issue.date,
      title: issue.title,
      summary: issue.summary,
      focus_title: issue.focus.title,
      focus_concept_id: issue.focus.concept_id || null,
      focus_kind: issue.focus.kind || "concept",
      categories: [...new Set(issue.news.map((n) => n.category))],
      news_count: issue.news.length,
    });
  }
  entries.sort((a, b) => b.week.localeCompare(a.week));

  // Curriculum: Fokus-Konzepte der veröffentlichten Ausgaben automatisch auf "published" setzen
  let curChanged = false;
  for (const e of entries) {
    const c = curriculum.concepts.find((x) => x.id === e.focus_concept_id);
    if (c && (c.status !== "published" || c.issue !== e.week)) {
      c.status = "published";
      c.issue = e.week;
      curChanged = true;
    }
  }
  if (curChanged) await writeIfChanged(curFile, stable(curriculum));

  await writeIfChanged(path.join(ISSUES, "index.json"), stable({ issues: entries }));
  await writeIfChanged(path.join(WEEKLY, "feed.xml"), feed(entries));
  await updateSitemap(entries);
}

await main();
warnings.forEach((w) => console.log(`::warning::${w}`));
if (problems.length) {
  problems.forEach((p) => console.error(`::error::${p}`));
  console.error(`\nFPL Weekly build failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log("FPL Weekly build ok" + (warnings.length ? ` (${warnings.length} warning(s))` : ""));
