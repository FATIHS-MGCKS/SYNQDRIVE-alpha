import { BatteryEvidenceScope, BatteryGroundTruthSourceAuthority, BatteryGroundTruthType } from '@prisma/client';
import {
  buildGroundTruthSuccessorsByPriorId,
  isGroundTruthActiveAtAsOf,
} from '../../../../ground-truth/ground-truth-historical-authority.util';
import {
  classifyEvidenceIntervalVsReplacementEffectiveAt,
  computeDeterministicSegmentEpochCount,
  computeF5GroundTruthCorrelationBlockV2,
  emptyF5GroundTruthCorrelationBlockV2,
  filterAdmissibleGroundTruthAtAsOf,
} from './f5-ground-truth-correlation.policy';
import { emptyF5SegmentationSummary } from './f5-segmentation-summary.util';
import type { F5GroundTruthRowForCorrelation } from './f5-ground-truth-correlation.types';

function gtRow(partial: Partial<F5GroundTruthRowForCorrelation> & Pick<F5GroundTruthRowForCorrelation, 'id'>): F5GroundTruthRowForCorrelation {
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
    batteryScope: BatteryEvidenceScope.LV,
    sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
    effectiveAt: new Date('2026-06-01T12:00:00.000Z'),
    createdAt: new Date('2026-06-01T12:05:00.000Z'),
    verificationStatus: 'CONFIRMED',
    supersedesGroundTruthEventId: null,
    revocations: [],
    ...partial,
  };
}

const emptySeg = emptyF5SegmentationSummary;

describe('F5 ground-truth correlation G3', () => {
  const asOf = new Date('2026-12-01T00:00:00.000Z');

  it('G3-A — zero GT rows yields valid linkage infrastructure without crash', () => {
    const block = emptyF5GroundTruthCorrelationBlockV2(emptySeg());
    expect(block.linkageAvailable).toBe(true);
    expect(block.replacementLabelsAvailable).toBe(false);
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(0);
    expect(block.nat009.naturalEvidenceStatus).toBe('NONE');
    expect(block.nat009.validationSampleMaturity).toBe('NOT_EVALUATED');
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
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(1);
    expect(block.correlation.affectedVehicleCount).toBe(1);
    expect(block.replacementLabelsAvailable).toBe(true);
  });

  it('G3-C — GT from another organization is outside primary cohort admissible set', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [
        gtRow({ id: 'gt-x', organizationId: 'org-b', vehicleId: 'veh-a' }),
      ],
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(0);
    expect(block.correlation.gtQueryScope).toBe('PRIMARY_COHORT_ORG_VEHICLE_PAIRS');
  });

  it('G3-D — GT for another vehicle is outside primary cohort admissible set', () => {
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [gtRow({ id: 'gt-x', vehicleId: 'veh-b' })],
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(0);
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
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
    expect(block.correlation.rejectedCrossScopeCount).toBe(1);
  });

  it('G3-F — revocation on/before asOf excludes row from admissible set', () => {
    const row = gtRow({
      id: 'gt-revoked',
      revocations: [{ revokedAt: new Date('2026-07-01T00:00:00.000Z') }],
    });
    const successors = buildGroundTruthSuccessorsByPriorId([row]);
    expect(isGroundTruthActiveAtAsOf(row, asOf, successors)).toBe(false);
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [row],
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
  });

  it('G3-G — superseded replacement with successor before asOf is not an active boundary', () => {
    const prior = gtRow({
      id: 'gt-sup',
      verificationStatus: 'SUPERSEDED',
    });
    const successor = gtRow({
      id: 'gt-new',
      effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      supersedesGroundTruthEventId: 'gt-sup',
    });
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [prior, successor],
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(1);
    expect(block.correlation.admissibleActiveGroundTruthCount).toBe(1);
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
    expect(emptyF5GroundTruthCorrelationBlockV2(emptySeg()).temporalAuthority.numericInterventionEnvelope).toBe(
      'NONE',
    );
  });

  it('G3-K — multiple replacements yield deterministic segment epoch count', () => {
    expect(computeDeterministicSegmentEpochCount(2)).toBe(3);
    const block = computeF5GroundTruthCorrelationBlockV2({
      asOf,
      primaryVehicleKeys: new Set(['org-a::veh-a']),
      primaryRevisionIntervals: [],
      groundTruthRows: [
        gtRow({ id: 'gt-1', effectiveAt: new Date('2026-03-01T00:00:00.000Z') }),
        gtRow({ id: 'gt-2', effectiveAt: new Date('2026-09-01T00:00:00.000Z') }),
      ],
      segmentationSummary: emptySeg(),
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
          sourceAuthority: BatteryGroundTruthSourceAuthority.WORKSHOP,
        }),
      ],
      segmentationSummary: emptySeg(),
    });
    expect(block.correlation.workshopMeasurementGroundTruthCount).toBe(1);
    expect(block.correlation.batteryReplacementGroundTruthCount).toBe(0);
    expect(block.correlation.activeReplacementBoundaryCount).toBe(0);
    expect(block.nat008.naturalEvidenceStatus).toBe('PRESENT');
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
      segmentationSummary: emptySeg(),
    };
    expect(JSON.stringify(computeF5GroundTruthCorrelationBlockV2(input))).toBe(
      JSON.stringify(computeF5GroundTruthCorrelationBlockV2(input)),
    );
  });

  it('G3 contract — CAL-007 remains non-causal', () => {
    const block = emptyF5GroundTruthCorrelationBlockV2(emptySeg());
    expect(block.cal007.nonCausal).toBe(true);
    expect(block.cal007.causalityIntroduced).toBe(false);
  });

  it('G3.1-A5 — filterAdmissibleGroundTruthAtAsOf is deterministic for identical DB-shaped rows', () => {
    const rows = [gtRow({ id: 'gt-1' })];
    const keys = new Set(['org-a::veh-a']);
    const a = filterAdmissibleGroundTruthAtAsOf(rows, asOf, keys);
    const b = filterAdmissibleGroundTruthAtAsOf(rows, asOf, keys);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
