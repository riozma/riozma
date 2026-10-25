# Politik: Beitragsarten

Die Politikseite (`/politik/`) und die Vorschau auf der Startseite zeigen einen gemeinsamen Feed, neuster Beitrag zuerst. Es gibt drei Beitragsarten:

| Art | Woher | Wie hinzufügen |
|---|---|---|
| Artikel | Supabase, Tabelle `blog_posts` | wie bisher über das Formular auf `/politik/` (Admin) |
| Video | `politik/beitraege.json`, Seite unter `politik/videos/<slug>/` | siehe unten |
| Podcast | `politik/podcast.json`, gebaut aus dem RSS-Feed | automatisch, täglich |

Der Feed wird in `src/politik-feed.js` zusammengesetzt.

## Neues Video

1. Ordner `politik/videos/<slug>/` anlegen mit `video.mp4` (unter 100 MB, sonst nimmt GitHub die Datei nicht an), `poster.jpg` und `index.html` (Vorlage: `politik/videos/externalitaeten/index.html`).
2. In `politik/beitraege.json` einen Eintrag mit `type: "video"`, `slug`, `title`, `excerpt`, `date`, `href`, `image`, `video`, `youtube: ""`, `duration` und `chapters` ergänzen.
3. Den Link in `sitemap.xml` ergänzen.

## Später: YouTube statt Videodatei

Bei diesem Video in `politik/beitraege.json` den YouTube-Link bei `youtube` eintragen, zum Beispiel `"youtube": "https://www.youtube.com/watch?v=XXXXXXXXXXX"`. Die Videoseite zeigt dann den YouTube-Player statt der Datei, die Kapitel springen im YouTube-Player. Danach kann `video.mp4` gelöscht werden.

## Podcast

Der Workflow `.github/workflows/politik-podcast.yml` läuft täglich (und von Hand über «Run workflow»). Er ruft `scripts/politik-podcast-build.mjs` auf, liest den Feed https://esschlohtoeufi.ch/feed/podcast/es-schloht-oeufi/ und schreibt die Folgen nach `politik/podcast.json`. Der Umweg ist nötig, weil der Browser den Feed einer fremden Domain nicht direkt lesen darf.
