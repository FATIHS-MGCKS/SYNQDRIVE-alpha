import { processDiV0M7aRoadAssignmentShadowTrip } from '../di-v0-m7a-road-assignment-shadow-processor';
import {
  buildM7aRoadAssignmentShadowDiscoveryIntentKey,
  resolveM7aRoadAssignmentShadowOsmDataVersion,
} from '../di-v0-m7a-road-assignment-shadow-intent';

describe('DiV0M7aRoadAssignmentShadowProcessor', () => {
  it('rejects discovery intent mismatch before decode', async () => {
    const result = await processDiV0M7aRoadAssignmentShadowTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      workItemId: 'wi-1',
      boundaryFingerprint: 'bf',
      snapshotHash: 'snap-hash',
      sourceFamily: 'RUPTELA_R1',
      combinedInputIdentity: 'input-id',
      discoveryIntentKey: 'wrong-intent-key',
      osmDataVersion: resolveM7aRoadAssignmentShadowOsmDataVersion({}),
      snapshotRow: {
        organization_id: 'org-1',
        vehicle_id: 'veh-1',
        trip_id: 'trip-1',
        boundary_fingerprint: 'bf',
        acquisition_window_start: new Date(),
        acquisition_window_end: new Date(),
        channel_manifest: [],
        payload_gzip: Buffer.from('{}'),
        uncompressed_bytes: 2,
      },
      shadowByBucket: new Map(),
      osmProvider: {
        kind: 'TEST_FIXTURE',
        async resolve() {
          return { status: 'MISS', osmContextKey: 'ctx:test', reason: 'FIXTURE_MISS' };
        },
      },
    });

    expect(result.kind).toBe('SNAPSHOT_INVALID');
    if (result.kind === 'SNAPSHOT_INVALID') {
      expect(result.summary.errorCode).toBe('DISCOVERY_INTENT_MISMATCH');
    }
  });

  it('builds stable discovery intent from snapshot + algo fingerprint', () => {
    const osmDataVersion = resolveM7aRoadAssignmentShadowOsmDataVersion({});
    const a = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
      pinnedSnapshotHash: 'abc',
      combinedInputIdentity: 'c1',
      osmDataVersion,
    });
    const b = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
      pinnedSnapshotHash: 'abc',
      combinedInputIdentity: 'c1',
      osmDataVersion,
    });
    expect(a).toBe(b);
    expect(a).toContain('DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_INTENT_V1:sha256:');
  });
});
