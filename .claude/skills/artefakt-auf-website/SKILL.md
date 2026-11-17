---
name: artefakt-auf-website
description: Übernimmt ein Claude-Artefakt (claude.ai/artifact/…, z.B. ein Spiel, Tool oder eine interaktive Seite) samt Bildern als eigene Seite auf riozma.ch, verlinkt es in Navbar, Startseitenmenü und Sitemap und testet es im Browser. Auch für Multiplayer/Echtzeit-Funktionen mit Supabase Realtime ohne Login. Verwenden, wenn Manuel sagt «tu das Artefakt auf die Website», «füge X auf riozma.ch hinzu» o.ä. und es ein Artefakt gibt.
---

# Artefakt auf riozma.ch bringen

Beispiel, an dem der Ablauf entstanden ist: `blubberbiss/` (Spiel aus dem Artefakt «Blubberbiss», mit Multiplayer).

## 1. Artefakt finden und holen
- Ohne Link: `Artifact` mit `action: "list"` und `scope: "all"`, Titel suchen. Diktierfehler beachten
  («rjmap.ch» = riozma.ch, «Weite» = Seite).
- `Artifact` mit `action: "read"` liefert eine Kopie des HTML in `tool-results/…html`. Ganz lesen.
- Weitere Dateien (Bilder) stehen im Kopf der Antwort («This version has N published files»). Holen mit
  `action: "read"`, `path: "<name>"`, `out_dir: /home/user/riozma/<seite>`.
- **Personenfotos** (Freunde usw.) waren im Artefakt privat und werden auf der Website öffentlich. Manuel darauf
  hinweisen, dass die Person einverstanden sein sollte.

## 2. Seite anlegen: `/<seite>/`
- Dateien aufteilen: `index.html`, `style.css`, `game.js` (oder passender Name). Das Artefakt-Gerüst
  (`<meta charset=utf8>`, Reset) durch ein richtiges `<head>` ersetzen, nach dem Muster von `canvas/index.html`:
  `<script src="/src/site-init.js">`, Titel `«Name» – riozma`, `favicon.svg`, `canonical`, `description`, `theme-color`.
- Vollbild-Seiten (Spiele, Canvas) bekommen **keine** Navbar, aber einen Link zurück: `<a href="/" class="home">← RIOZMA</a>`.
- Externe Skripte nur mit fester Version oder wie im Repo üblich (`supabase-js@2` von jsdelivr).

## 3. Verlinken
- **Navbar:** `src/site-header.js` → `MAIN_ITEMS` (direkt sichtbar) oder `MORE_ITEMS` (unter «Sonstiges»).
  Eintrag mit `id`, `href`, `label`, `activeWhen`. Wenn Manuel «direkt in der Navbar» sagt: `MAIN_ITEMS`.
- **Startseite:** `index.html` hat ein eigenes Menü `<nav class="landing-menu">`, dort ebenfalls einen Link einfügen.
- **Sitemap:** `sitemap.xml`, Zeile `<url><loc>https://riozma.ch/<seite>/</loc></url>` nach `/about/` einfügen.
  Die Zeilen `fpl/weekly/…` NICHT anfassen, die schreibt `scripts/fpl-weekly-build.mjs` automatisch neu.

## 4. Multiplayer / Echtzeit (falls gewünscht)
Supabase-Projekt `lwxwcogvkhixfsfvkcvz`. **Realtime Broadcast + Presence funktionieren mit dem öffentlichen Anon-Key,
also ohne Login**, ohne Tabelle und ohne Server-Code.
- Einbinden: `supabase-js@2`, `/src/supabase-config.js`, `/src/supabase-client.js`, dann `getSupabase()`.
- Kanal: `client.channel('<name>-<raum>', {config: {broadcast: {self: false}, presence: {key: myId}}})`,
  eine Nachrichtenart `event: 'm'` mit `payload.k` als Typ. `ch.track({n: name, j: joinedAt})` für die Anwesenheit.
- **Gleicher Kanalname zweimal:** neuere supabase-js geben den bestehenden Kanal zurück. Vorher
  `await client.removeChannel(alt)`.
- **Host-Prinzip** (siehe `blubberbiss/game.js`, Abschnitt «Multiplayer»): Wer am längsten im Kanal ist (Presence,
  sortiert nach `j`), ist Host. Er erzeugt die gemeinsamen Objekte und schickt alle 2 s seine Uhr. Objekte bewegen
  sich nach einer Formel ab ihrer Startzeit `t0`, so müssen keine Positionen übertragen werden. Neue Spieler
  schicken `hello`, der Host antwortet mit `sync`.
- **Konflikte:** Lieber der betroffene Client entscheidet (z.B. «ich wurde gefressen»), statt zu schlichten.
- **Kontingent:** Supabase zählt jede zugestellte Nachricht. Den eigenen Zustand höchstens 5× pro Sekunde senden,
  im Stillstand 1×, und die Anzahl pro Raum begrenzen (z.B. 12). Gegenüber Manuel erwähnen.
- Gäste brauchen einen Namen: Zufallsvorschlag + eingeloggte Nutzer bekommen den Vornamen aus
  `session.user.user_metadata.full_name` vorgeschlagen. Namen immer escapen.
- Für Tests einen Zugang nur mit `?debug` einbauen (`window.__bb = {…}`), damit man Zustände setzen kann.

## 5. Pixel-Grafik: Fallstricke
- Text und Fotos nicht ins Low-Res-Pixel-Canvas zeichnen, das hochskaliert wird: Das wird riesig und unscharf.
  Namen als HTML-Ebene (`#tags`), Fotos auf einer zweiten Canvas in Bildschirmauflösung
  (`devicePixelRatio`, `imageSmoothingQuality = 'high'`).

## 6. Testen
- `node --check` für jede JS-Datei.
- Lokal servieren: `python3 -m http.server 8765 --bind 127.0.0.1` im Repo-Wurzelordner.
- Browser: **Chromium in der Sandbox erreicht keine externen Hosts** (ERR_TUNNEL_CONNECTION_FAILED). Darum
  `browser-test.js` in diesem Ordner verwenden: liefert supabase-js lokal aus und reicht WebSockets über Playwright
  weiter. Für Multiplayer zwei Kontexte öffnen (z.B. Desktop + 390×844) und prüfen: sehen sich beide, stimmen die
  gemeinsamen Objekte überein (IDs und Positionen), keine `pageerror`.
- Screenshots anschauen (Desktop und Handy), besonders Text-Grössen und Überlappungen im HUD.

## 7. Abschliessen
- Commit auf dem Arbeits-Branch, pushen. Live geht es erst auf `main` (GitHub Pages). Nur nach `main` pushen, wenn
  Manuel es sagt. Dann `git push origin HEAD:main`, wenn es als Fast-Forward geht.
- In der Antwort: Link `https://riozma.ch/<seite>/`, was neu ist, und offene Punkte (Fotos von Personen, Kontingent).
