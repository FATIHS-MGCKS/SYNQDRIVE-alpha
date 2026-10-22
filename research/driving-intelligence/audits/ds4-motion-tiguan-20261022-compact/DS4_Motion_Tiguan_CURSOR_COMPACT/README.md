# DS4 Motion – kompaktes Cursor-Auditpaket

Dieses Paket enthält die geprüften Referenztabellen, eingefrorenen S4-/Motion-Daten,
den unabhängigen Replay, zwei nicht integrierte Forschungsvarianten und deren Ergebnisse.
Es ist kein Produktpatch und kein vollständiger Repository-Checkout.

1. `CURSOR_PROMPT.md` ist der vollständige Arbeitsauftrag.
2. `AUDIT_REPORT.md` enthält die intensive Auswertung mit allen sieben numerischen Tabellen.
3. `SOURCE_MANIFEST.json` benennt die eingefrorenen Repository-Quellen und Commit-SHAs.
4. `PACKAGE_SHA256.json` bindet alle übrigen Dateien dieser kompakten Ausgabe.

## Reproduzieren

Voraussetzungen: Node 24 (TypeScript Type-Stripping) und Python 3.
Keine zusätzlichen Python-Pakete, Bilder, Originalvideos, Netzwerkverbindung oder Datenbank erforderlich.

```bash
bash run_audit.sh
```

Der Lauf prüft Eingabe-/Kanal-Hashes, reproduziert die gespeicherte Baseline und
erzeugt danach die Forschungsvergleiche in `analysis/`. Bereits enthaltene Ergebnisse
werden dabei neu berechnet. Der Markdown-Bericht ist der archivierte Audittext,
kein automatisch aktualisierter Ergebnisbericht nach beliebigen Codeänderungen.

## Inhalt und Einordnung

- `evaluation/reference/`: 1.464 Referenzzeilen, elf sichtbare Nullfolgen, neun Manöverfenster und Video-Provenienz.
- `evaluation/snapshots/`: unveränderte S4-/Motion-Eingaben plus ältere Tiguan-Fixture vom 19.10.
- `analysis/audit_metrics.json`: vollständige Metriken, Abdeckung, gemeinsame Paare, Zeitversatzsensitivität und RPM mit eigener Paarungsmaske.
- `analysis/motion_comparison.csv`: zeilenweiser Vergleich, fehlende Werte bleiben leer.
- `analysis/stop_run_audit.json` und `analysis/event_window_audit.json`: Einzelauswertung der Referenzfenster.
- `analysis/candidate_experiment.json`: GPS-Experiment A und 18 Assertions/Szenarien.
- `analysis/temporal_ablation.json`: OBD-Ablation B sowie Kombination A+B.
- `backend/`: unveränderter Code-Ausschnitt nur für den eingefrorenen Replay; nicht über aktuelles main kopieren.

A behandelt unsichere Endpunkte extremer 1-s-Positionssprünge als ungeeignete Evidenz.
400 km/h ist ein experimenteller, nicht für Produktion kalibrierter Grenzwert.
B entzieht in dieser Fahrt allen 560 OBD-Samples ohne Mess-/Ankunftszeit die punktgenaue
FSM-Autorität. Das ist ein Diagnoseexperiment, kein allgemeines Verwerfen guter OBD-Daten.
Zusätzliche Stillstandszuordnungen bei 1–5 km/h sind ausdrücklich ein offener Prüfpunkt.

Die zweite Tiguan-Fixture validiert A auf C4/Events/Position-only-FSM.
Nicht vorhandene ältere Tesla-Fixtures wurden nicht als bestanden gewertet.
18 lokale Assertions sind kein Ersatz für Backend-Jest oder erforderliche GitHub-CI.

## Bewusst weggelassen

Originalvideos, PNG-Standbilder, Diagrammbilder, bebilderter HTML-Bericht und dessen
Darstellungsskripte. Der Textbericht, Rohreferenzen, Eingabe-Hashes, Prüflogik und
numerischen Ergebnisse bleiben erhalten. Die früher geprüften Originalframes sind
im Bericht mit Clip und Sekunde beschrieben; Video-IDs/Hashes stehen im Referenzmanifest.

Dieses Audit änderte weder Repository noch Produktion. M7A bleibt pausiert;
Mapbox, Scoring und parallele Workstreams wurden nicht verändert.
