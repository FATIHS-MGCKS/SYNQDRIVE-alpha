# EXP021 — MAP_DECISION_HYPOTHESIS_V1 (verworfen)

**Status:** `REJECTED` · **v0_2** bleibt unveränderte Vergleichsbasis · **keine** Kartenschwellen-Nachjustierung.

## Ergebnis des Versuchs

Die Regel **`V1_DOWNGRADE_HALT_FAR_FROM_SIGNAL`** (Along-Route-Distanz zur nächsten OSM-`traffic_signals` > 80 m → `LIKELY_HALT` → `NOT_DISTINGUISHABLE`) ist für **allgemeine Halterkennung ungeeignet** und widerspricht dem Auftrag:

- Fehlende oder entfernte Ampeln im Kartenmaterial **dürfen vorhandene Haltindizien** (kleine Chord, Video-Tacho-0-Abschnitte, Lückenmuster) **nicht entwerten**.
- In diesem Referenzlauf wurden **6/6** v0_2-`LIKELY_HALT`-Kandidaten fälschlich abgeschwächt — kein validierter Nutzen.

## Was bleibt

| Artefakt | Nutzung |
|----------|---------|
| `exp021-retrospective-halt-map-hypothesis-v1.lib.ts` | Nur Audit / Reproduktion des verworfenen Versuchs |
| `MAP_REVIEW.html` / `mapContextVariantB` | **Reine Kontextanzeige** |
| Bewegung vs. Ursache | Getrennt: Detektor-Klasse (v0_2) vs. **mögliche Ursache** (ampelnah / Kreuzung / sonst / unbekannt) — **ohne** Rotphase- oder Haltbeweis |

## Entscheidungswirksame Karte (Zukunft)

Erfordert **eigenen Nachweis** (Hypothese, Datenlage, Gegenfälle) — nicht durch Schwellen-Tuning auf dieser Fahrt.
