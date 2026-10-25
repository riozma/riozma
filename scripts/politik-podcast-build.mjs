#!/usr/bin/env node
// Politik-Podcast: liest den RSS-Feed von «Es schloht Öufi» und schreibt die Folgen nach politik/podcast.json,
// damit der Politik-Feed (src/politik-feed.js) sie ohne CORS-Probleme anzeigen kann. Ohne Abhängigkeiten (Node 18+).
// Schreibt nur, wenn sich die Folgen geändert haben.
//
//   node scripts/politik-podcast-build.mjs
//   node scripts/politik-podcast-build.mjs --file feed.xml   aus einer lokalen Datei statt aus dem Netz

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "politik/podcast.json");
const FEED = "https://esschlohtoeufi.ch/feed/podcast/es-schloht-oeufi/";
const MAX_ITEMS = 40;

const fileArg = process.argv.indexOf("--file");
const xml = fileArg > 0
  ? await readFile(process.argv[fileArg + 1], "utf8")
  : await fetch(FEED, { headers: { "User-Agent": "riozma.ch politik feed" } }).then((r) => {
    if (!r.ok) throw new Error(`RSS-Feed nicht erreichbar: HTTP ${r.status}`);
    return r.text();
  });

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
};
const attr = (block, name, a) => {
  const m = block.match(new RegExp(`<${name}\\s[^>]*${a}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : "";
};
const plain = (html) => html.replace(/<\/?(?:a|b|i|em|strong|span)\b[^>]*>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const short = (text, n = 220) => (text.length > n ? `${text.slice(0, n).replace(/\s+\S*$/, "")} …` : text);

const channelImage = attr(xml, "itunes:image", "href");
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, MAX_ITEMS).map(([, b]) => {
  const pub = tag(b, "pubDate");
  return {
    title: tag(b, "title"),
    date: pub ? new Date(pub).toISOString() : null,
    link: tag(b, "link"),
    audio: attr(b, "enclosure", "url"),
    duration: tag(b, "itunes:duration"),
    image: attr(b, "itunes:image", "href") || channelImage,
    excerpt: short(plain(tag(b, "itunes:summary") || tag(b, "description"))),
  };
}).filter((i) => i.title && i.date);

let old = null;
try {
  old = JSON.parse(await readFile(OUT, "utf8"));
} catch {
  old = null;
}
if (old && JSON.stringify(old.items) === JSON.stringify(items)) {
  console.log(`Keine neuen Folgen (${items.length}).`);
} else {
  await writeFile(OUT, `${JSON.stringify({ feed: FEED, updated: new Date().toISOString(), items }, null, 2)}\n`);
  console.log(`${items.length} Folgen nach politik/podcast.json geschrieben.`);
}
