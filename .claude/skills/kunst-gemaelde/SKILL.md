---
name: kunst-gemaelde
description: Fügt ein Gemälde von Manuel (riozmart) zur Kunstgalerie auf riozma.ch hinzu oder ersetzt/ergänzt eine Fassung eines bestehenden Gemäldes. Verwenden, wenn der Nutzer ein Foto eines gemalten Bildes (Leinwand, Acryl o.ä.) schickt und es auf die Website soll. NICHT verwenden für andere Fotos (Personen, Reisen, Events, Politik, Screenshots) – nur für Gemälde.
---

# Gemälde zur Kunstgalerie hinzufügen

Nur für **Fotos von Gemälden**. Ist unklar, ob das Foto ein Gemälde zeigt, nachfragen.

## 0. Angaben klären
Pro Gemälde brauchst du: **Titel, Jahr, Grösse** (Format `100x80`, Breite x Höhe in cm, so wie angegeben),
**Medium** (Standard `Acrylic on canvas`; «Acryl uf Linwand» = `Acrylic on canvas`), **verfügbar** (`"True"`/`"False"`/`null`)
und den **Standort** (Ort + bei wem). Fehlendes in **einer** Frage nachfragen. Unbekannt darf leer bleiben.

Ist es ein bestehendes Gemälde, das übermalt/überarbeitet wurde, dann kommt **kein neuer Eintrag** dazu,
sondern eine neue Fassung (siehe Schritt 4b). Die alte Fassung bleibt.

## 1. Foto vorbereiten
Hochgeladene Bilder liegen unter `/root/.claude/uploads/...`. EXIF-Drehung anwenden, lange Seite auf 1800 px,
im Scratchpad speichern als `<id>.jpg`. Die **Bild-ID** wird zum Dateinamen: `titel_in_kleinbuchstaben_<jahr>`
(Umlaute ae/oe/ue, Leerzeichen → `_`, z.B. `sturm_und_zwang_2025`; überarbeitete Fassung z.B. `stadtplan_ueberarbeitet`).

```python
from PIL import Image, ImageOps
im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
k = 1800 / max(im.size); im = im.resize((round(im.width*k), round(im.height*k)), Image.LANCZOS)
im.save(f"{scratch}/{id}.jpg", quality=95)
```

## 2. Freistellen mit Adobe (immer Adobe, nicht von Hand)
1. `adobe_mandatory_init` (einmal pro Gespräch).
2. `asset_initialize_file_upload` (path `<id>.jpg`, Grösse in Bytes, `image/jpeg`).
3. `curl -L -X PUT "<transfer href>" -H "Content-Type: image/jpeg" --data-binary @<datei>` → 200.
4. `asset_finalize_file_upload` mit dem kompletten Transfer-Dokument.
5. `image_remove_background` mit dem `presignedAssetUrl` (ohne Optionen → PNG mit Alpha).
6. `curl -sSL -o <scratch>/<id>.png "<outputUrl>"` – muss gleich gross sein wie das JPG.

Netzwerk: Die Umgebung «Supabase riozma» erlaubt `at.adobe.com`, `acp-aep-cs-blobstore-prod-irl1-data.adobe.io`
und `photoshop-api.adobe.io`. Blockiert ein anderer Adobe-Host, ihn mit `update_environment` freigeben lassen.

## 3. Galerie-Look erzeugen
```bash
python -I scripts/art-compose.py <scratch>/<id>.jpg <scratch>/<id>.png
```
- Weisse Leinwand auf weisser Wand (Freisteller trifft nur die Striche): `--rect` anhängen.
- Erwartete Ausgabe: `ok <id> [quad, WB]`. Schreibt `src/img/artManuel/{highRes,lowRes,thumb,micro}/`.
- **Prüfen:** `thumb/<id>-min.jpg` und den Alpha-Kanal des PNG ansehen (Leinwand sauber, gerade, nichts abgeschnitten,
  keine Wand am Rand). Bei Problemen nicht weitermachen, sondern Ursache klären.
