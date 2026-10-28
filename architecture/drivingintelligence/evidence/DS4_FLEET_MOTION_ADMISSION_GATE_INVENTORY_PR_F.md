# DS4 / S4 / Motion-Core Gate Inventory (PR-F)

Verified against repository at implementation time. Empty allowlist ⇒ **no admission** unless `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED=1`.

## Chain

| Step | Gate location | Key checks |
|------|---------------|------------|
| Trip COMPLETED | `DiV0S4WorkItemRepository.createWorkItem` | trip status, end_time |
| DI boundary admission | `requireTripDiBoundaryAdmissionReleased` | `raw_detection_meta.diV0BoundaryAdmissionV1.revisionKey` |
| S4 discovery | `DiV0S4DiscoveryService` | master+discovery+position, legacy allowlists OR global rollout, containment notBefore, settlement quiet period, boundary meta in SQL |
| S4 T01 enablement | `evaluateDiV0S4EnablementWithFleetMotionPolicyV1` | role flags, allowlist OR fleet tenancy, kill row |
| S4 worker claim | `claim()` SQL + row enablement | same enablement; legacy allowlist filter on SQL when gate OFF |
| Pinned evidence | S4 T05+ | existing identity + channel runnability |
| Motion-core discovery | `DiV0MotionCoreShadowOutboxRepository.discoverEligible` | shadow flags + enabledSince; legacy shadow allowlists OR global rollout; completed PRIMARY with pin+shadow_run |
| Motion-core row enablement | `evaluateDiV0MotionCoreShadowEnablementWithFleetMotionPolicyV1` | shadow runnable, S4 worker effective, tenancy |
| Motion run persist | motion-core processor | C4/C5.1 partition unchanged |
| DS4 assessment discovery | `ds4-assessment-outbox` | fleet-wide scope (no vehicle UUID list) when assessment worker ON |
| DS4 L2 | processor + engine | canonical scope, boundary, provider/evidence quality |

## Calibration cohort

Four reference vehicles: `ds4-assessment-calibration-cohort.v1.ts` — **not** an admission allowlist for global path.

## Producer / consumer

| Producer | Consumer | Coupling |
|----------|----------|----------|
| S4 PRIMARY COMPLETED + pin | Motion-core shadow outbox | Requires shadow_run_id on work item |
| Motion-core SUCCEEDED run | DS4 assessment outbox | Motion payload + tenancy |
| DS4 assessment | Impact V2 | Separate publication flags (OFF) |
