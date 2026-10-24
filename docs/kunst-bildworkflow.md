# Kunst: Bild-Workflow (neue Gemälde)

Ziel: alle Gemälde einheitlich – gleiche Wand (#EEEBE6), 4:5-Format, gleich grosse Fläche, sanfter Schatten, leichte Tonwertkorrektur.

1. Foto in `src/img/artManuel/` ablegen bzw. auf max. 1800 px Kantenlänge verkleinern (EXIF-Drehung beachten).
2. Zu Adobe hochladen: `asset_initialize_file_upload` → curl PUT → `asset_finalize_file_upload`.
3. `image_remove_background` (Parameter `imageURI`) → PNG mit Alpha herunterladen (curl -L).
4. `python -I scripts/art-compose.py <id>.png` erzeugt `highRes/<id>.jpg` (1600x2000), `lowRes/<id>-min.jpg` (1000x1250), `thumb/<id>-min.jpg` (520x650).
   - Weisse Leinwand auf weisser Wand (Freisteller trifft nur die Striche): `--rect <original.jpg> <cutout.png>`.
5. Eintrag in `src/artworks.json` (id = Dateiname ohne Endung; title, year, size, medium, available).
6. Gemälde-Ordner in Google Drive (Kunst/Gemälde) mit der bearbeiteten highRes-Version aktualisieren.
