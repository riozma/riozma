# E-Mail via Resend (Supabase Edge Function)

## Kurzüberblick

| Wo | Was |
|---|---|
| **Resend** | API Key erstellen, Domain verifizieren (oder Sandbox testen) |
| **Supabase** | Secrets `RESEND_API_KEY` + optional `TROUVO_FROM_EMAIL` |
| **Trouvo Info** | Anmeldung → E-Mail → «Bestätigungsmail senden» |
| **Cursor Resend-Plugin** | Nur für Entwicklung/Diagnose — **nicht** für den Live-Versand |

Der Live-Versand läuft ausschliesslich über die Edge Function `send-registration-email` mit dem Secret in Supabase.

## 1. Resend einrichten

1. Account auf [resend.com](https://resend.com)
2. **API Keys** → neuen Key erstellen (`re_…`)
3. **Domains** → eigene Domain verifizieren (z. B. `riozma.ch`) **oder** zum Testen die Sandbox nutzen:
   - Absender `onboarding@resend.dev` (nur an die bei Resend hinterlegte Test-E-Mail)

## 2. Secrets in Supabase (Pflicht für Versand)

**Nicht** in Code, `.env` im Repo oder Git committen.

Supabase Dashboard → **Project Settings → Edge Functions → Secrets**  
Projekt: `lwxwcogvkhixfsfvkcvz` (riozma)

| Secret | Beispiel |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `TROUVO_FROM_EMAIL` | `Trouvo <noreply@deine-domain.ch>` |

Ohne `TROUVO_FROM_EMAIL` wird `Trouvo <onboarding@resend.dev>` verwendet (nur Sandbox/Test).

CLI (falls installiert):

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref lwxwcogvkhixfsfvkcvz
npx supabase secrets set TROUVO_FROM_EMAIL="Trouvo <noreply@deine-domain.ch>" --project-ref lwxwcogvkhixfsfvkcvz
```

Ohne `RESEND_API_KEY` antwortet die Function mit **503** — die Anmeldung selbst funktioniert trotzdem.

## 3. Cursor Resend-Plugin

Das Plugin ist für **Administration und Tests** in Cursor, nicht der Runtime-Pfad der App.

1. Cursor → Settings → MCP / Resend-Plugin
2. Dort denselben API Key eintragen wie in Supabase
3. Danach kannst du Domains listen und Test-Mails senden

Wenn `list-domains` «API key is invalid» meldet: Key in Resend prüfen, ggf. neu erstellen und im Plugin **und** in Supabase aktualisieren.

## 4. In Trouvo aktivieren

Info → **Anmeldung** → **E-Mail** → «Bestätigungsmail senden» aktivieren.

Mail geht nur raus, wenn der Gast eine E-Mail angegeben hat.

## Ablauf

```
Gast meldet sich an → Insert event_registrations
  → Client: supabase.functions.invoke('send-registration-email', { registration_id })
  → Edge Function → Resend API → Bestätigungsmail
```

## Test

1. Secrets in Supabase gesetzt
2. Event live schalten
3. Bestätigungsmail in Info aktivieren
4. Als Gast mit E-Mail anmelden

Logs: Supabase Dashboard → **Edge Functions → send-registration-email → Logs**

## Sicherheit

API Keys nie im Chat oder Git teilen. Bei Leak: Key in Resend widerrufen und neuen setzen.
