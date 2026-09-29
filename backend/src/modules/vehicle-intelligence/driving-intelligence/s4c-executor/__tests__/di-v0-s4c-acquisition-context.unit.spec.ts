import { resolveDiV0S4cAcquisitionContext } from '../di-v0-s4c-acquisition-context';
import { API_SYNTHETIC_IDENTITY, R1_IDENTITY } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { buildDiV0S4BoundaryFingerprint } from '../../s4a-foundation/di-v0-s4a-identity';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';

function rowFixture(overrides: Record<string, unknown> = {}) {
  const start = new Date('2030-01-01T00:00:00.123Z');
  const end = new Date('2030-01-01T00:10:00.456Z');
  const fp = buildDiV0S4BoundaryFingerprint({
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    tripStatus: 'COMPLETED',
    startTime: start,
    endTime: end,
    dimoSegmentId: 'seg',
    mergeParentTripId: null,
    boundaryRepairGeneration: null,
  });
  return {
    organization_id: 'org-1',
    vehicle_id: 'veh-1',
    trip_id: 'trip-1',
    boundary_fingerprint: fp,
    run_purpose: 'PRIMARY',
    pinned_snapshot_hash: null,
    trip_status: 'COMPLETED',
    start_time: start,
    end_time: end,
    dimo_segment_id: 'seg',
    merge_parent_trip_id: null,
    raw_detection_meta: {},
    token_id: 42,
    raw_json: API_SYNTHETIC_IDENTITY,
    ...overrides,
  };
}

describe('resolveDiV0S4cAcquisitionContext', () => {
  it('C-API-01: device identity resolves API_SYNTHETIC', async () => {
    const prisma = { $queryRaw: jest.fn(async () => [rowFixture()]) } as unknown as import('@prisma/client').PrismaClient;
    const result = await resolveDiV0S4cAcquisitionContext(prisma, {
      workItemId: 'wi',
      leaseEpoch: BigInt(1),
      leaseOwner: 'o',
      attemptCount: 1,
      transitionId: 'T02_CLAIM',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.sourceFamily).toBe('API_SYNTHETIC');
      expect(resolveDiV0SourceFamily(API_SYNTHETIC_IDENTITY).sourceFamily).toBe('API_SYNTHETIC');
    }
  });

  it('C-API-02: RUPTELA_R1 identity from raw_json not hardwareType', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [rowFixture({ raw_json: R1_IDENTITY })]),
    } as unknown as import('@prisma/client').PrismaClient;
    const result = await resolveDiV0S4cAcquisitionContext(prisma, {
      workItemId: 'wi',
      leaseEpoch: BigInt(1),
      leaseOwner: 'o',
      attemptCount: 1,
      transitionId: 'T02_CLAIM',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.sourceFamily).toBe('RUPTELA_R1');
  });

  it('records widened second-aligned window', async () => {
    const prisma = { $queryRaw: jest.fn(async () => [rowFixture()]) } as unknown as import('@prisma/client').PrismaClient;
    const result = await resolveDiV0S4cAcquisitionContext(prisma, {
      workItemId: 'wi',
      leaseEpoch: BigInt(1),
      leaseOwner: 'o',
      attemptCount: 1,
      transitionId: 'T02_CLAIM',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.widenedStartMs).toBeGreaterThanOrEqual(0);
      expect(result.context.widenedEndMs).toBeGreaterThanOrEqual(0);
      expect(result.context.windowStart.toISOString()).toMatch(/:00:00\.000Z$/);
    }
  });
});
