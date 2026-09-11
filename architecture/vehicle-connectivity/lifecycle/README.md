# Connectivity Lifecycle (Vehicle Connectivity)

**Status:** Scaffold only — canonical lifecycle states **not** finalized.

## Intended semantic dimensions (proposed)

- **Provider link** — consent, binding, DIMO `connectionStatus` mirror
- **Source freshness** — `sourceTimestamp` age buckets (live / standby / delayed / offline)
- **Physical device** — OBD plug, episodes, unplug webhooks
- **Fault class** — sleep vs disconnect vs provider vs permission vs CAN absence

Full state machine documentation awaits Phase 1–2 audit.

See [../research/OPEN_HYPOTHESES.md](../research/OPEN_HYPOTHESES.md) (VC-HYP-005, VC-HYP-006).
