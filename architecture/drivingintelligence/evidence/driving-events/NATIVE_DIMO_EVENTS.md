# Native DIMO Driving Events — Authority Path

**Why separate from HF reconstruction:** LTE_R1 whole-trip HF is **sparse and variable** (canonical metrics in `evidence/signal-inventory/CADENCE_DENSITY.md` — e.g. RD003 HF ~2.00s, RD002 sealed P50 13.489s; **not** one combined median). Short-lived misuse (kickdown, harsh brake episodes) cannot be asserted reliably from HF point-pair alone.

---

## Available native event types (LTE_R1)

Ingested via `dimo-native-driving-events/` → `DrivingEvent` table.

| Category | Examples | Provenance |
|----------|----------|------------|
| behavior.* | Provider-classified driving behavior | Native DIMO |
| DTC / diagnostic | Separate health path | Not DI misuse primary |

Dedup: `(organizationId, providerFingerprint)`

---

## Authority rules (architectural policy — not per-vehicle observation proof)

| Context | Authority |
|---------|-----------|
| Whole-trip signal summary | HF_HISTORICAL pass (`trip-behavior-enrichment`) |
| Short-event misuse (LTE_R1) | **Native `DrivingEvent`** + event-context enrichment **when observed** |
| HF-derived `TripBehaviorEvent` | Supplementary; assessability-gated |
| Duplicate native + HF same phenomenon | Reconciliation in V2 `MISUSE_RECONCILE` stage (flag-gated) |

**Invariant:** `DI-INV-LTE-NATIVE-AUTHORITY-001`

---

## Relationship to HF reconstruction

```
Native event (anchor timestamp)
    → event-context enrichment (HF window around anchor)
    → assessability dimensions
    → misuse case / decision summary (V2)
```

HF does **not** redefine native event boundaries. HF may **enrich context** (speed at event, surrounding kinematics).

---

## LTE_R1 / sparse-HF reasoning

| Observation | Source |
|-------------|--------|
| C63 RD002: native events NOT_OBSERVED | Vehicle/session specific — **does not reject policy** |
| Tiguan RD003: richer HF set | Per-vehicle signal inventory |
| HF cadence variable by drive/surface/metric | `CADENCE_DENSITY.md` canonical table (RD002 sealed, RD003 HF, LATEST_LIVE poll) |

---

## Webhook / live event sources

Live trip surfaces may receive faster updates; **post-trip DI authority** remains segment-window scoped. Webhook timing ≠ canonical trip enrichment timing.

---

## Limitations

- Native event taxonomy depends on DIMO provider classification quality
- Not all vehicles expose same native behavior events
- Event-context HF may still be sparse around anchor
- RPM webhook candidate integration breadth: **partial / UNKNOWN**

---

## Links

- `evidence/driving-events/DETECTOR_AUDIT.md`
- `research/scoring-models/EPISODE_V2_DESIGN.md`
- `research/HYPOTHESIS_REGISTER.md` — DI-HYP-013
- Code: `lte-r1-behavior-enrichment.service.ts`, `event-context/`
