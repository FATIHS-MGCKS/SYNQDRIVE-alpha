# R9 T+24 Natural Evaluation

| Field | Value |
|-------|-------|
| **Earliest evaluation UTC** | `2026-10-12T20:41:00Z` |
| **Evaluation performed UTC** | `2026-10-12T20:59:45Z` |
| **Production SHA** | `a4d06c602ff192aa7ba6688a6472100033417bca` |
| **Status** | **COMPLETE (read-only)** |

## Checklist

- [x] Provider speed + ignition trigger state — **GET audit** `r9-post-get-audit.mjs` @ prod release (sudo)
- [x] Authorized cohort — **4/4** operational tokens with speed+ignition links: **186946, 187361, 187784, 192922**
- [x] Excluded / denied — **187336, 190497**: no speed/ignition links (187336 linkCount 0; 190497 partial legacy links, speed/ign false)
- [x] Webhook definitions — speed/ignition R9 stableIds enabled, **failureCount: 0** (legacy RPM/OBD definitions also listed)
- [x] Webhooks received **after T+24 gate** (`>= 2026-10-12T20:41:00Z`) — **0** lines in active `synqdrive-out.log`
- [x] Wake metrics post-window — `sum(increase(synqdrive_trip_snapshot_wake_total[25m]))` by outcome: **all 0** @ eval time
- [x] Snapshot poll post-window (~25m) — success **~31**, failure **~301**, IDENTITY client_error **~306** (403 pattern persists)
- [ ] End-to-end natural RESTING→wake→enqueue→snapshot for new drive — **NOT_OBSERVED** in T+24 window (no ingress)

## Interpretation

| Verdict | Meaning |
|---------|---------|
| **Provider wiring** | **PASS** for authorized cohort at evaluation time |
| **Natural R9 wake in T+24 window** | **NOT_OBSERVED** — not a FAIL; fleet had no qualifying provider trigger delivery after gate |
| **Last ingress before gate** | `2026-10-12T19:04:35Z` tokenId **192922** (PM2 log) |

## Evidence commands (repro)

```bash
# On VPS (read-only)
sudo node /opt/synqdrive/releases/20261012132046_v4994/backend/scripts/ops/r9-post-get-audit.mjs
curl -sf 'http://127.0.0.1:9090/api/v1/query?query=sum%20by%20(outcome)%20(increase(synqdrive_trip_snapshot_wake_total%5B25m%5D))'
sudo grep 'Received DIMO webhook' /root/.pm2/logs/synqdrive-out.log | grep '2026-10-12T20:' | wc -l
```

**No synthetic webhooks. No provider mutations.**

## Full 24h window

See [R9_T24_24H_RETROSPECTIVE.md](./R9_T24_24H_RETROSPECTIVE.md) (`2026-10-11T20:41:00Z` → `2026-10-12T20:41:00Z`).
