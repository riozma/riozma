# FPL Weekly

Wöchentlicher Newsletter des Future Planning Lab auf <https://riozma.ch/fpl/weekly/>.
Jede Woche ist ein Ordner unter `fpl/weekly/issues/<YYYY-WW>/`. Aus dem Ordner entstehen automatisch die Seite
`/fpl/weekly/<YYYY-WW>/`, die Übersicht, der RSS-Feed und die Sitemap. Kommentare, Reaktionen, Umfrage,
Moderationsstatus und Nutzungszahlen liegen in Supabase (Migrationen `20261021000000_fpl_weekly.sql` und
`20261021010000_fpl_weekly_events.sql`).

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
| `../../scripts/fpl-weekly-insights.mjs` | Redaktionsplan aus den Nutzungszahlen (siehe unten) | läuft vor jeder Ausgabe |

Der gemeinsame Renderer ist `src/fpl-weekly.js` mit `src/fpl-weekly.css`.

## Leitbild: wie eine Fachredaktion arbeiten

Zielgruppe sind Bauleute mit dem Wissensstand eines durchschnittlichen Bachelor-Absolventen in Europa (Bauingenieurwesen),
vor allem ETH-Masterstudierende. Der Newsletter soll sie in 10 bis 15 Minuten auf dem Laufenden halten **und** ihr Bild
der Branche Woche für Woche erweitern. Er arbeitet deshalb wie die Redaktionen von Hochparterre, TEC21 und Espazium,
nur für die Nische Digitalisierung, KI, Automatisierung und Kreislaufwirtschaft im Bau:

1. **Themenplanung (Redaktionssitzung).** Zuerst `node scripts/fpl-weekly-insights.mjs` ausführen und den Plan lesen
   (Plätze je Rubrik, Entdecken-Plätze, wenig vertretene Regionen und Themen, Fokus-Kandidaten). Dazu die früheren Ausgaben
   und `curriculum.json` lesen. Daraus eine Linie für die Woche festlegen: welche 6 bis 8 Geschichten, welcher Fokus, welcher rote Faden.
2. **Recherche nach Ressorts (Beats).** Pro Rubrik gezielt die Orte absuchen, an denen Neuigkeiten zuerst erscheinen:
   Newsrooms von Firmen, Hochschulen und Forschungsprojekten (ETH, EPFL, Empa, NCCR Digital Fabrication, TU Wien, TUM, Eurac),
   Behörden und Normen (EU-Kommission, BAFU, SIA, buildingSMART, Bauen digital Schweiz), Fachpresse
   (Hochparterre, TEC21, Espazium, Baublatt, AEC Magazine, Construction Dive, ENR, Bauwelt, ICR) und Finanzierungsmeldungen.
   Nicht nur Europa und die Schweiz: mindestens zwei Beiträge aus anderen Weltregionen.
3. **Quellenprüfung (Faktencheck).** Immer bis zur ursprünglichen Quelle gehen (Medienmitteilung, Studie, Behörde). Ist sie nicht
   abrufbar, die beste Berichterstattung wählen (Fachpresse vor Allgemeinpresse vor Sammelseiten) und die Originalquelle unter
   `more_sources` verlinken. Zahlen mit zwei Quellen abgleichen oder als Angabe des Unternehmens kennzeichnen («company claims»).
   Datum prüfen (liegt es im Zeitraum?), Links öffnen, gesponserte Inhalte als `branded` kennzeichnen. Nichts erfinden, nichts
   übernehmen, was nicht gelesen wurde.
4. **Einordnen und erklären.** Die Leser kennen kleine oder internationale Firmen nicht und sind keine Spezialisten in genau dieser Nische. Jeder Beitrag bekommt:
   einen Titel, der sagt, wer das ist (nicht «Origin raises $20M», sondern «Origin, a US start-up founded in 2025, launches a
   wall-finishing robot with $20M»); ein Feld `background`; einen Absatz «Why it matters» für Bauingenieur*innen.
   Sachlich schreiben, keine Schlagworte («Revolution»), Behauptung und Tatsache trennen.
   **Das `background` ist konkret zum Artikel, nicht allgemein.** Es beantwortet, was jemand ohne Nischenwissen zum Verständnis dieses Beitrags braucht:
   bei einer kleinen oder fremden Firma, was sie macht und wie sie vorgeht (ihr Lösungsansatz, ihre Produkte, ihre Technik, ihre Kunden und Referenzprojekte);
   bei einer Behörde, Norm oder Plattform, wie die Sache bisher gehandhabt wurde und was sich ändert (Beispiel SBB: wie die Infrastrukturdaten bisher in mehreren Systemen lagen
   und was ITOP anders macht); bei einem Fachbegriff, was er in genau diesem Fall bedeutet. Nur Belegtes aus den gelesenen Quellen verwenden. Eine Definition aus dem Lexikon
   («Ein Series-D-Investment ist …») genügt nicht, sie darf höchstens ein Halbsatz sein. 3 bis 6 Sätze.
