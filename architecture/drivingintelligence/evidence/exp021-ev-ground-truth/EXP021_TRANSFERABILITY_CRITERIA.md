# EXP021 — Übertragbarkeitskriterien (v0_2 eingefroren)

**Stand:** 2026-10-16 · PR #2051  
**Detektor:** `EXP021_RETROSPECTIVE_HALT_PROTOTYPE_V0_2` — **keine** Schwellen- oder Score-Anpassung in diesem Prüflauf.

## Zweck

Robustheitsprüfung des eingefrorenen retrospektiven Lücken-/Halt-Prototyps auf **bereits exportierte / gepinnte** Fahrten.  
**Ohne unabhängige Video-Referenz keine Trefferquote behaupten.**

## Bewertungsachsen (unabhängig vom Detektor)

| Achse | Bedeutung |
|-------|-----------|
| **A** | Mindestens 1 s annotiertes Tacho 0 im Lückenfenster (nur Tesla-Referenz mit Kompakt-Review) |
| **B** | „Gesamtes Fenster durchgehend Tacho 0“ — **NO** sobald mindestens eine gelabelte Bewegungssekunde bekannt ist; unbekannte Sekunden allein erzwingen nur **CANNOT_PROVE** |
| **C** | Halt-Beginn/Ende/Dauer — **NOT_DETERMINED** (Detektor liefert das nicht) |

„Halt im Fenster vorhanden“ (LONG_HALT-Overlap / Kandidaten-Overlap) bleibt von B getrennt.

## Fahrtauswahl (dieser Lauf)

| Quelle | Kriterium |
|--------|-----------|
| Tesla EV-GT-Referenz | `358d0158-b2a9-47ed-af26-33926c5770b4` — einzige Fahrt mit **partiellem** externem Video-GT |
| `EXP021_P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1.json` | 10 eingefrorene P21-Pins — Stopps/`STATIONARY_BAND`, Bewegungslücken, unterschiedliche Dauer (ursprüngliche P1-V2-Auswahlregel) |

**Integration getrennt auswerten:**

- **TESLA_SOFTWARE_DIMO** — Fahrzeug `68868291-5478-42cd-b0c4-cc77b2a78e21`
- **RUPTELA_LTE_R1** — u. a. `19fedd4b-c4e8-4de8-a125-dab293326e7e` und Manifest-Fahrzeuge gleicher Familie

## Fehlende unabhängige Validierungsfälle (Video-GT nächster Schritt)

1. Halt **ohne** Ampel / ohne eindeutigen Kreuzungskontext  
2. Langsames **Durchrollen ohne** vollständigen Halt  
3. **Stop-and-go**-Cluster  
4. **Weiterfahrt** bei Positions-/Datenlücke  
5. **Rangieren** / Rückkehr nahe denselben Koordinaten  

## Explizit ausgeschlossen

- Trip-Start-Workstream  
- Beschleunigungs-/Bremsbewertung  
- Provider-Abrufe, Produktionsmutationen  
- Nachkalibrierung / MAP-Entscheidungs-Veto (V1 abgelehnt)
