# Supabase – riozma

Projekt: **riozma** · `https://lwxwcogvkhixfsfvkcvz.supabase.co`  
Config: `src/supabase-config.js`

## Login

- **E-Mail/Passwort** und **Google** (Google ist im Projekt bereits aktiv)
- Google-Button auf Trouvo, Kunst und Politik

## Trouvo

| Seite | URL |
|-------|-----|
| Dashboard | `/trouvo/` |
| Event bearbeiten | `/trouvo/edit.html` |
| Gast-Anmeldung | `/trouvo/e/?slug=dein-event-name` |

**Live-URL:** `https://riozma.ch/...`

### Supabase Auth (Dashboard) — wichtig

Unter **Authentication → URL Configuration**:

- **Site URL:** `https://riozma.ch` (nicht `localhost`!)
- **Redirect URLs:**
  - `https://riozma.ch/**`
  - optional für lokale Entwicklung: `http://localhost:8080/**`

**Alte localhost-Einträge entfernen**, sonst leitet Login nach OAuth auf `localhost` weiter.

### Als Veranstalter
1. Unter `/trouvo/` anmelden (Google oder E-Mail)
2. «Neue Veranstaltung» → Details, Zeitplan, Felder, Mitbringsel
3. «Veröffentlichen» → Gast-Link kopieren und teilen

### Als Gast
- Link öffnen → Infos lesen → anmelden (Name + optionale Felder + Mitbringsel)

### WhatsApp/Social-Vorschau (Edge Function `event-og`)

Damit geteilte Trouvo-Links in WhatsApp/Facebook/Telegram das Titelbild zeigen, braucht es eine
Edge Function, die Bots serverseitig HTML mit `og:image` ausliefert (die statische Gästeseite
lädt die Daten erst per JS nach, das sehen Crawler nicht).

1. Migration `supabase/migrations/20250629200000_bring_no_qty_and_organizer_name.sql` einspielen
   (`npx supabase login && npx supabase db push --project-ref lwxwcogvkhixfsfvkcvz`, oder SQL im
   Dashboard-Editor ausführen).
2. Function deployen: `npx supabase functions deploy event-og --project-ref lwxwcogvkhixfsfvkcvz`
3. Teilen-Links (Kopieren-Buttons, Web-Share) zeigen automatisch auf die Function-URL
   (`.../functions/v1/event-og?slug=...`), die Bots ausliefert und echte Besucher sofort auf die
   normale Gästeseite weiterleitet.

## Storage (Kunst/Politik-Bilder)

Falls Upload fehlschlägt: Buckets `artworks` und `blog-images` im Dashboard anlegen (public).

## Stammbaum: Rollen, Bearbeiten, Fotos, Kontakte

Migration `supabase/migrations/20261101000000_stammbaum_roles_edit.sql` einspielen.

- **Rollen** unter `/stammbaum/` (Admin-Ansicht): «Ansehen» oder «Bearbeiten», für freigegebene Personen und für
  Einladungen. Admin bleibt fest `manuelzeltner@gmail.com`.
- **Bearbeiten** darf Angaben zu Personen ändern, Fotos hochladen (privater Bucket `stammbaum-photos`, wird von der
  Migration angelegt) und sieht/pflegt Kontaktdaten (Telefon, E-Mail, Adresse …). Betrachter sehen keine Kontaktdaten.
- Änderungen liegen als Überlagerung in `stammbaum_edits` / `stammbaum_contacts`, jede Änderung zusätzlich im
  Protokoll `stammbaum_edit_log` (wer, wann, vorher/nachher).
- **Als Kontakt speichern**: pro Person eine `.vcf`-Datei (Name, Geburtstag, Foto, bei Bearbeitern auch Kontaktdaten).
  Bearbeiter können über «Kontakte» alle auf einmal exportieren und in Google Kontakte importieren
  (contacts.google.com → Importieren); Geburtstage erscheinen dann im Google Kalender.
