#!/usr/bin/env node
// Stammbaum Build: wandelt eine GEDCOM-Datei in stammbaum/data.json um.
// Läuft ohne Abhängigkeiten (Node 18+).
//
//   node scripts/stammbaum-build.mjs "<pfad>/datei.ged" [--root=@I194@]
//
// Personen ohne Todesdatum, die ab 1925 geboren sind (oder deren Geburtsjahr unbekannt ist und
// die Kinder ab 1925 haben), gelten als lebend (Feld "l"). Die Daten liegen nur hinter Login und
// Freigabe in Supabase; mit --anonymize-living bleiben von Lebenden nur Name und Geschlecht erhalten.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "stammbaum/data.json");
const LIVING_FROM = 1925;
const [input] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ANON = process.argv.includes("--anonymize-living");
const rootArg = (process.argv.find((a) => a.startsWith("--root=")) || "").slice(7) || "@I194@";
if (!input) {
  console.error("Aufruf: node scripts/stammbaum-build.mjs <datei.ged> [--root=@I194@]");
  process.exit(1);
}

const raw = (await readFile(input, "utf8")).replace(/^﻿/, "");
const records = [];
let cur = null;
let last = [];
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
  if (!m) continue;
  const level = +m[1];
  const node = { tag: m[3], val: (m[4] ?? "").trim(), id: m[2], kids: [] };
  if (level === 0) {
    cur = node;
    records.push(node);
    last = [node];
    continue;
  }
  if (!cur) continue;
  if (node.tag === "CONC" || node.tag === "CONT") {
    const p = last[level - 1];
    if (p) p.val += (node.tag === "CONT" ? "\n" : "") + (m[4] ?? "");
    continue;
  }
  last[level - 1]?.kids.push(node);
  last[level] = node;
  last.length = level + 1;
}

const get = (n, tag) => n.kids.find((k) => k.tag === tag);
const val = (n, tag) => get(n, tag)?.val || "";
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const year = (d) => (d.match(/\d{4}/) || [null])[0] && +d.match(/\d{4}/)[0];
// "13 AUG 2002" -> "2002-08-13", "1635" -> "1635", unbekannt bleibt Rohtext
function iso(d) {
  const m = d.match(/^(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{4})$/);
  if (!m) return d;
  const mo = m[2] ? MONTHS[m[2]] : 0;
  if (!mo) return m[3];
  return `${m[3]}-${String(mo).padStart(2, "0")}${m[1] ? "-" + String(m[1]).padStart(2, "0") : ""}`;
}

const indis = new Map();
const fams = new Map();
for (const r of records) {
  if (r.tag === "INDI") {
    const given = val(get(r, "NAME") ?? { kids: [] }, "GIVN");
    const surn = val(get(r, "NAME") ?? { kids: [] }, "SURN");
    const birt = get(r, "BIRT");
    const deat = get(r, "DEAT");
    const note = r.kids.filter((k) => k.tag === "NOTE").map((k) => k.val).join("\n")
      || [birt, deat].map((e) => e && val(e, "NOTE")).filter(Boolean).join("\n");
    indis.set(r.id, {
      id: r.id,
      given: given.trim(),
      surn: surn.trim(),
      title: val(r, "TITL"),
      sex: val(r, "SEX"),
      famc: r.kids.filter((k) => k.tag === "FAMC").map((k) => k.val),
      fams: r.kids.filter((k) => k.tag === "FAMS").map((k) => k.val),
      b: birt ? val(birt, "DATE") : "",
      bp: birt ? val(birt, "PLAC") : "",
      d: deat ? val(deat, "DATE") : "",
      dp: deat ? val(deat, "PLAC") : "",
      hasDeath: !!deat,
      occ: val(r, "OCCU"),
      rel: val(r, "RELI"),
      note,
    });
  } else if (r.tag === "FAM") {
    const marr = get(r, "MARR");
    const div = get(r, "DIV");
    fams.set(r.id, {
      id: r.id,
      h: val(r, "HUSB") || null,
      w: val(r, "WIFE") || null,
      c: r.kids.filter((k) => k.tag === "CHIL").map((k) => k.val),
      m: marr ? val(marr, "DATE") : "",
      mp: marr ? val(marr, "PLAC") : "",
      div: !!div,
    });
  }
}

// Lebend-Erkennung (Kindergeburt nur als Hinweis, wenn kein eigenes Datum vorliegt)
const childYear = (p) =>
  Math.max(0, ...p.fams.flatMap((f) => (fams.get(f)?.c ?? []).map((c) => year(indis.get(c)?.b ?? "") ?? 0)));
for (const p of indis.values()) {
  const by = year(p.b);
  p.living = !p.hasDeath && (by ? by >= LIVING_FROM : childYear(p) >= LIVING_FROM);
}

const clean = (s) => s.replace(/\s+/g, " ").trim();
const ids = [...indis.keys()];
const idx = new Map(ids.map((id, i) => [id, i]));
const fids = [...fams.keys()];
const fidx = new Map(fids.map((id, i) => [id, i]));

const persons = ids.map((id) => {
  const p = indis.get(id);
  const o = { n: clean(p.given), s: clean(p.surn) };
  if (p.sex === "M" || p.sex === "F") o.g = p.sex;
  const fc = p.famc.map((f) => fidx.get(f)).filter((x) => x !== undefined);
  const fs = p.fams.map((f) => fidx.get(f)).filter((x) => x !== undefined);
  if (fc.length) o.fc = fc;
  if (fs.length) o.fs = fs;
  if (p.living) {
    o.l = 1;
    if (ANON) return o;
  }
  if (p.title) o.t = clean(p.title).replace(/,$/, "");
  if (p.b) o.b = iso(p.b);
  if (p.bp) o.bp = clean(p.bp);
  if (p.d) o.d = iso(p.d);
  if (p.dp) o.dp = clean(p.dp);
  if (p.occ) o.o = clean(p.occ);
  if (p.rel) o.r = clean(p.rel);
  if (p.note) o.no = p.note.trim();
  return o;
});

const families = fids.map((id) => {
  const f = fams.get(id);
  const o = {};
  if (f.h && idx.has(f.h)) o.h = idx.get(f.h);
  if (f.w && idx.has(f.w)) o.w = idx.get(f.w);
  o.c = f.c.filter((c) => idx.has(c)).map((c) => idx.get(c));
  const living = ANON && [f.h, f.w].some((x) => indis.get(x)?.living);
  if (f.m && !living) o.m = iso(f.m);
  if (f.mp && !living) o.mp = clean(f.mp);
  if (f.div) o.div = 1;
  return o;
});

const root = idx.get(rootArg);
if (root === undefined) throw new Error(`Startperson ${rootArg} nicht gefunden`);
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ root, persons, families }));
console.log(`${persons.length} Personen, ${families.length} Familien, ${persons.filter((p) => p.l).length} als lebend markiert -> ${path.relative(ROOT, OUT)}`);
