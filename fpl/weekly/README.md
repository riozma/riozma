# FPL Weekly

Wöchentlicher Newsletter des Future Planning Lab auf <https://riozma.ch/fpl/weekly/>.
Jede Woche ist ein Ordner unter `fpl/weekly/issues/<YYYY-WW>/`. Aus dem Ordner entstehen automatisch die Seite
`/fpl/weekly/<YYYY-WW>/`, die Übersicht, der RSS-Feed und die Sitemap. Kommentare, Reaktionen, Umfrage und
Moderationsstatus liegen in Supabase (Migration `20261021000000_fpl_weekly.sql`).

## Dateien

| Pfad | Was | Von Hand? |
|------|-----|-----------|
| `issues/<YYYY-WW>/issue.json` | Inhalt der Ausgabe (Schema: `issue.schema.json`) | ja |
| `issues/<YYYY-WW>/focus.html` | Fokus-Thema als HTML-Fragment | ja |
| `issues/<YYYY-WW>/images.json` | Vorschaubilder der News (og:image) | nein, generiert |
| `<YYYY-WW>/index.html` | Statische Seite mit Open-Graph-Tags | nein, generiert |
| `issues/index.json`, `feed.xml`, `../../sitemap.xml` | Übersicht, RSS, Sitemap | nein, generiert |
| `curriculum.json` | Lernpfad (Module und Konzepte) | ja, wird beim Build ergänzt |
| `index.html`, `concepts/`, `glossary/` | Übersicht, Lernpfad, Glossar (laden die JSON-Dateien) | selten |

Der gemeinsame Renderer ist `src/fpl-weekly.js` mit `src/fpl-weekly.css`.

## Veröffentlichen (Ablauf für die wöchentliche Claude-Aufgabe)

Die Aufgabe läuft jeden Montag und veröffentlicht, indem sie **direkt auf `main` pusht**, ohne Pull Request.
Die GitHub Action `.github/workflows/fpl-weekly.yml` baut danach alles Weitere. Die Ausgabe ist sofort live und
zeigt «Not yet checked by a moderator», bis Manuel sie auf der Website abhakt.

Der Ablauf ist so gebaut, dass ein zweiter Lauf in derselben Woche nichts doppelt veröffentlicht:

1. **Woche bestimmen.** Zieldatum ist der Montag der aktuellen ISO-Woche (Zeitzone Europe/Zurich), Ordnername
   `<ISO-Jahr>-<ISO-Woche>` mit zweistelliger Woche, z. B. `2026-43`. Das Feld `date` ist dieser Montag.
2. **Aktuellen Stand holen.** `git fetch origin main`, `git checkout main`, `git pull --ff-only`.
3. **Doppelt-Schutz.** Existiert `fpl/weekly/issues/<YYYY-WW>/` schon auf `origin/main`, **abbrechen** und nichts
   ändern («already published»). Das gilt auch, wenn die Aufgabe zweimal gestartet wurde oder von mehreren Orten läuft.
4. **Vorgänger lesen.**
   - `fpl/weekly/issues/index.json`: höchste Ausgabennummer `N`, diese Ausgabe ist `N + 1`.
   - Alle früheren `issue.json`: `news[].source_url` und `news[].id` sammeln. Keine Meldung aus einer Quelle verwenden,
     die schon in einer früheren Ausgabe vorkam (Nachfolgemeldungen zur selben Geschichte nur mit neuem Stand).
   - `covers.from` ist der Tag nach `covers.to` der letzten Ausgabe, `covers.to` der Sonntag vor dem Montag.
5. **Fokus-Thema wählen.** In `curriculum.json` das nächste Konzept mit `status: "planned"` nehmen, dessen
   `prerequisites` alle `published` sind (niedrigstes Modul, dann kleinste `order`). Ist keines frei, das mit den
   wenigsten offenen Voraussetzungen nehmen. Nie ein Konzept wiederholen, das `published` ist.
6. **Recherchieren und schreiben.** 6 bis 10 News, jede aus einer echten Quelle mit funktionierendem Link,
   mindestens drei Rubriken. Texte auf Englisch, sachlich, Zahlen so, wie die Quelle sie nennt (bei Eigenangaben
   von Firmen das dazuschreiben). Jede News endet mit einem Absatz, der mit `Why it matters` beginnt. Bei
   `image_url: null` holt der Build das Vorschaubild selbst.
7. **Dateien anlegen:** `issues/<YYYY-WW>/issue.json` und `issues/<YYYY-WW>/focus.html`
   (dazu optionale Bilder im selben Ordner). `issue.json` darf `images.json` und die generierten Seiten nicht
   ersetzen. Das Curriculum nicht von Hand ändern: der Build setzt das Fokus-Konzept auf `published` und trägt die
   Ausgabe ein (wer will, kann es zusätzlich selbst eintragen: `status: "published"`, `issue: "<YYYY-WW>"`).
8. **Prüfen:** `node scripts/fpl-weekly-build.mjs --check` muss mit Exit-Code 0 enden. Fehler (rot) beheben,
   Warnungen lesen (z. B. «source already used»).
9. **Veröffentlichen:**
   ```bash
   git add fpl/weekly/issues/<YYYY-WW>
   git commit -m "FPL Weekly <YYYY-WW>: <Titel>"
   git pull --rebase origin main
   git push origin HEAD:main
   ```
   Nur den Ausgabenordner committen. Wird der Push abgelehnt, `git pull --rebase` und Schritt 3 wiederholen: ist der
   Ordner inzwischen von einem anderen Lauf da, den eigenen Commit verwerfen (`git reset --hard origin/main`).
