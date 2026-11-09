# FPL Weekly: Beobachtungsliste

Themen, bei denen die Redaktion besonders dranbleibt. Die wöchentliche Aufgabe prüft **jedes Thema in jeder Ausgabe**
(gezielte Suche, nicht nur Zufallsfunde) und trägt neue Stände unten ein. Eine wesentliche Änderung bekommt einen eigenen
Beitrag (meist Rubrik `tools` oder `digital`). Ist eine wichtige Meldung in der Vorwoche durchgerutscht, darf sie bis zu
zwei Wochen später erscheinen, mit Vermerk in `generated.method`.

## 1. MCP- und KI-Verbindungen für Bauingenieur-Software

**Beobachten:** MCP-Server, Konnektoren und KI-Assistenten für die Programme, mit denen Bauingenieurinnen und Bauingenieure rechnen,
zeichnen und koordinieren: Statik und Bemessung (SCIA, FRILO, Dlubal RFEM/RSTAB, Axis VM, Cubus, Tekla Structural Designer, ETABS/SAP2000, Sofistik),
Bewehrung und Ausführung (Allplan, Tekla Structures, Revit), Infrastruktur und Tiefbau (Civil 3D, OpenRoads/MicroStation, Bentley),
Koordination und Prüfung (Bluebeam, Solibri, Navisworks), Datenstandards (IFC, ODA). Dazu herstellerübergreifende Verbindungen.

**Wesentlich ist:** ein neuer offizieller Server für ein Statik- oder Bemessungsprogramm, der Schritt von «nur lesen» zu «schreiben»,
Beta zu allgemein verfügbar, eine Verbindung über mehrere Hersteller hinweg, neue Bedingungen (Lizenz, Preis, nur eigener Assistent).

**Stand (zuletzt geprüft 2026-11-09):**

| Programm | Stand | Quelle |
|---|---|---|
| Revit | Public MCP Server seit April 2026, ab 2027.2 (29.9.2026) auch Write und Experimental | Internet für Architekten, 4.11.2026 |
| AutoCAD / Civil 3D | Public Beta, nur mit Autodesk Assistant | dto. |
| Archicad 30 | Public MCP Server, Beta, regional | dto. |
| Allplan 2027 | MCP-Server (IDE und Agent), seit 28.10.2026 | dto. |
| SCIA, FRILO, RISA, SDS2 | KI-Funktionen in Allplan Max 2027, kein eigener MCP-Server bekannt | Nemetschek, 29.10.2026 |
| Bluebeam | MCP in Bluebeam Max seit Mai 2026 | dto. |
| MicroStation (Bentley) | Early Access für ausgewählte Kunden | Internet für Architekten |
| Rhino / Grasshopper | McNeel Rhino MCP Platform | dto. |
| Tekla Structures, Vectorworks, BricsCAD | kein offizieller Server, nur Community | dto. |
| Dlubal, Sofistik, Cubus, Axis VM, ETABS | noch nicht geprüft | |
| Qonic | eigener MCP-Server, KI-Agenten im Modell (5.11.2026) | AEC Magazine |
| ODA (DWG, IFC, STEP) | angekündigt, selbst gehostete MCP-Server | AEC Magazine, Juli 2026 |
| Herstellerübergreifend | Autom8Labs: Konnektoren für 9 Programme (Autodesk, Bentley, McNeel) plus 22 Skills | AEC Magazine, 3.11.2026 |

## 2. KI-Benchmarks für Planung und Bau (AEC)

**Beobachten:** die gängigsten Benchmarks, die messen, wie gut KI-Modelle Bauaufgaben lösen, und neue Modelle,
die dort etwas deutlich Neues können.

**Wesentlich ist:** ein Sprung des Bestwerts (etwa 10 Prozentpunkte oder mehr, oder eine Schwelle wie 50 % oder 80 %),
ein neuer Benchmark, der sich durchsetzt, eine Änderung der Methode, die alte Werte unvergleichbar macht, oder ein Modell,
das eine bisher ungelöste Bauaufgabe zuverlässig kann (z. B. Ausmass aus Plänen, Modelländerungen in IFC, Statik-Nachweise).
Immer nennen, wer gemessen hat (Autoren, Hersteller, unabhängig) und ob die Werte vergleichbar sind.

**Stand (zuletzt geprüft 2026-11-09):**

| Benchmark | Misst | Bestwert bisher | Quelle |
|---|---|---|---|
| AEC-Bench (Nomic, April 2026) | Agenten auf Plansätzen, Spezifikationen, Submittals; 196 Aufgaben | Nomic-Agent 62 bis 88 je Bereich; Structured AI meldet 84,7 % (selbst gemeldet) | nomic.ai, aechub.org/benchmarks |
| AECV-Bench (AECFoundry, Jan 2026) | Pläne lesen: Objekte zählen, Fragen zu Zeichnungen | Zählen: Gemini 3 Pro 0,51 | arXiv 2601.04819 |
| BIM-Edit (Uni Rostock u. a., 2026) | IFC-Modelle per Sprache ändern; 324 Aufgaben | 49,5 % Durchschnitt, höchstens 3,4 % vollständig gelöst | arXiv 2606.20146 |
| Construction's Last Exam (Togal.AI, Okt 2026) | Ausmass (Takeoff) aus PDF-Plänen; 33 Aufgaben | 2 bis 34 % | Construction Briefing, 13.10.2026 |
| Physical-Engineering's Last Exam (Google, 3.11.2026) | lange Ingenieuraufgaben inkl. Bau und Statik; 85 Aufgaben | 48,3 %, alle Modelle unter 50 % | Google Cloud Blog |
| Construction AI Leaderboard (ONESTRUCTION, 7.11.2026) | Mittel aus AEC-Bench, BIM-Edit, IFC-Bench-V2, CEQuest, IDS | Spitze um 73,7 Punkte, eigene Läufe, nicht mit offiziellen Werten vergleichbar | Hugging Face Blog |
| Structural engineering benchmark (Uni Neapel, Mai 2026) | Statikaufgaben in drei Stufen, 800 Instanzen | noch keine Werte veröffentlicht | Zenodo 20189957 |
