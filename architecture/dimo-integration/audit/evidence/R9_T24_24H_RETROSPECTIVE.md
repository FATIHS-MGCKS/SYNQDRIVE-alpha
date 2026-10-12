# R9 — Full 24h retrospective window

| Field | Value |
|-------|-------|
| **Window (inclusive start)** | `2026-10-11T20:41:00Z` |
| **Window end (T+24 gate)** | `2026-10-12T20:41:00Z` |
| **Production SHA** | `a4d06c602ff192aa7ba6688a6472100033417bca` |
| **Evidence class** | VERIFIED_PRODUCTION (R4.5 session @ `2026-10-12T20:59Z`) + historical authority cross-refs |

## Counter / log continuity caveats

| Event | UTC | Impact on metrics/logs |
|-------|-----|------------------------|
| Backend deploy / PM2 restart | `2026-10-12T13:20:46Z` (R4.1a) | Prometheus process counters **reset**; `increase(...[24h])` spans pre- and post-deploy |
| PM2 log rotation | `synqdrive-out__2026-10-12_00-00-00.log` | Oct-11 evening webhooks appear in rotated file with Oct-12 filename |

Prometheus **24h** aggregates are **indicative**, not a precise integral over the retrospective window alone.

---

## A. Webhook ingress (PM2 application logs)

| Segment | Evidence | Result |
|---------|----------|--------|
| `2026-10-11T20:41` – `2026-10-11T23:59` | Rotated + active logs sampled | **VERIFIED** — burst ingress **tokenId 187361** (`dimo.trigger`), e.g. `20:41:38Z`–`20:53:08Z` (15+ lines in R4.5 session) |
| `2026-10-12T00:00` – `2026-10-12T13:20` | **NOT_MEASURED** in this pass — log volume not fully scanned | — |
| `2026-10-12T13:20` – `2026-10-12T19:04` | Active `synqdrive-out.log` post-deploy | **VERIFIED** — ingress **tokenId 192922** through `2026-10-12T19:04:35Z` |
| `2026-10-12T20:41` – `2026-10-12T20:59` (post-gate) | Active log | **0** ingress lines — see [R9_T24_EVALUATION.md](./R9_T24_EVALUATION.md) |

**Authorized cohort tokens observed in window:** **187361**, **192922** (ingress). **186946**, **187784**: no ingress lines in sampled logs — **NOT_OBSERVED** (not proof of absent provider events).

**Per-replica log attribution:** **NOT_MEASURED** — PM2 streams are not labeled replica a/b in sampled lines; both backends share public URL via nginx (see webhook security doc).

**Trigger types in samples:** `type=dimo.trigger` (speed/ignition path in controller).

---

## B. Provider wiring @ window end

Read-only `r9-post-get-audit.mjs` @ `2026-10-12T20:59Z`:

- **4/4** authorized tokens **186946, 187361, 187784, 192922**: `speed: true`, `ign: true`
- **187336, 190497**: no R9 speed/ignition links
- Webhook definitions: R9 speed/ignition **enabled**, **failureCount: 0**

---

## C. Wake outcomes (Prometheus)

Cumulative counters @ eval (~`20:59Z`) since last deploy show non-zero totals on **both** replicas (`3001`/`3002`):

| outcome | reason (sample) | Notes |
|---------|-----------------|-------|
| ENQUEUED | SPEED_MOVEMENT, IGNITION_ON | Small counts — wake admitted |
| ALREADY_COVERED | SPEED_MOVEMENT, IGNITION_ON | Coalesced |
| IGNORED_FSM_ACTIVE | SPEED_MOVEMENT, IGNITION_ON | Dominant — FSM not RESTING |

`increase(...[25m])` **after** `20:41Z` gate: **all 0** (no new wake counter movement in short post-gate slice).

**Full-window wake rate:** **NOT_MEASURED** precisely due to deploy reset; qualitative: ingress on Oct-11 evening + Oct-12 afternoon implies wake processing occurred, but per-event correlation **NOT_PROVEN** from logs alone.

---

## D. Snapshot poll correlation

Post-gate ~25m slice @ eval: `snapshot_poll` increase **success ~31**, **failure ~301**; **IDENTITY client_error ~306** (403 tokens) — consistent with R4.1b.

Linking a specific webhook timestamp → enqueue → successful VLS write in the **full 24h** window: **NOT_OBSERVED** as a single correlated trace (no archived payload store).

---

## E. Natural RESTING → wake → snapshot E2E

| Claim | Status |
|-------|--------|
| Historical natural **start** wake (KS MS 661, token **187361**) | **VERIFIED_PRODUCTION** (prior sessions @ Sept–Oct; aligns with Oct-11 `20:41Z` ingress cluster) |
| Full **24h window** closed-loop trace (ingress log line + ENQUEUED metric + snapshot success + trip FSM) | **NOT_OBSERVED** in this audit pass |
| Post-gate `>= 2026-10-12T20:41Z` natural E2E | **NOT_OBSERVED** |

**Not a PASS:** absence of closed-loop proof is **NOT_OBSERVED**, not operational validation.

---

## F. Post-gate appendix (`> 2026-10-12T20:41:00Z`)

Documented in [R9_T24_EVALUATION.md](./R9_T24_EVALUATION.md): **0** webhooks, **0** wake increases (25m), provider wiring PASS.

---

## Repro (read-only)

```bash
sudo grep 'Received DIMO webhook' /root/.pm2/logs/synqdrive-out*.log
sudo node .../r9-post-get-audit.mjs
curl -sf 'http://127.0.0.1:9090/api/v1/query?query=sum%20by%20(outcome)%20(increase(synqdrive_trip_snapshot_wake_total%5B25m%5D))'
```

Artifact: `/opt/cursor/artifacts/DIMO_R45_R9_T24_PRODUCTION.txt`
