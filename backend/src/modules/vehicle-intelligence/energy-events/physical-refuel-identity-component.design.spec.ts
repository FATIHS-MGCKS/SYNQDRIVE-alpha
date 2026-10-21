import {
  buildPairwiseIdentityMatrix,
  partitionIdentityComponents,
  pairKey,
} from './physical-refuel-identity-component.design';
import * as identityMatcher from './physical-refuel-identity.matcher';
import {
  classifyPhysicalRefuelSibling,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';

describe('physical refuel identity component analysis (G1.2c)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const vehicleId = incidentA.vehicleId;
  const endTime = incidentA.endTime;

  function row(
    id: string,
    fuelStart: number,
    fuelEnd: number,
    startTime: string,
  ): RefuelRowForMatcher {
    return {
      id,
      vehicleId,
      kind: 'REFUEL',
      startTime,
      endTime,
      fuelStartLiters: fuelStart,
      fuelEndLiters: fuelEnd,
      fuelDeltaLiters: fuelEnd - fuelStart,
      fuelStartPercent: fuelStart,
      fuelEndPercent: fuelEnd,
      durationSeconds: 300,
      dimoSegmentId: `seg-${id}`,
    };
  }

  it('rejects mixed-vehicle batch', () => {
    const otherVehicle = { ...incidentA, id: 'other-v', vehicleId: 'other-vehicle' };
    const analysis = buildPairwiseIdentityMatrix([incidentA, otherVehicle]);
    expect(analysis.batchStatus).toBe('MIXED_VEHICLE_BATCH');
    expect(analysis.reasonCodes).toContain('mixed_vehicle_batch');
  });

  it('Sept04 A+B form one valid complete clique', () => {
    const analysis = buildPairwiseIdentityMatrix([incidentA, incidentB]);
    expect(analysis.batchStatus).toBe('VALID_COMPLETE_CLIQUE');
    expect(analysis.components).toHaveLength(1);
    expect(analysis.components[0].memberIds).toEqual([incidentA.id, incidentB.id].sort());
    expect(analysis.components[0].isCompleteSameClique).toBe(true);
  });

  describe('non-transitive A~B, B~C, A!~C — fail closed (all 6 permutations)', () => {
    const rowA = row('a-nt', 5, 28, '2026-09-04T03:40:00.000Z');
    const rowB = row('b-nt', 21, 28, '2026-09-04T03:45:00.000Z');
    const rowC = row('c-nt', 10, 25, '2026-09-04T03:42:00.000Z');

    const permutations: RefuelRowForMatcher[][] = [
      [rowA, rowB, rowC],
      [rowA, rowC, rowB],
      [rowB, rowA, rowC],
      [rowB, rowC, rowA],
      [rowC, rowA, rowB],
      [rowC, rowB, rowA],
    ];

    beforeEach(() => {
      jest.spyOn(identityMatcher, 'classifyPhysicalRefuelSibling').mockImplementation((a, b) => {
        const pair = pairKey(a.id, b.id);
        if (pair === 'a-nt|b-nt' || pair === 'b-nt|c-nt') {
          return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'mock_same' };
        }
        if (pair === 'a-nt|c-nt') {
          return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'mock_distinct' };
        }
        return classifyPhysicalRefuelSibling(a, b);
      });
    });

    afterEach(() => jest.restoreAllMocks());

    it('all permutations yield identical ambiguous component — zero enrichment groups', () => {
      const outcomes = permutations.map((perm) => {
        const analysis = buildPairwiseIdentityMatrix(perm);
        return {
          batchStatus: analysis.batchStatus,
          componentStatuses: analysis.components.map((c) => ({
            ids: c.memberIds,
            status: c.status,
            reasons: c.reasonCodes,
          })),
        };
      });
      for (const outcome of outcomes) {
        expect(outcome).toEqual(outcomes[0]);
      }
      expect(outcomes[0].batchStatus).toBe('AMBIGUOUS_NON_TRANSITIVE');
      expect(outcomes[0].componentStatuses[0].reasons).toContain('non_transitive_identity_component');
    });
  });

  it('A~B with C DISTINCT — valid [A,B] + [C] cliques', () => {
    const rowA = row('a-d', 5, 28, '2026-09-04T03:40:00.000Z');
    const rowB = row('b-d', 21, 28, '2026-09-04T03:45:00.000Z');
    const rowC = row('c-d', 5, 20, '2026-09-02T10:00:00.000Z');
    rowC.endTime = '2026-09-02T10:10:00.000Z';

    const analysis = buildPairwiseIdentityMatrix([rowA, rowB, rowC]);
    expect(analysis.components).toHaveLength(2);
    const groups = analysis.components.map((c) => c.memberIds.sort().join(',')).sort();
    expect(groups).toEqual(['a-d,b-d', 'c-d']);
    expect(analysis.components.every((c) => c.status === 'VALID_COMPLETE_CLIQUE')).toBe(true);
  });

  it('three true siblings form one complete clique', () => {
    const s1 = row('s1', 5, 28, '2026-09-04T03:40:00.000Z');
    const s2 = row('s2', 21, 28, '2026-09-04T03:45:00.000Z');
    const s3 = row('s3', 15, 28, '2026-09-04T03:46:00.000Z');
    const matrix = buildPairwiseIdentityMatrix([s1, s2, s3]).matrix!;
    const components = partitionIdentityComponents(matrix);
    expect(components).toHaveLength(1);
    expect(components[0].memberIds).toHaveLength(3);
    expect(components[0].status).toBe('VALID_COMPLETE_CLIQUE');
  });
});
