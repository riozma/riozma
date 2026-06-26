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

## Storage (Kunst/Politik-Bilder)

Falls Upload fehlschlägt: Buckets `artworks` und `blog-images` im Dashboard anlegen (public).
