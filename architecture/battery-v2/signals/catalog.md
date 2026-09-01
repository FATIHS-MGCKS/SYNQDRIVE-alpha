# Battery V2 — Signal Catalog (Bootstrap)

**Epistemic status:** PARTIAL — LV REST signals only; HV catalog not reconstructed.

## LV REST opening / window signals (from `LvRestWindowSignalContext`)

| Signal / field | Role in REST pipeline | Authority node |
|----------------|----------------------|----------------|
| `tripEndAt` | Canonical anchor when authoritative finalized trip known | `BAT-V2-AUTH-TRIP-END-001` |
| `lastActivityAt` | Bridge-only anchor fallback | `BAT-V2-GAP-BRIDGE-FALLBACK-001` |
| `ignitionOn` | Opening gate strong RUNNING / OFF | `BAT-V2-AUTH-LV-OPEN-001` |
| `speedKmh` | Measured stationary evidence for opening | `BAT-V2-AUTH-LV-OPEN-001` |
| `engineRunning` | Load-proxy (`engine_load > 5`); ambiguous at opening | `BAT-V2-AUTH-LV-OPEN-001` |
| `engine_load` | Proxy input; not discarded globally | `BAT-V2-AUTH-LV-MEASURE-001` |
| `lvBatteryVoltage` | LIVE_VOLTAGE observation source | `BAT-V2-SIG-LV-VOLTAGE-001` |

## Not yet catalogued

- HV traction battery signals
- DIMO signal name → canonical field full mapping
- RPM (noted as future layer in #1393 architecture memo)

See [authority.md](./authority.md) and [timestamp-semantics.md](./timestamp-semantics.md).
