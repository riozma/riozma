---
name: spielgrafik-einbauen
description: KI-generierte Pixel-Art (z.B. Spritesheets von ChatGPT) in ein Spiel auf riozma.ch einbauen, vor allem Blubberbiss. Verwenden, wenn Manuel Bilder/Spritesheets für Figuren, Animationen, Icons schickt oder einen Prompt für neue Spielgrafiken will.
---

# Spielgrafik einbauen (Blubberbiss & Co.)

## 1. Prompt für ChatGPT schreiben
- Immer mit festem **Stil-Block** (unten), damit alles zusammenpasst. Prompt auf Englisch, Erklärung an Manuel auf Deutsch.
- Manuel will **alles in einem Prompt**, ChatGPT soll alle Bilder erzeugen und als **ZIP** mit README (Bildanzahl,
  Grösse, Reihenfolge) liefern. Hinweis geben: Falls ChatGPT stoppt → «weiter, bis die ZIP fertig ist».
- Jedes Sheet: **eine Reihe**, gleich grosse Bilder, Objekt immer an derselben Stelle, Blick nach rechts.
- Für Teile, die sich **bewegen/drehen** sollen (z.B. Kraken-Arme), gerade Stücke mit runden Enden und
  abgestufter Dicke verlangen; gekrümmte Stücke lassen sich nicht zu einem Arm verketten.

```
STYLE (identical in every frame and every image):
- Retro 16-bit pixel art, crisp hard pixels, no anti-aliasing, no blur, no soft gradients (dithering allowed)
- Dark 1-pixel outlines, light from the top left, side view, facing right
- Bright, saturated colors, cute and funny, slightly exaggerated
- Background: flat solid magenta #FF00FF everywhere, no shadows on the background,
  no text, no letters, no numbers, no logos, no watermark
- All frames in ONE horizontal row, every frame the same size, equal spacing with a clear magenta gap,
  the object always in the same position and the same size so the frames work as an animation
```

## 2. Bilder bekommen
- Bilder liegen unter `/tmp/claude-0/.../images/<n>.png|webp` (Nummer = Reihenfolge im Chat).
- **Nur Bilder in einer eigenen Nachricht** werden gespeichert. Bilder, die kommen, während Claude arbeitet,
  sieht man zwar, sie liegen aber nicht als Datei vor → Manuel bitten, sie nochmals separat zu schicken.
- Pro Nachricht kann Manuel nur 5 Bilder hochladen.

## 3. Zuschneiden
```bash
python3 -I .claude/skills/spielgrafik-einbauen/slice_sprites.py <bild> <name> <anzahl> --out blubberbiss/sprites
```
- Teilt in gleich breite Zellen (ChatGPT hält das meist ein: z.B. 1024/4 = 256). Teilbereiche mit `--x0/--x1/--y0/--y1`
  (z.B. Krakenkopf links, Arm-Stücke rechts oben). `--full`, wenn Koordinaten erhalten bleiben müssen (Glücksrad).
- Kontrollbild aller Streifen auf blauem Grund erzeugen und anschauen (Ränder, Rosa-Säume, abgeschnittene Teile).
- Für Ringe/Räder die Mitte und den Innenradius messen und in `sprites.json` ergänzen (`cx`, `cy`, `r`).

## 4. Einbauen (Blubberbiss: `blubberbiss/game.js`)
- `SPRITE_META` in game.js aus `sprites/sprites.json` übernehmen (der Lader lädt alle Einträge automatisch).
- Helfer: `sprReady(name)`, `sprFrame(name, i, breite)` (verkleinert mit harter Kante, gecacht),
  `drawSpr(name, i, x, y, breite, spiegeln, ankerX, ankerY)`, `drawSprRot(...)` für gedrehte Teile.
- **Immer Ersatz behalten:** `if (!drawSpr(...)) { alte gezeichnete Version }` – Spiel läuft auch ohne Bilder.
- Grösse an der Spielfigur ausrichten (Breite des gezeichneten Fischs × ~1.15–1.3), Hitboxen nicht ändern.
- Spieler-Skins, Icons in Garderobe/Statistik/Glücksrad ebenfalls auf Sprites umstellen (`spriteIcon`).
- Platz prüfen: Im Solo ist der Himmel niedrig (`SURF` ≈ 20 % der Höhe) → hohe Figuren begrenzen.

## 5. Testen
- Browsertest wie in `artefakt-auf-website` beschrieben (lokal servieren, supabase-js lokal, REST abfangen, `?debug`).
- Mit `window.__bb` gezielt Szenen auslösen (`emitFeat`, `spawnSpecial`, `startWheel` …) und Screenshots
  in Sequenz machen; Animationen zu verschiedenen Zeitpunkten prüfen.
- Danach commit, push; nach `main` nur auf Manuels Wunsch.
