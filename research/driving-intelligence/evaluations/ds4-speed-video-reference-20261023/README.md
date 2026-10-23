# DS4 — Geschwindigkeit gegen Video-Referenzen (2026-10-23)

Offline-Bewertung, wie zuverlässig die DS4-Geschwindigkeitspfade (DI-V0 **L3**, Motion-Core **C4**, **FSM**) den
realen Geschwindigkeitsverlauf inkl. Stillstand und Anfahren treffen — gemessen an den vorhandenen, versiegelten
Video-Tacho-Referenztabellen von vier Fahrten. Keine Produktions-, Flag-, Merge- oder Deploy-Änderung; keine
Entwicklung von Beschleunigungs-/Bremsdetektoren.

| Dokument | Inhalt |
| --- | --- |
| [`REPORT.md`](REPORT.md) | Ergebnisbericht: Baseline, Fehlerursachen, Punkte A/B/C, Kandidatenbewertung, Grenzen, Abschlussblock |
| [`EVALUATION_RULES.md`](EVALUATION_RULES.md) | Bewertungsregeln, **vor** der ersten Metrikberechnung fixiert; §9 Kandidatenkriterien; §11 datierte Nachträge |
| [`INPUT_MANIFEST.json`](INPUT_MANIFEST.json) | SHA-256 aller gelesenen Eingaben (identisch für beide Replay-Stände) |
| [`outputs/TABLES.md`](outputs/TABLES.md) | Alle Tabellen (aus `summary.json` gerendert, keine Handabschrift) |
| [`outputs/main/`](outputs/main/) | Replay mit DI-Code `origin/main` `dea2555bb` (= Produktions-DI-Code, s. u.) |
| [`outputs/pr2134/`](outputs/pr2134/) | Replay mit PR #2134 `f95420593` (nicht gemergt, nicht in Produktion) |
| [`outputs/candidate_pr2134_vs_main.json`](outputs/candidate_pr2134_vs_main.json) | Mechanische §9-Auswertung Kandidat #2134 gegen main |
| [`OBD_SPEED_INFLUENCE_MAP.md`](OBD_SPEED_INFLUENCE_MAP.md) | Einflussstellen R1-OBD-Speed auf L3/QC/FSM (main) |
| [`REPORT_OBD_SPEED_CANDIDATE.md`](REPORT_OBD_SPEED_CANDIDATE.md) | Offline-Kandidat „kein OBD-Speed-Einfluss“ vs. main |
| [`outputs/no_obd_speed/`](outputs/no_obd_speed/) | Replay mit `--strip-obd-speed-influence` |
| [`outputs/candidate_no_obd_speed_vs_main_obd_strip.json`](outputs/candidate_no_obd_speed_vs_main_obd_strip.json) | Vergleich Baseline vs. OBD-Strip-Kandidat |
| [`REPORT_PROD_OBD_STRIP.md`](REPORT_PROD_OBD_STRIP.md) | Produktcode-Übernahme + Parität `prod_code` vs. `no_obd_speed` |
| [`outputs/prod_code/`](outputs/prod_code/) | Replay mit Produkt-Checkout (OBD-Speed-Grenzschicht im Code) |
| [`outputs/prod_code_vs_no_obd_speed_parity.json`](outputs/prod_code_vs_no_obd_speed_parity.json) | Mechanische Paritätsprüfung |

## Versionen

| Stand | SHA | Rolle |
| --- | --- | --- |
| `origin/main` | `dea2555bb746550c632f4315dabe08b9481be0df` | Replay-Baseline. DI-Verzeichnis identisch mit dem Produktions-Release `20261023001716_v4994` (`79c537207`, `git diff` auf `backend/src/modules/vehicle-intelligence/driving-intelligence` leer) |
| PR #2134 | `f95420593ecae98d54d1d3185476c66427d2aede` | Zweiter Replay-Stand (`replay_2134`); **offen, nicht gemergt, nicht in Produktion**. Historischer Runtime-Bezug aus #2135 wurde **nicht** als Produktionsstand behandelt |
| PR #2135 | `a87234c87` | Nur gelesen (Audit-Ergebnisse `CORRECTION_VALIDATION.md`, `CLOSING_QA.md`); **unverändert** |
| Algorithmus-Versionen main | `MOTION_CORE_SPEED_C4_V0_1_DEV`, `MOTION_FSM_V0_3_CAND_DEV[staleSpeedContextFix+startingTimeout+evidencePropagation]`, `DI_KINEMATIC_ESTIMATE_V0_1` / `CALIBRATION_UNSET_V0`, Speed-QC `DI_V0_SPEED_QC_POLICY_V2` | identisch mit den in der Tiguan-Shadow-Payload gespeicherten Versionen |
| Algorithmus-Versionen #2134 | `MOTION_CORE_SPEED_C4_V0_5_DEV`, `MOTION_CORE_LEG_CONSISTENCY_V0_5_DEV`; FSM/Ereignis-IDs unverändert | — |

