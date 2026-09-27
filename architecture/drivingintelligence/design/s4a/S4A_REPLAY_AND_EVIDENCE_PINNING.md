# S4A — Replay and evidence pinning (P2-5 promoted to P1-5, closed at contract level)

**Parent:** [S4A_CONTRACT_DESIGN.md](S4A_CONTRACT_DESIGN.md) §2.2 · **Gaps:** DI-GAP-S4-REPLAY-DESERIALIZER-001, DI-GAP-S4-LOCATION-RETENTION-001, DI-GAP-S4-SHADOW-DELETION-AUDIT-001

## 1. Principle

**`REPLAY_SOURCE_OF_TRUTH` = the pinned, content-addressed evidence snapshot.** `LIVE_DIMO_REQUERY_IS_REPLAY = NO`: re-querying DIMO returns whatever DIMO serves *now* (late data, re-aggregation, retention, schema drift), which is a new acquisition (REACQUISITION), never a reproduction. `NORMALIZED_EVIDENCE_PINNING_REQUIRED = YES`: the pin stores the normalized adapter output (the S3A/S3B snapshot forms), not the raw provider response, so replay does not depend on adapter re-parsing either.

**Why P1:** without pinning, a crash after acquisition and before completion forces a re-acquisition whose result may differ, so "retry" silently becomes "different input". Recalibration experiments would also be irreproducible. This is a correctness property of the S4 identity, not an optimization.

## 2. Container `DI_V0_S4_EVIDENCE_CONTAINER_V1`

A canonical serialization, UTF-8 and newline-separated:

1. The container version.
2. `JSON.stringify([organizationId, vehicleId, tripId, boundaryFingerprint, windowStartIso, windowEndIso])`.
3. For each channel in the order NATIVE_EVENT, POSITION, R1_OBD: a header `JSON.stringify([channel, outcome, reason, channelSnapshotVersion, channelPayloadSha256OrNull, attestationRefOrNull])`, followed by the channel payload in its existing canonical form (for example, position `DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1` is a newline JSON-array form).

`snapshot_hash = DI_V0_S4_EVIDENCE_V1:sha256(container)`. `payload_gzip = gzip(container)`. Wall-clock acquisition time, worker id and request ids are excluded (identity §1).

## 3. Pin lifecycle

| Step | Rule |
|------|------|
| Acquire | only PRIMARY / REACQUISITION items, under a valid lease (T02/T04) |
| Store | `INSERT … ON CONFLICT (organization_id, snapshot_hash) DO NOTHING`: identical evidence dedups across attempts |
| Pin | T05, `WHERE pinned_snapshot_hash IS NULL AND lease_epoch=$e`: first pin wins, never overwritten (immutability trigger) |
| Retry after pin | a crash or failure keeps the pin. The next claim **loads the pin and skips acquisition** (race G). Changed provider evidence after the pin is ignored for this item |
| Load | decompress, **re-hash, and require equality**. On a mismatch → T08 terminal `SNAPSHOT_HASH_MISMATCH` (corruption never silently computes) |
| Replay | RECALIBRATION_REPLAY is created pinned to an existing hash (CHECK) and never acquires |

## 4. Deserializer (implementation prerequisite)

No deserializer exists for the position/R1/native snapshot forms. They are currently write-only canonical strings used for hashing. **DI-GAP-S4-REPLAY-DESERIALIZER-001:** S4D must implement `parse(serialize(x)) = x` (property-tested) for all three channel forms and the container, and prove that `S1(parse(pin)) = S1(original normalized input)` bit-for-bit on fixtures. Until then, completion may use the in-memory normalized input of the same attempt, and retry-after-pin is impossible (the item fails retryable and waits). This is why the deserializer is required **before tiny activation**, not before S4A.

## 5. Storage, size and retention

- Postgres (`bytea`), because `STORAGE_DRIVER=local` in Production. The object store is node-local, while Postgres is shared by both replicas and is already backed up.
- **Size (INFERRED):** about 35 KB gzip per trip (1 Hz position ≈ 30–40 min average trip, plus R1). Per month: ~15 MB for 5 vehicles, ~75 MB for 25, ~300 MB for 100, ~3 GB for 1 000. At 1 000 vehicles, a move to an object store must be decided in a separate slice (`container_version` enables it).
- **Retention (DI-GAP-S4-LOCATION-RETENTION-001):** the snapshot contains 1 Hz location, which is personal data in a rental context. The proposed default is `retention_until = created_at + 90 days`, with an explicit purge job (S4F) that deletes snapshots **and** their dependent work items via the composite FK cascade (S2 runs stay, keeping the intervals but losing replay). This is a design default, **not a legal conclusion**. It must be recorded in a governance note before tiny activation, and a full privacy review is required before scale-up.
- **Canonical deletion:** trip, vehicle or organization deletion cascades snapshots, work items and S2 rows. The audit loss (no tombstone) is accepted as P2: DI-GAP-S4-SHADOW-DELETION-AUDIT-001.
