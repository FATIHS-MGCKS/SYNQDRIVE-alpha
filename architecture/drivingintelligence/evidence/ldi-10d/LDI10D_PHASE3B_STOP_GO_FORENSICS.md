# LDI-10D Phase 3B — Stop-and-go forensics

## Root cause: zero CONFIRMED standstills / stop-go in Phase 3A

- **Kein** beobachteter TRUSTED/TRUSTED_LIMITED Bucket mit Geschwindigkeit **≤ 3 km/h** auf der gesamten Fahrt.
- Trip-Minimum (GPS present): **~5.07 km/h** (UNTRUSTED QC) bzw. höher bei TRUSTED-only.
- Stillstandsregel (≤3 km/h, ≥2 s, vollständig TRUSTED) ist auf dieser Evidenz **nicht erfüllbar** → **NO_EVIDENCE**, nicht „kein Halt in der Realität“.

## Klassifikation (Produktionsregel ≤3 km/h / 2 s)

| Klasse | Anzahl Intervalle |
| --- | --- |

## Diagnostik ≤8 km/h (1 s)

- Intervalle: **8**
- STOP_AND_GO_CANDIDATE: **0**
- QC_BLOCKED in Low-Speed-Fenstern: siehe Einzelfall-Sequenzen in JSON

**Signal / Pedal / Intent:** UNKNOWN (keine unabhängige Evidenz).