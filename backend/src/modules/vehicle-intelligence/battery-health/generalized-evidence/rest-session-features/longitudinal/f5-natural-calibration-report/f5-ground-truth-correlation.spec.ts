import { BatteryEvidenceScope, BatteryGroundTruthType } from '@prisma/client';
import {
  classifyEvidenceIntervalVsReplacementEffectiveAt,
  computeDeterministicSegmentEpochCount,
  computeF5GroundTruthCorrelationBlockV2,
  emptyF5GroundTruthCorrelationBlockV2,
  isAdmissibleGroundTruthAtAsOf,
} from './f5-ground-truth-correlation.policy';
import type { F5GroundTruthRowForCorrelation } from './f5-ground-truth-correlation.types';

function gtRow(partial: Partial<F5GroundTruthRowForCorrelation> & Pick<F5GroundTruthRowForCorrelation, 'id'>): F5GroundTruthRowForCorrelation {
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
    batteryScope: BatteryEvidenceScope.LV,
    effectiveAt: new Date('2026-06-01T12:00:00.000Z'),
    createdAt: new Date('2026-06-01T12:05:00.000Z'),
    verificationStatus: 'CONFIRMED',
    revocations: [],
    ...partial,
  };
}

describe('F5 ground-truth correlation G3', () => {
  const asOf = new Date('2026-12-01T00:00:00.000Z');

  it('G3-A — zero GT rows yields valid linkage infrastructure without crash', () => {
    const block = emptyF5GroundTruthCorrelationBlockV2();
    expect(block.linkageAvailable).toBe(true);
    expect(block.replacementLabelsAvailable).toBe(false);
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(0);
    expect(block.nat009.naturalEvidenceStatus).toBe('COLLECTING');
  });

  it('G3-B — LV replacement correlates only matching org/vehicle', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [
        {
          revisionId: 'rev-1',
          organizationId: 'org-a',
          vehicleId: 'veh-a',
          firstIncludedAnchorAt: new Date('2026-05-01T00:00:00.000Z'),
          lastIncludedAnchorAt: new Date('2026-05-31T23:59:59.000Z'),
        },
      ],
      groundTruthRows: [
        gtRow({
          id: 'gt-1',
          effectiveAt: new Date('2026-06-01T12:00:00.000Z'),
        }),
      ],
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(1);
    expect(block.correlation.affectedVehicleCount).toBe(1);
    expect(block.replacementLabelsAvailable).toBe(true);
  });

  it('G3-C — GT from another organization is rejected from admissible set', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [
        gtRow({ id: 'gt-x', organizationId: 'org-b', vehicleId: 'veh-a' }),
      ],
    });
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(0);
    expect(block.correlation.rejectedCrossVehicleCount).toBe(1);
  });

  it('G3-D — GT for another vehicle is rejected', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [gtRow({ id: 'gt-x', vehicleId: 'veh-b' })],
    });
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(0);
    expect(block.correlation.rejectedCrossVehicleCount).toBe(1);
  });

  it('G3-E — HV replacement cannot segment LV longitudinal correlation', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [
        {
          revisionId: 'rev-1',
          organizationId: 'org-a',
          vehicleId: 'veh-a',
          firstIncludedAnchorAt: new Date('2026-05-01T00:00:00.000Z'),
          lastIncludedAnchorAt: new Date('2026-05-31T00:00:00.000Z'),
        },
      ],
      groundTruthRows: [
        gtRow({
          id: 'gt-hv',
          batteryScope: BatteryEvidenceScope.HV,
        }),
      ],
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
    expect(block.correlation.rejectedCrossScopeCount).toBe(1);
  });

  it('G3-F — revoked replacement does not form active boundary', () => {
    const row = gtRow({
      id: 'gt-revoked',
      revocations: [{ revokedAt: new Date('2026-07-01T00:00:00.000Z') }],
    });
    expect(isAdmissibleGroundTruthAtAsOf(row, asOf)).toBe(false);
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [row],
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
  });

  it('G3-G — superseded replacement is not active boundary', () => {
    const row = gtRow({
      id: 'gt-sup',
      verificationStatus: 'SUPERSEDED',
    });
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [row],
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
  });

  it('G3-H — pre-event interval classified PRE_EVENT', () => {
    expect(
      classifyEvidenceIntervalVsReplacementEffectiveAt(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-02T00:00:00.000Z'),
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    ).toBe('PRE_EVENT');
  });

  it('G3-I — post-event interval classified POST_EVENT', () => {
    expect(
      classifyEvidenceIntervalVsReplacementEffectiveAt(
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-07-02T00:00:00.000Z'),
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    ).toBe('POST_EVENT');
  });

  it('G3-J — interval crossing effectiveAt is INTERVENTION_WINDOW without numeric buffer', () => {
    expect(
      classifyEvidenceIntervalVsReplacementEffectiveAt(
        new Date('2026-05-31T00:00:00.000Z'),
        new Date('2026-06-02T00:00:00.000Z'),
        new Date('2026-06-01T12:00:00.000Z'),
      ),
    ).toBe('INTERVENTION_WINDOW');
    expect(emptyF5GroundTruthCorrelationBlockV2().temporalAuthority.numericInterventionEnvelope).toBe(
      'NONE',
    );
  });

  it('G3-K — multiple replacements yield deterministic segment epoch count', () => {
    const count = computeDeterministicSegmentEpochCount([
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
    ]);
    expect(count).toBe(3);
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [
        gtRow({ id: 'gt-1', effectiveAt: new Date('2026-03-01T00:00:00.000Z') }),
        gtRow({ id: 'gt-2', effectiveAt: new Date('2026-09-01T00:00:00.000Z') }),
      ],
    });
    expect(block.correlation.deterministicSegmentEpochCount).toBe(3);
  });

  it('G3-L — workshop measurement counts without replacement boundary', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [
        gtRow({
          id: 'gt-w',
          groundTruthType: BatteryGroundTruthType.WORKSHOP_MEASUREMENT,
        }),
      ],
    });
    expect(block.correlation.workshopMeasurementGroundTruthCount).toBe(1);
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
    expect(block.correlation.activeReplacementBoundaryCount).toBe(0);
  });

  it('G3-M — deterministic correlation block for identical inputs', () => {
    const input = {
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [
        {
          revisionId: 'rev-1',
          organizationId: 'org-a',
          vehicleId: 'veh-a',
          firstIncludedAnchorAt: new Date('2026-05-01T00:00:00.000Z'),
          lastIncludedAnchorAt: new Date('2026-05-15T00:00:00.000Z'),
        },
      ],
      groundTruthRows: [gtRow({ id: 'gt-1' })],
    };
    expect(JSON.stringify(computeF5GroundTruthCorrelationBlockV2(input))).toBe(
      JSON.stringify(computeF5GroundTruthCorrelationBlockV2(input)),
    );
  });

  it('G3 contract — CAL-007 remains non-causal', () => {
    const block = emptyF5GroundTruthCorrelationBlockV2();
    expect(block.cal007.nonCausal).toBe(true);
    expect(block.cal007.causalityIntroduced).toBe(false);
  });
});