## Referenzfahrten (Rollen siehe `EVALUATION_RULES.md` §2)

| ID | Fahrt | Referenz | Rolle C4 (main) | Rolle #2134 |
| --- | --- | --- | --- | --- |
| TIG22 | VW Tiguan, Trip `98d2a8e0-…`, 2026-10-22 18:38–19:03Z, RUPTELA_R1 | 1 Hz Tacho-Ablesung aus 9 Clips, 1417 lesbare Sekunden | EVAL | **DEV** (Leg-Quarantäne/OBD-Autorität dort abgeleitet) |
| TES21-1 | Tesla, Trip `14c41c06-…`, 2026-10-21 12:03–12:07Z, API_SYNTHETIC | Display-Ablesung, 229 lesbare Sekunden | **DEV** (Motion-Core-Design) | DEV |
| TES21-2 | Tesla, Trip `7a9d6a28-…`, 2026-10-21 12:20–12:24Z | Display-Ablesung, 240 lesbare Sekunden | **DEV** | DEV |
| TES16 | Tesla, Trip `358d0158-…`, 2026-10-16 03:36–03:55Z | Tacho-Ablesung, 973 lesbare Sekunden | EVAL (unabhängig) | EVAL (unabhängig) |

Zur Abstimmung verwendete Fahrten (DEV) liefern **keine** unabhängige Validierung; das ist in allen Tabellen
ausgewiesen.

## Eingaben

`inputs/` enthält Kopien der Referenztabellen und der gepinnten DS4-Eingangsdaten (S4-Evidenzcontainer,
Shadow-Intervalle, Motion-Core-Payload) mit Provenienz-Manifesten; TES16 wird direkt aus
`architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/` gelesen. **Keine Videodateien** sind
enthalten oder nötig; es wurde kein Video erneut gesichtet. Nicht vom Harness gelesene Dateien in `inputs/`
(z. B. `UTC_ALIGNMENT_REPORT.md`, `VEHICLE_AND_TRIP_BINDING.md`, `TRIP_IDENTITY.json`) sind Provenienzbelege
der Ursprungsauswertungen.

## Reproduktion

Voraussetzungen: `backend/node_modules` installiert (ts-node), Node ≥ 20, sauberes DI-Verzeichnis im jeweiligen
Checkout (der Harness bricht sonst ab und protokolliert den HEAD-SHA in `summary.json`).

```bash
cd research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023

# 1) Baseline: DI-Code dieses Checkouts (origin/main dea2555bb)
node scripts/replay_speed_eval.cjs --tag main --expect-sha dea2555bb746550c632f4315dabe08b9481be0df

# 2) Zweiter Stand: PR #2134 in einem eigenen Worktree
git worktree add /tmp/pr2134 f95420593ecae98d54d1d3185476c66427d2aede
ln -s "$(git rev-parse --show-toplevel)/backend/node_modules" /tmp/pr2134/backend/node_modules
node scripts/replay_speed_eval.cjs --code-root /tmp/pr2134 --tag pr2134 --expect-sha f95420593ecae98d54d1d3185476c66427d2aede

# 3) Kandidatenbewertung nach EVALUATION_RULES.md §9 und Tabellen
node scripts/compare_tags.cjs --baseline main --candidate pr2134
node scripts/render_tables.cjs > outputs/TABLES.md

# 4) OBD-Speed-Einfluss entfernen (Offline-Kandidat, Harness-only)
node scripts/replay_speed_eval.cjs --tag no_obd_speed --strip-obd-speed-influence
node scripts/compare_obd_strip.cjs
```

Laufzeit je Replay ≈ 4 s. Die Ausgaben sind deterministisch bis auf `generatedAtUtc`.

## Was dieser Ordner nicht ist

- keine Änderung an DS4-Code, Flags, Workern oder Produktion;
- keine Beschleunigungs-/Bremsdetektor-Entwicklung (Ereignisse nur als Paritätszähler);
- keine sekundengenaue „Ground Truth“ aus groben Tabellen (exakte Sekunde, keine Interpolation, fehlende Werte
  zählen nie als korrekt);
- keine Zeitverschiebung zur Fehlerminimierung (Versatz 0 maßgeblich, Sensitivität getrennt).
