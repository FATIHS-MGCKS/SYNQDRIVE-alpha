# EXP021 EV Ground Truth — reference protocol

**Status:** PREPARED (pre-deploy baseline); video ground truth **not** ingested.  
**Epistemic rule:** No unverified metric is recorded as a measurement outcome in authority or frozen JSON.

## Purpose

Establish a **durable, replayable** reference campaign for EV-relevant signals:

- speed (multiple observability classes),
- acceleration / deceleration (derived, with explicit windows),
- recuperation / pedal / power display semantics (only when independently observed).

This campaign supports **offline evaluation** of the **unchanged** production speed/QC/projection path before any optimization. It is **not** a deploy artifact.

## Owner-confirmed scope

Single trip on Tesla Model 3 (`tokenId=186946`), identities in [README.md](./README.md).  
Do **not** substitute trip `72617129-…` or other morning candidates without owner re-confirmation.

## Semantic separation (mandatory)

| Class | Meaning |
|-------|---------|
| Observed speed | Tachometer, video GPS overlay, DIMO/SynqDrive L3 — each with its own bias/latency |
| Pedal / throttle display | Only when video OCR + visual QA confirm semantics |
| Power / recuperation display | Display indication only; not recovered energy without meter |
| Derived acceleration | From speed time series over explicit windows; gaps forbid implied dynamics |
| Friction braking | Not inferred from deceleration alone |
| Recuperation claim | Requires power/energy evidence; deceleration ≠ regen |

Mark **UNKNOWN** when not observable. Title “Ground Truth” does **not** bypass source criticism.

## Baseline phases

1. **PRE_DEPLOY** — capture now at Production SHA (read-only RR transaction + pinned replay).  
2. **POST_DEPLOY** — separate read-only capture after owner-authorized joint deploy; **preserve** pre-deploy pin; never overwrite old pin.

If boundaries change post-deploy: store **new revision** alongside old evidence and document deltas.

## Admission and product read (expectation)

At pre-deploy: `diV0BoundaryAdmissionV1` may be **missing** while CURRENT V2 projection still exists on Production read paths that predate the admission gate.

**Expectation (until observed):** if trip boundaries are unchanged, reconciliation admission release restores visibility **without** a new S4 fetch.

## Repair / FSM

Document FSM state, repair history (including **SUPPRESSED** `PARTIAL_TRIP_BOUNDARY_EXTENSION`), boundary repair generation, and live vs pinned boundary fingerprint.

## Video

Owner reports video exists with Berlin second clock, GPS speed/coords, tachometer, and a pedal-related overlay — **semantics unverified** until ingest per [EXP021_EV_GROUND_TRUTH_VIDEO_PROTOCOL.md](./EXP021_EV_GROUND_TRUTH_VIDEO_PROTOCOL.md).

## Optimization gate (later)

Any change requires: hypothesis → offline experiment → comparison to frozen baseline → regression on existing trips → separate review. No blanket QC threshold relaxation for coverage.

## Explicit non-actions

- No deploy from this workstream  
- No admission writes, outbox resets, provider probes, or recomputation in Production  
- No video or raw route geometry in git/PR bodies  
