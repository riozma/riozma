#!/usr/bin/env node
// Stammbaum Geocoder: sucht Koordinaten für die Orte in stammbaum/data.json (Nominatim, ein Aufruf pro Sekunde).
// Ergebnis: scripts/stammbaum-places.local.json (nicht im Repo). stammbaum-build.mjs legt sie in data.json ab.
//
//   node scripts/stammbaum-build.mjs <datei.ged>     erst Daten erzeugen
//   node scripts/stammbaum-geocode.mjs               dann Orte suchen (nur neue; vorhandene bleiben)
//   node scripts/stammbaum-build.mjs <datei.ged>     nochmals bauen, jetzt mit Koordinaten
//
// Wert "~Land" in QUERIES bedeutet: nur das Land ist bekannt, die Position gilt als ungefähr.
// Orte ohne Eintrag (unklare Schreibweise oder nicht auffindbar) bleiben bewusst ohne Punkt.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "scripts/stammbaum-places.local.json");

const QUERIES = {
  "Altendorf/": "Altendorf, Schwyz, Schweiz",
  "Altendorf/Kt.Schwyz": "Altendorf, Schwyz, Schweiz",
  "Altwillmsdorf": "Stary Wielisław, Kłodzko, Polska",
  "Altwilmsdorf/": "Stary Wielisław, Kłodzko, Polska",
  "Altwilmsdorf/Glatz": "Stary Wielisław, Kłodzko, Polska",
  "Amlikon": "Amlikon-Bissegg, Schweiz",
  "Amriswil": "Amriswil, Schweiz",
  "Arbon": "Arbon, Schweiz",
  "Astrakhan": "Astrakhan, Russia",
  "Auerstedt/Thüringen": "Auerstedt, Thüringen, Deutschland",
  "Bad Salzungen": "Bad Salzungen, Deutschland",
  "Bad Warmbrunn Schlesien": "Cieplice Śląskie-Zdrój, Polska",
  "Barchfeld/Thüringen/D": "Barchfeld, Thüringen, Deutschland",
  "Basel": "Basel, Schweiz",
  "Berghaus Wigoltingen": "Wigoltingen, Schweiz",
  "Berlin": "Berlin, Deutschland",
  "Bern": "Bern, Schweiz",
  "Bissegg": "Bissegg, Amlikon-Bissegg, Schweiz",
  "Bonn": "Bonn, Deutschland",
  "Breslau": "Wrocław, Polska",
  "Brünn": "Brno, Česko",
  "Bussnang": "Bussnang, Schweiz",
  "Basel/": "Basel, Schweiz",
  "Chur": "Chur, Schweiz",
  "Cleveland USA": "Cleveland, Ohio, USA",
  "Cleveland, USA": "Cleveland, Ohio, USA",
  "Damsdorf/Striegau": "~Strzegom, Polska",
  "Detmold/Rheinland-Westphalen": "Detmold, Deutschland",
  "Dortmund/": "Dortmund, Deutschland",
  "Dortmund/D": "Dortmund, Deutschland",
  "Dulwich Au": "Dulwich, Adelaide, Australia",
  "Düsseldorf/": "Düsseldorf, Deutschland",
  "Düsseldorf/D": "Düsseldorf, Deutschland",
  "Egerkingen": "Egerkingen, Schweiz",
  "Egnach": "Egnach, Schweiz",
  "Embrach": "Embrach, Schweiz",
  "Frauenfeld": "Frauenfeld, Schweiz",
  "Friltschen": "Friltschen, Schweiz",
  "Frutigen": "Frutigen, Schweiz",
  "Glatz": "Kłodzko, Polska",
  "Gleiwitz": "Gliwice, Polska",
  "Glogau": "Głogów, Polska",
  "Gottlieben": "Gottlieben, Schweiz",
  "Gunterswilen": "Gunterswilen, Schweiz",
  "Heldswil": "Heldswil, Schweiz",
  "Hinwil": "Hinwil, Schweiz",
  "Horn": "Horn, Thurgau, Schweiz",
  "Houston USA": "Houston, Texas, USA",
  "Kestenholz": "Kestenholz, Schweiz",
  "Keysen, Lettland": "~Strenci, Latvija",
  "Kolomna (Ru)": "Kolomna, Russia",
  "Kreuzlingen": "Kreuzlingen, Schweiz",
  "Kriens": "Kriens, Schweiz",
  "Lakewood": "Lakewood, Ohio, USA",
  "Lamperswil": "Lamperswil, Schweiz",
  "Landeshut/Schlesien": "Kamienna Góra, Polska",
  "Liegnitz": "Legnica, Polska",
  "Losone": "Losone, Schweiz",
  "Lostorf": "Lostorf, Schweiz",
  "Luzern": "Luzern, Schweiz",
  "Marburg": "Marburg, Deutschland",
  "Matzingen": "Matzingen, Schweiz",
  "Mistelbach": "Mistelbach, Niederösterreich, Österreich",
  "Moskau": "Moskva, Russia",
  "München": "München, Deutschland",
  "Niederbuchsiten": "Niederbuchsiten, Schweiz",
  "Northeim D": "Northeim, Niedersachsen, Deutschland",
  "Olten": "Olten, Schweiz",
  "Orselina": "Orselina, Schweiz",
  "Paris Ontario": "Paris, Ontario, Canada",
  "Paris/Ontario": "Paris, Ontario, Canada",
  "Pratteln": "Pratteln, Schweiz",
  "Riechen": "Riehen, Schweiz",
  "Riedholz": "Riedholz, Schweiz",
  "Riga": "Rīga, Latvija",
  "Riga Latvia": "Rīga, Latvija",
  "Ronov": "~Ronov nad Doubravou, Česko",
  "Rorschach": "Rorschach, Schweiz",
  "Rottweil a.N./": "Rottweil, Deutschland",
  "Rottweil a.N./D": "Rottweil, Deutschland",
  "Rüti ZH": "Rüti, Zürich, Schweiz",
  "Rüttenen": "Rüttenen, Schweiz",
  "Salenstein": "Salenstein, Schweiz",
  "Saaremaa/Estland": "Saaremaa, Eesti",
  "Sigulda": "Sigulda, Latvija",
  "Solothurn": "Solothurn, Schweiz",
  "St. Gallen": "St. Gallen, Schweiz",
  "St.Gallen": "St. Gallen, Schweiz",
  "St.Petersburg": "Sankt-Peterburg, Russia",
  "Stackeln": "Strenci, Latvija",
  "Steckborn": "Steckborn, Schweiz",
  "Strenci": "Strenci, Latvija",
  "Striegau": "Strzegom, Polska",
  "Sursee": "Sursee, Schweiz",
  "Triboltingen": "Triboltingen, Schweiz",
  "Tägerwilen": "Tägerwilen, Schweiz",
  "Valmiera": "Valmiera, Latvija",
  "Villach": "Villach, Österreich",
  "Wagerswilen": "~Tägerwilen, Schweiz",
  "Wangen bei Olten": "Wangen bei Olten, Schweiz",
  "Whitehorse Can.": "Whitehorse, Yukon, Canada",
  "Wien": "Wien, Österreich",
  "Wolkersdorf": "Wolkersdorf im Weinviertel, Österreich",
  "Yeisk (Ru)": "Yeysk, Russia",
  "Zürich": "Zürich, Schweiz",
  "Birchwil": "Birchwil, Nürensdorf, Schweiz",
  "Zuchwil/Solothurn": "Zuchwil, Schweiz",
  "Locarno/Nizza": "Locarno, Schweiz",
  "Sursee/": "Sursee, Schweiz",
  // nur Land oder Gegend bekannt
  "Estland": "~Eesti",
  "Schweden": "~Sverige",
  "Japan": "~Japan",
  "USA": "~United States",
  "CAN": "~Canada",
  "Russland?": "~Russia",
  "Äthiopien": "~Ethiopia",
  "Schlesien": "~Wrocław, Polska",
  "(Arg?)": "~Argentina",
};