10. **Danach** baut die Action (ca. 1 bis 3 Minuten) Seite, Bilder, Übersicht, RSS und Sitemap und committet sie
    (`FPL Weekly: generated files [skip ci]`). Die Ausgabe ist unter `https://riozma.ch/fpl/weekly/<YYYY-WW>/` erreichbar.
    Den Link und `whatsapp_teaser` in der Antwort an Manuel ausgeben.

Warum nichts doppelt entsteht: (a) der Ordnername ist der Wochenschlüssel und Schritt 3 bricht ab, wenn er existiert;
(b) zwei gleichzeitige Pushes kann Git nicht beide annehmen; (c) die Action läuft nacheinander
(`concurrency: fpl-weekly`) und schreibt Dateien nur, wenn sich der Inhalt ändert; (d) der Build meldet doppelte
Ausgabennummern als Fehler und wiederverwendete Quellen als Warnung. Es sollte nur **eine** geplante Aufgabe existieren.

## issue.json

Das Schema steht in `issue.schema.json` und wird vom Build geprüft. Beispiel: `issues/2026-43/issue.json`.

- `issue` (Ganzzahl), `week` (`YYYY-WW`, gleich Ordnername), `date`, `covers.from/to`, `title`, `summary` (40 bis 700 Zeichen).
- `generated`: `by`, `method`, `created_at`. Daraus entsteht die Hinweisbox «researched and written by AI».
- `news[]`: `id` (nur `a-z`, `0-9`, `-`, höchstens 60 Zeichen, einmalig in der Ausgabe), `category`
  (`digital`, `robotics`, `circular`, `swiss`, `market`), `title`, `body` (Absätze mit Leerzeile), `source_name`,
  `source_url`, `more_sources[]`, `published_at`, `image_url` (`null` = Build holt `og:image`), `image_credit`.
- `focus`: `title`, `subtitle`, `concept_id` (aus `curriculum.json`), `file` (`focus.html`), `glossary[]`, `further_reading[]`.
- `question`: `text` und 2 bis 10 `options` (Umfrage).
- `whatsapp_teaser`: fertiger WhatsApp-Text, endet mit der Ausgaben-URL.

## focus.html

Ein HTML-Fragment (kein `<html>`, `<head>`, `<body>`), das der Renderer in `.fplw-focus` einsetzt. Es darf Bilder,
Inline-SVG, Tabellen und kleine interaktive Widgets mit eigenem `<style>` und `<script>` enthalten. Der Inhalt kommt
nur aus diesem Repo und gilt als vertrauenswürdig. Konventionen:

- CSS **nur** unter `.fplw-focus` scopen. Verfügbare Variablen: `--blue`, `--blue-dark`, `--orange`, `--ink`, `--red`, `--green`, `--soft`, `--line`.
- Skripte als IIFE, keine globalen Variablen. Das eigene Element über `document.currentScript.previousElementSibling`
  oder ein `data-widget`-Attribut finden (siehe `issues/2026-43/focus.html`). Die `<script>`-Tags werden nach dem Einsetzen
  neu erzeugt, damit sie laufen.
- IDs innerhalb von SVG (Marker, Gradients) mit Präfix versehen, damit sie nicht mit anderen kollidieren.
- Externe Bibliotheken nur von `cdnjs.cloudflare.com` oder `cdn.jsdelivr.net` mit fester Version.
- Bilder lokal unter `issues/<YYYY-WW>/` ablegen (relativ zur Seite also `/fpl/weekly/issues/<YYYY-WW>/bild.jpg`)
  oder frei lizenziert mit Quellenangabe in einer `<figcaption>`. Immer `alt`-Text.
- Muss auf 360 px Breite funktionieren. Keine festen Breiten über 100 %.
- Die Texte sind Englisch, erklären ein Konzept für Bauingenieur-Studierende und enden mit «Next in Module X: …».

## Lernpfad

`curriculum.json` hat `modules[]` (`id`, `title`, `description`) und `concepts[]` (`id`, `title`, `module`, `order`,
`prerequisites[]`, `status` = `planned` oder `published`, `issue`). Die Konzepte folgen den fünf Leitfragen des
Kick-offs (Innovation in die Praxis, KI-Use-Cases, Hürden, Trends, Skills von morgen). Neue Konzepte dürfen jederzeit
ergänzt werden, `id` nach dem Muster `m<Modul>-<kurzer-name>`.

## Lokal bauen und testen

```bash
node scripts/fpl-weekly-build.mjs --check        # nur prüfen
node scripts/fpl-weekly-build.mjs                # bauen (holt fehlende Bilder)
node scripts/fpl-weekly-build.mjs --no-network   # bauen ohne Bilderabruf
python -m http.server 8080                       # dann http://localhost:8080/fpl/weekly/
```

Der Build braucht nur Node 18 oder neuer und keine Pakete. Zweimal hintereinander ausgeführt ändert er beim zweiten
Mal keine Datei.

## Datenbank (Supabase)

Migration `supabase/migrations/20261021000000_fpl_weekly.sql`. Alle Tabellen (`fplw_*`) sind per RLS gesperrt, der
Zugriff läuft nur über RPCs (`fplw_summary`, `fplw_list_comments`, `fplw_add_comment`, `fplw_toggle_reaction`,
`fplw_poll_vote`, `fplw_set_checked`, …). Besucher werden über das Konto (`auth.uid()`) oder den Hash des Browser-Tokens
erkannt, der Admin über `fpl_is_admin()`. E-Mail-Adressen werden nie ausgeliefert. Einspielen wie bei den anderen
Migrationen, siehe `SUPABASE_SETUP.md`.
