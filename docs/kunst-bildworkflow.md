# Kunst: Bild-Workflow (neue Gemälde)

Ziel: alle Gemälde einheitlich – gleiche Wand (#EEEBE6), 4:5-Format, gleich grosse Fläche, sanfter Schatten, leichte Tonwertkorrektur.

1. Foto in `src/img/artManuel/` ablegen bzw. auf max. 1800 px Kantenlänge verkleinern (EXIF-Drehung beachten).
2. Zu Adobe hochladen: `asset_initialize_file_upload` → curl PUT → `asset_finalize_file_upload`.
3. `image_remove_background` (Parameter `imageURI`) → PNG mit Alpha herunterladen (curl -L).
4. `python -I scripts/art-compose.py <id>.jpg <id>.png` (Original + Freisteller, gleiche Pixelgrösse): Perspektive begradigen (4 Ecken), Weissabgleich/Belichtung nach echter Wand, gleich breite Ränder (Format 4:5..5:4), Wand #ECE9E4. Erzeugt `highRes/<id>.jpg` (lange Seite 2000), `lowRes/<id>-min.jpg` (1250), `thumb/<id>-min.jpg` (650), `micro/<id>-min.jpg` (110, ~2 KB, Platzhalter fürs progressive Laden).
   - Weisse Leinwand auf weisser Wand (Freisteller trifft nur die Striche): zusätzlich `--rect`.
   - Danach `ART_IMG_VERSION` in `src/artworks-data.js` erhöhen (Browser-Cache).
5. Eintrag in `src/artworks.json` (id = Dateiname ohne Endung; title, year, size, medium, available).
6. Gemälde-Ordner in Google Drive (Kunst/Gemälde) mit der bearbeiteten highRes-Version aktualisieren.