const data = JSON.parse(await readFile(path.join(ROOT, "stammbaum/data.json"), "utf8"));
const used = new Set();
for (const p of data.persons) for (const k of ["bp", "dp", "rp"]) if (p[k]) used.add(p[k]);

let cache = {};
try { cache = JSON.parse(await readFile(OUT, "utf8")); } catch { /* neu */ }

const todo = [...used].filter((k) => QUERIES[k] && !cache[k]);
const unknown = [...used].filter((k) => !QUERIES[k]);
console.log(`${used.size} Orte, ${todo.length} zu suchen, ${unknown.length} ohne Eintrag`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const queryCache = new Map();
for (const key of todo) {
  let q = QUERIES[key];
  const approx = q.startsWith("~");
  if (approx) q = q.slice(1);
  if (!queryCache.has(q)) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(q)}`;
    let hit = null;
    for (let attempt = 0; attempt < 3 && !hit; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "riozma-stammbaum/1.0 (manuelzeltner@gmail.com)" } });
        if (res.ok) hit = (await res.json())[0] ?? false;
      } catch { /* nochmals */ }
      if (hit === null) await sleep(2000);
    }
    queryCache.set(q, hit || null);
    await sleep(1100);
  }
  const h = queryCache.get(q);
  if (!h) { console.log("NICHT GEFUNDEN:", key, "→", q); continue; }
  cache[key] = [+(+h.lat).toFixed(4), +(+h.lon).toFixed(4), approx ? 1 : 0, h.display_name];
  console.log(key.padEnd(30), "→", h.display_name.slice(0, 80));
}
await writeFile(OUT, JSON.stringify(cache, null, 1));
console.log("Ohne Eintrag:", unknown.sort().join("; "));