5. **Mischung.** Etwa zwei Drittel «was gibt es, was passiert» (Markt, Produkte, Projekte, Forschung) und ein Drittel «wie funktioniert
   das, was ist das Konzept» (`background`, mindestens zwei Beiträge, die vor allem wegen des Konzepts gewählt wurden, dazu das
   Fokus-Thema). Höchstens zwei reine Finanzierungsmeldungen je Ausgabe.
6. **Gegenlesen (Redigat).** Jeden Beitrag noch einmal gegen seine Quelle lesen: Zahlen, Namen, Einheiten, Währung, Datum, Rechtschreibung.
   Doppelte Geschichten streichen, Titel prüfen, Reihenfolge der Beiträge nach Wichtigkeit festlegen (wichtigster zuerst),
   dann `node scripts/fpl-weekly-build.mjs --check`.
7. **Transparenz und Korrekturen.** `generated.method` sagt ehrlich, wie die Ausgabe entstand und was nicht verifiziert ist.
   Fehler später korrigieren (Datei ändern, pushen) und im Feld `generated.method` mit Datum vermerken.

Die Reihenfolge in `issue.json` ist die redaktionelle Wichtigkeit. Auf der Website werden die Beiträge zusätzlich nach Interesse sortiert (siehe unten).

## Algorithmus: Qualität sichern, Horizont erweitern, keine Blase

Der Algorithmus soll **nicht** nur geben, was geklickt wird, sondern die Qualität sichern und den Horizont erweitern. Er arbeitet an zwei Stellen.

**1. Reihenfolge innerhalb einer Ausgabe (Website, `rankNews` in `src/fpl-weekly.js`).**
Für jeden Beitrag zählen verschiedene Besucher: Klick auf die Originalquelle (Gewicht 3), Reaktion (2), Kommentar (2), Aufklappen (1).
Der Wert wird zum Durchschnitt der Ausgabe hin geglättet, damit wenige Zufallsklicks nichts umwerfen. Dann gilt:
`score = (1 - w) * redaktionelle Position + w * Interesse`, mit `w = Besucher / (Besucher + 20)`. Ohne Zahlen gilt also die Redaktion,
mit wachsender Zahl der Besucher zunehmend das Interesse. Meistgelesene Beiträge rutschen nach oben (mit Marke «Most read»), weniger gelesene nach unten.
Alle Beiträge bleiben sichtbar, nur die Reihenfolge ändert sich, und sie wird einmal beim Laden festgelegt, damit nichts springt.

**2. Planung der nächsten Ausgabe (`scripts/fpl-weekly-insights.mjs`).**
Aus den Zahlen berechnet das Skript je Rubrik, Region, Thema und Quelle einen geglätteten Interessenwert (neuere Wochen zählen mehr,
Halbwertszeit 6 Wochen; Klicks auf gesponserte oder schwache Quellen zählen weniger). Daraus entsteht ein Plan mit Plätzen:

- **Exploit:** Rubriken und Themen mit gutem Interesse, aber mit neuem Blickwinkel statt Wiederholung.
- **Explore (Entdecken):** mindestens 25 Prozent der Plätze, bei einseitigem Interesse 40 Prozent. Diese Plätze gehen an die zuletzt am wenigsten gezeigten Rubriken,
  Regionen und Themen und nutzen **keine** Klickdaten. Das ist der Schutz vor der Filterblase. Je einseitiger das Interesse (Entropie der Rubriken), desto mehr wird erkundet.
  Technisch ist es ein UCB-Verfahren (geglättete Rate plus Entdecker-Bonus für wenig Gezeigtes).
- **Qualitätsregeln gelten immer:** höchstens 2 Beiträge pro Quelle, mindestens die Hälfte aus Primär- oder Fachquellen, gesponserte Inhalte nie auf Entdecken-Plätzen,
  mindestens ein Schweizer Beitrag und zwei von ausserhalb Europas/der Schweiz, höchstens 2 Plätze je Rubrik bei einseitigem Interesse.
- **Fokus-Thema:** nächste Konzepte mit erfüllten Voraussetzungen, bewertet nach dem Interesse am Modul plus Entdecker-Bonus für wenig behandelte Module.

Ohne Daten (Kaltstart, unter 20 Besuchern) richtet sich der Plan nur nach Abdeckung und Vielfalt. Die Zahlen sind anonym (Hash eines Browser-Tokens, höchstens ein Ereignis je Besucher und Tag, nur Summen abrufbar).

## Veröffentlichen (Ablauf für die wöchentliche Claude-Aufgabe)

