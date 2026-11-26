# riozma.ch – Hinweise für Claude

- Website von Manuel Rio Zeltner (statisch, GitHub Pages ab `main`, Supabase `lwxwcogvkhixfsfvkcvz`). Antworten auf Deutsch.
- Projekt-Skills liegen in `.claude/skills/` (z.B. `kunst-gemaelde` für neue Gemälde in der Kunstgalerie).

## Skills wachsen lassen
Manuel will, dass seine eigenen Skills mit der Zeit wachsen. Darum:
- Wird eine Aufgabe wiederholbar oder entsteht ein fester Ablauf, **von dir aus** am Ende der Antwort einen Skill
  vorschlagen (Name, wofür, «soll ich ihn anlegen?»). Nicht darauf warten, dass Manuel fragt.
- Bestehende Skills verbessern statt doppelt anlegen. Neue Erkenntnisse oder Fallstricke aus einer Aufgabe in den
  passenden Skill nachtragen.
- Repo-spezifische Skills kommen nach `.claude/skills/<name>/SKILL.md`.

## Supabase-Zugriff (Datenbank ändern)
- Der Supabase-**Connector** (MCP) sieht nur das Projekt «bauvision», nicht riozma → dort gibt es «keine Berechtigung».
- Für riozma stattdessen die Umgebungsvariable `SUPABASE_ACCESS_TOKEN` (in der Cloud-Umgebung hinterlegt) mit der
  Management-API nutzen. Token nie ausgeben oder ins Repo schreiben.
  ```bash
  python3 -c "import json;print(json.dumps({'query':open('supabase/migrations/<datei>.sql').read()}))" > /tmp/q.json
  curl -sS -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
    --data @/tmp/q.json https://api.supabase.com/v1/projects/lwxwcogvkhixfsfvkcvz/database/query
  ```
- Nach neuen Funktionen/Spalten den API-Cache neu laden, sonst «function not found in schema cache»:
  Query `notify pgrst, 'reload schema';` über denselben Endpunkt schicken.
- Migrationen trotzdem als Datei unter `supabase/migrations/` ablegen. Danach mit dem Anon-Key über
  `https://lwxwcogvkhixfsfvkcvz.supabase.co/rest/v1/rpc/<funktion>` prüfen, ob Gäste nur das Erlaubte dürfen.
