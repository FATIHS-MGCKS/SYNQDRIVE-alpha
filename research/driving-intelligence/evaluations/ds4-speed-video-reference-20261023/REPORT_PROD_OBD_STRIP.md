# Produktionsübernahme — R1-OBD-Speed aus DS4-Kinematik/QC/FSM (2026-10-23)

Separater Draft-PR (nicht #2136). Übernimmt den in #2136 geprüften Offline-Kandidaten
(`--strip-obd-speed-influence`) in den echten DI-Produktcode.

## 1. Produktcode

| Modul | Pfad |
| --- | --- |
| Grenzschicht | `backend/.../r1-obd-acquisition/di-v0-r1-vehicle-speed-ds4-boundary.ts` |
| L3 | `core/compute-trip-intervals.ts` — `r1Obd` für Intervall-Compute geleert |
| Speed-QC | `speed-qc/evaluate-di-v0-speed-qc-interval.ts` — R1 für Verdict geleert |
| Motion-Core-Shadow | `motion-core-shadow-worker/` — FSM ohne sparse R1; OBD-Serie weiterhin in Evidence für Vergleich (`R1_VEHICLE_SPEED_EXCLUDED_FROM_DS4_FSM`) |

**Unverändert:** R1-Acquisition, Pinning, andere OBD-Felder, Trip-Lifecycle, C4 (bereits GPS-only), GPS-Ausreißerschutz und unbekannte Werte.

## 2. Abhängigkeit PR #2134

| Prüfung | Ergebnis |
| --- | --- |
| `gh pr view 2134` | **OPEN**, `mergedAt: null` |
| `git merge-base --is-ancestor f95420593 origin/main` | **nicht** auf main |
| In diesem PR enthalten | **Nein** — kein Leg-Gate, kein `fsmPointAuthority`, keine C4-V0.5-Quarantäne aus #2134 |

#2134 bleibt ein **separater** Kandidat (C4/OBD-Autorität); seine Schutzwirkung darf hier **nicht** vorausgesetzt werden.

## 3. Parität Produktcode vs. Offline-Kandidat

Replay aller vier Referenzfahrten mit **geändertem** Produktcheckout (`fdf398f97`, Tag `prod_code`) gegen
versiegelte Eingaben; Offline-Referenz Tag `no_obd_speed` (Harness-Strip auf älterem Eval-Commit, gleiche Logik).

```bash
cd research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023
node scripts/replay_speed_eval.cjs --code-root <repo> --tag prod_code --expect-sha fdf398f971e069c0cf9ef03d8f25e6dab4d4bbfe
node scripts/compare_prod_to_offline.cjs
```

**Ergebnis:** `outputs/prod_code_vs_no_obd_speed_parity.json` → **`identical: true`** für TIG22, TES21-1, TES21-2, TES16
(Speed-Serien `replay_l3`, `replay_l3_qc`, `replay_c4`; Motion/FSM; implausible C4-Sekunden gemäß Harness).

Damit reproduziert der Produktcode auf der Stichprobe exakt den Offline-Kandidaten — inkl. QC-Gewinn (+284 gepaarte TIG22-Sekunden),
FSM 16→0 falsche Bewegung auf TIG22, unveränderte L3/C4-Zahlen und 7 C4-implausible Sekunden.

## 4. Regressionstests (lokal)

```bash
cd backend
npm test -- --testPathPattern='di-v0-r1-vehicle-speed-ds4-boundary|di-v0-motion-core-shadow|di-v0-speed-qc-s1-p1-composed|di-v0-speed-qc.hardening|di-v0-pure-core|di-v0-r1-obd-acquisition|di-v0-s3b-r1-closure'
```

## 5. Verbleibende Einschränkungen

| Thema | Detail |
| --- | --- |
| **OBD-Speed-Stichprobe** | Effekt messbar vor allem **TIG22** (RUPTELA_R1); TES16 ohne R1; TES21 mit minimalem R1 — **keine** Fleet-Absicherung |
| **Video-Referenz** | Vier Fahrten, 1 Hz Tacho; kein erneutes Video-Sichten |
| **#2134** | C4-Sprung-Quarantäne / Leg-Konsistenz **nicht** Teil dieses PR |
| **OBD-Vergleichsserie** | `obd_kmh` / sparse persistiert; beeinflusst keine Freigabe |
| **R1-Zeitautorität** | INTERVAL_ONLY / C0.3-Containment unverändert; nur Speed-Einfluss auf DS4-Pfade entfernt |
| **Deploy** | Bewusst **nicht** Teil dieses Workstreams |

## 6. Verweise

- Offline-Befund: [`REPORT_OBD_SPEED_CANDIDATE.md`](REPORT_OBD_SPEED_CANDIDATE.md)
- Einflusskarte (main): [`OBD_SPEED_INFLUENCE_MAP.md`](OBD_SPEED_INFLUENCE_MAP.md)
- Forschungs-PR: #2136 (keine Produktionsdiffs)