Die Aufgabe läuft jeden Montag und veröffentlicht, indem sie **direkt auf `main` pusht**, ohne Pull Request.
Die GitHub Action `.github/workflows/fpl-weekly.yml` baut danach alles Weitere. Die Ausgabe ist sofort live und
zeigt «Not yet checked by a moderator», bis Manuel sie auf der Website abhakt.

Der Ablauf ist so gebaut, dass ein zweiter Lauf in derselben Woche nichts doppelt veröffentlicht:

1. **Woche bestimmen.** Zieldatum ist der Montag der aktuellen ISO-Woche (Zeitzone Europe/Zurich), Ordnername
   `<ISO-Jahr>-<ISO-Woche>` mit zweistelliger Woche, z. B. `2026-43`. Das Feld `date` ist dieser Montag.
2. **Aktuellen Stand holen.** `git fetch origin main`, `git checkout main`, `git pull --ff-only` (bzw. frisch klonen).
3. **Doppelt-Schutz.** Existiert `fpl/weekly/issues/<YYYY-WW>/` schon auf `origin/main`, **abbrechen** und nichts
   ändern («already published»). Das gilt auch, wenn die Aufgabe zweimal gestartet wurde oder von mehreren Orten läuft.
4. **Vorgänger lesen und planen.**
   - `fpl/weekly/issues/index.json`: höchste Ausgabennummer `N`, diese Ausgabe ist `N + 1`.
   - Alle früheren `issue.json`: `news[].source_url` und `news[].id` sammeln. Keine Quelle wiederverwenden, die schon in einer früheren Ausgabe vorkam
     (Nachfolgemeldungen zur selben Geschichte nur mit neuem Stand).
   - `covers.from` ist der Tag nach `covers.to` der letzten Ausgabe, `covers.to` der Sonntag vor dem Montag.
   - `node scripts/fpl-weekly-insights.mjs` ausführen und dem Plan folgen (siehe «Algorithmus»): Plätze, Entdecken-Plätze, Regionen, Quellenregeln, Fokus-Kandidaten.
     Ist die Abfrage nicht erreichbar, läuft der Plan im Kaltstart-Modus weiter.
5. **Fokus-Thema wählen.** Normalfall: aus den Fokus-Kandidaten des Plans (sie stammen aus `curriculum.json`: `status: "planned"`, alle `prerequisites` veröffentlicht)
   das beste wählen (`focus.kind: "concept"`, `concept_id` setzen). Nie ein Konzept wiederholen, das `published` ist.
   **Ausnahme «Breaking»:** Ist in der Woche etwas Grundlegendes oder Bahnbrechendes geschehen (z. B. eine neue Norm oder Verordnung, ein Forschungsdurchbruch,
   eine Übernahme oder Technologie, die ein Feld verändert), darf der Fokus dieses Ereignis erklären: `focus.kind: "breaking"`, ohne `concept_id`, mit Einordnung
   (was ist passiert, was war vorher, was ändert sich, was bedeutet es für Bauleute). Die beiden Arten wechseln sich ab: nie zwei «Breaking»-Fokusse hintereinander,
   und nur, wenn das Ereignis wirklich grundlegend ist, nicht für eine normale Finanzierungsmeldung. Das Konzept, das zurückgestellt wird, bleibt `planned` und kommt in einer späteren Woche.
6. **Redaktionsablauf durchlaufen** (siehe «Leitbild»): recherchieren, bis zur Originalquelle gehen, prüfen, einordnen, `background` schreiben, gegenlesen.
   6 bis 8 News, mindestens drei Rubriken, Texte auf Englisch. Bei `image_url: null` holt der Build das Vorschaubild selbst.
7. **Dateien anlegen:** `issues/<YYYY-WW>/issue.json` und `issues/<YYYY-WW>/focus.html`
   (dazu optionale Bilder im selben Ordner). `images.json` und die generierten Seiten nicht von Hand schreiben. Das Curriculum nicht von Hand ändern:
   der Build setzt das Fokus-Konzept auf `published` und trägt die Ausgabe ein.
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
- `news[]`, in redaktioneller Reihenfolge (wichtigstes zuerst):
  - `id` (nur `a-z`, `0-9`, `-`, höchstens 60 Zeichen, einmalig in der Ausgabe), `category` (`digital`, `robotics`, `circular`, `swiss`, `market`)
  - `title` (selbsterklärend), `body` (höchstens zwei Absätze mit Leerzeile, der zweite beginnt mit «Why it matters»)
  - `background` (konkret zum Artikel: was die Firma macht und wie sie vorgeht, wie es bisher gehandhabt wurde; 3 bis 6 Sätze), `region` (`CH`, `EU`, `UK`, `US`, `Asia`, `Global`), `topics` (1 bis 4 Tags in Kleinbuchstaben)
  - `source_type` (`primary` Urheber oder wortgetreuer Abdruck der Medienmitteilung, `trade` Fachpresse, `general` Allgemeinpresse, `branded` gesponsert), `source_name`, `source_url`, `more_sources[]`
  - `published_at`, `image_url` (`null` = Build holt `og:image`), `image_credit`
