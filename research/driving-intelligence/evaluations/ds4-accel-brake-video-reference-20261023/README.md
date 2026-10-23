# DS4 — Beschleunigen und Bremsen gegen Video-Referenzen (2026-10-23)

Offline-Bewertung des produktiven DS4-Manöverdetektors (Motion-Core C4 → `detectMotionManoeuvreEvents`, wie im
Motion-Core-Shadow-Processor verdrahtet) gegen die vier vorhandenen, versiegelten Video-Tacho-Referenzen — mit
Produktionsnachweis seit Deploy `579ee8b2`. Keine Verschleiß-Scores, keine Produktions-, Flag-, Merge- oder
Deploy-Änderung, keine Änderung am Geschwindigkeitspfad.

| Dokument | Inhalt |
| --- | --- |
| [`REPORT.md`](REPORT.md) | Ergebnisbericht: Kurzfassung, Baseline, belegte Fehler F1–F6, Kandidaten, Grenzen, Empfehlung, Abschlussblock |
| [`EVALUATION_RULES.md`](EVALUATION_RULES.md) | Bewertungsregeln, **vor** der ersten Metrik fixiert; §10 Kandidatenkriterien; §12 datierte Nachträge N1–N3 |
| [`DETECTOR_INVENTORY.md`](DETECTOR_INVENTORY.md) | Inventar der Beschleunigungs-/Bremsdetektoren (Motion-Core-Pfad A = Prüfgegenstand; HF-Pfade B/C; Auslöser/Steuerung) |
| [`PRODUCTION_RUN_EVIDENCE.md`](PRODUCTION_RUN_EVIDENCE.md) | 21 `SUCCEEDED`-Läufe seit Deploy, Auslöser im Code, Parität Replay ↔ Produktionslauf `15cdc8ae` |
| [`INPUT_MANIFEST.json`](INPUT_MANIFEST.json) | SHA-256 aller gelesenen Eingaben (keine Videos im Repository) |
| [`outputs/main/TABLES.md`](outputs/main/TABLES.md) | Manövertabellen je Fahrt (Orakel, DS4-Ereignisse, Operatorfenster, sichtbare Läufe), gepoolte Kennzahlen |
| [`outputs/main/PROBES.md`](outputs/main/PROBES.md) | Sekundenraster-Sonden der Fehlerfälle (Referenz, C4, Qualität, Flags, Position, OBD) |
| [`outputs/main/CANDIDATES.md`](outputs/main/CANDIDATES.md) | Offline-Kandidaten K-A/K-A2/K-B/K-C gegen Baseline (§10) |
| [`outputs/main/`](outputs/main/) | `summary.json`, `candidates.json`, je Fahrt `*_events.csv`, `*_oracle.csv`, `*_visible_runs.csv`, `TIG22_operator_windows.csv` |

## Reproduktion

Voraussetzung: Checkout mit sauberem DI-Verzeichnis und installiertem `backend/node_modules` (ts-node).

```bash
cd research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023
node scripts/replay_event_eval.cjs --tag main --expect-sha 579ee8b2fed06593d7d2aa57cffb6036dbf53a24
node scripts/candidates.cjs      --tag main --expect-sha 579ee8b2fed06593d7d2aa57cffb6036dbf53a24
node scripts/probe_windows.cjs   --tag main
node scripts/render_tables.cjs   --tag main
```

`--code-root <pfad>` erlaubt den Replay gegen einen anderen Checkout; der HEAD-SHA wird in jede Ausgabe geschrieben.

## Skripte

| Skript | Aufgabe |
| --- | --- |
| `scripts/event_eval_lib.cjs` | Regelkonstanten (`EVENT_RULES`), Orakel-/Laufableitung, Zuordnung und Klassifikation (§5, N1/N2), Grenz-/Lückenmerkmale (§7), Plausibilität (§8), Kandidat K-B |
| `scripts/replay_event_eval.cjs` | Lädt die vier Fahrten (identische Eingaben wie die Speed-Auswertung), rechnet C4 + Detektor, prüft Parität mit dem Processor und dem Produktionslauf, schreibt `outputs/<tag>/` |
| `scripts/candidates.cjs` | Akzeptanz-/Guard-Kandidaten auf unveränderter Ereignismenge, §10-Kriterien mechanisch |
| `scripts/probe_windows.cjs` | Sekundenraster für die im Bericht genannten Fenster |
| `scripts/render_tables.cjs` | Rendert CSV/JSON zu `TABLES.md` (reine Formatierung) |

## Referenzfahrten und Rollen (Regeln §2)

| ID | Fahrt | Quelle | Rolle |
| --- | --- | --- | --- |
| TIG22 | VW Tiguan 2026-10-22, Trip `98d2a8e0` | RUPTELA_R1, Produktionslauf `15cdc8ae` | EVAL |
| TES21-1, TES21-2 | Tesla 2026-10-21, Trip 1/2 | API_SYNTHETIC, Uhrbindung unvalidiert | DEV |
| TES16 | Tesla 2026-10-16 | ldi-10d-Fixture (API_SYNTHETIC) | EVAL |

Eingaben liegen in `../ds4-speed-video-reference-20261023/inputs/` und `architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/`;
neu in diesem Ordner ist nur die Produktions-Payload `inputs/tiguan-20261022/prod_run_v4_20261023/` (lesende Kopie).