- Wird ein **bereits vorhandenes** Bild neu bearbeitet (gleiche ID), `ART_IMG_VERSION` in `src/artworks-data.js` erhöhen.

## 4. Eintrag in `src/artworks.json`
### 4a. Neues Gemälde
Neue Zeile, sortiert nach Jahr (neueste oben), nach den Einträgen mit gleichem oder neuerem Jahr:
```json
{"id":"sturm_und_zwang_2025","title":"Sturm und Zwang","year":"2025","size":"100x80","medium":"Acrylic on canvas","available":null},
```
### 4b. Neue Fassung eines bestehenden Gemäldes
Beim bestehenden Eintrag (ID bleibt, damit Links funktionieren) `versions` ergänzen; die erste Fassung ist das Titelbild:
```json
"year":"2022 / 2026", "versions":[{"img":"stadtplan_ueberarbeitet","label":"überarbeitet 2026"},{"img":"PXL_20220723_152954029","label":"ursprünglich 2022"}]
```
Das Werk erscheint so nur einmal in der Galerie; auf der Werkseite kann man umschalten.

JSON danach validieren (`python3 -c "import json;json.load(open('src/artworks.json'))"`).

## 5. Standort auf der privaten Karte
Die Karte `/kunst/karte.html` liest `public.artwork_locations` (Supabase, RLS nur für manuelzeltner@gmail.com).
Standorte **nie** in Repo-Dateien schreiben. Eintrag per Supabase Management API (Token in `$SUPABASE_ACCESS_TOKEN`,
Projekt `lwxwcogvkhixfsfvkcvz`, `POST https://api.supabase.com/v1/projects/<ref>/database/query`). Schreiben in die
Live-Datenbank vorher vom Nutzer bestätigen lassen. Koordinaten = Ortszentrum (4 Nachkommastellen), keine Adressen.
```sql
INSERT INTO public.artwork_locations (artwork_id, place, holder, status, lat, lng)
VALUES ('<id>', 'Zürich', 'Paul', 'ok', 47.3769, 8.5417)
ON CONFLICT (artwork_id) DO UPDATE SET place=EXCLUDED.place, holder=EXCLUDED.holder,
  status=EXCLUDED.status, lat=EXCLUDED.lat, lng=EXCLUDED.lng, updated_at=now();
```
`status`: `ok` | `unknown` (Standort unbekannt) | `gone` (existiert nicht mehr; dann place/lat/lng NULL).
Bei einer neuen Fassung (4b) ändert sich nichts an der Karte (gleiche Werk-ID).

## 6. Testen, committen, online stellen
1. Lokal kurz prüfen: `python3 -m http.server`, Galerie `/kunst/` und Werkseite `/kunst/werk.html?id=<id>` mit Playwright
   öffnen (keine JS-Fehler, Bild erscheint; bei 4b nur ein Eintrag in der Galerie und Umschalter funktioniert).
2. Commit z.B. `Kunst: neues Gemälde «<Titel>» (<Jahr>)` auf dem zugewiesenen Branch, normal pushen (kein Force-Push).
3. Online stellen nur nach Zustimmung des Nutzers: Pull Request auf `main`, Squash-Merge.
4. GitHub Pages («pages build and deployment») beobachten. Hängt der Deploy-Schritt bei `syncing_files` und bricht
   mit «Timeout reached» ab, ist das ein GitHub-Problem: den Lauf neu starten (`rerun_workflow_run`), nicht den Code ändern.

## 7. Abschluss
Dem Nutzer kurz melden: was online ist, Titel/Jahr/Grösse wie eingetragen, Standort auf der Karte.
Hinweisen, dass die bearbeitete highRes-Version noch im Google-Drive-Ordner Kunst/Gemälde abgelegt werden kann.