- `focus`: `title`, `subtitle`, `kind` (`concept` oder `breaking`), `concept_id` (aus `curriculum.json`, nur bei `concept`), `file` (`focus.html`), `glossary[]`, `further_reading[]`.
- `question`: `text` und 2 bis 10 `options` (Umfrage).
- `whatsapp_teaser`: fertiger WhatsApp-Text, endet mit der Ausgaben-URL.

Auf der Website erscheint jeder Beitrag kompakt (kleines Bild, Titel, Quelle), der Rest (Background, Text, Quelle, Reaktionen, Kommentare) klappt auf.

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
- Die Texte sind Englisch, erklären ein Konzept für Bachelor-Absolventen des Bauingenieurwesens und enden mit «Next in Module X: …».

## Lernpfad

`curriculum.json` hat `modules[]` (`id`, `title`, `description`) und `concepts[]` (`id`, `title`, `module`, `order`,
`prerequisites[]`, `status` = `planned` oder `published`, `issue`). Die Konzepte folgen den fünf Leitfragen des
Kick-offs (Innovation in die Praxis, KI-Use-Cases, Hürden, Trends, Skills von morgen). Neue Konzepte dürfen jederzeit
ergänzt werden, `id` nach dem Muster `m<Modul>-<kurzer-name>`.

## Sicherheit

- **Wer kann Inhalte veröffentlichen?** Nur, wer in das GitHub-Repo `riozma/riozma` pushen darf (Manuel und die geplante Aufgabe mit seinen Zugangsdaten). Die Website ist statisch, es gibt keinen Weg für Besucher, Ausgaben, Dateien oder Code zu ändern.
- **Was können Besucher in Supabase?** Nur die RPCs `fplw_*`: Reaktionen, Kommentare, Umfrage, Zähler und eigene Kommentare ändern. Alle Tabellen sind per RLS gesperrt, alle Eingaben werden geprüft (Länge, Form, Ratenlimit).
  Admin ist nur ein Konto mit bestätigter E-Mail `manuelzeltner@gmail.com` (`fpl_is_admin()`).
- **Kommentare** werden immer als Text angezeigt, nie als HTML.
- **Schutz vor eingeschleustem Code** (die Wochenaufgabe liest offene Webseiten und veröffentlicht direkt): Der Build lehnt eine `focus.html` ab, die Daten senden, umleiten oder nachladen könnte
  (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `document.cookie`, Speicher, `location`, `eval`, Inline-Handler, iframes, Formulare, fremde Skriptquellen). Die Seite wird dann nicht erzeugt.
  Zusätzlich erlaubt die Content-Security-Policy der Ausgabeseiten Verbindungen nur zum eigenen Server und zu Supabase, keine Frames, keine Plugins.
- **Was bleibt Restrisiko:** Wer Push-Zugriff auf `main` oder das Google-Konto des Admins übernimmt, kann veröffentlichen. Deshalb Zwei-Faktor-Anmeldung für GitHub und Google. Anonyme Zähler und Kommentare lassen sich mit vielen Browser-Tokens beeinflussen oder zumüllen (Ratenlimit pro Token, kein Schutz gegen gezielten Missbrauch).

## Lokal bauen und testen

```bash
node scripts/fpl-weekly-build.mjs --check        # nur prüfen
node scripts/fpl-weekly-build.mjs                # bauen (holt fehlende Bilder)
node scripts/fpl-weekly-build.mjs --no-network   # bauen ohne Bilderabruf
node scripts/fpl-weekly-insights.mjs             # Redaktionsplan für die nächste Ausgabe
python -m http.server 8080                       # dann http://localhost:8080/fpl/weekly/
```

Der Build braucht nur Node 18 oder neuer und keine Pakete. Zweimal hintereinander ausgeführt ändert er beim zweiten
Mal keine Datei.

## Datenbank (Supabase)

Alle Tabellen (`fplw_*`) sind per RLS gesperrt, der Zugriff läuft nur über RPCs (`fplw_summary`, `fplw_list_comments`,
`fplw_add_comment`, `fplw_toggle_reaction`, `fplw_poll_vote`, `fplw_set_checked`, `fplw_track`, `fplw_stats`, …).
Besucher werden über das Konto (`auth.uid()`) oder den Hash des Browser-Tokens erkannt, der Admin über `fpl_is_admin()`.
E-Mail-Adressen werden nie ausgeliefert. Einspielen wie bei den anderen Migrationen, siehe `SUPABASE_SETUP.md`.
