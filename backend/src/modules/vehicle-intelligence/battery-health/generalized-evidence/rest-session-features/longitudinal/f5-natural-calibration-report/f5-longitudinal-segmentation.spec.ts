import { BatteryEvidenceScope } from '@prisma/client';
import { F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE } from './f5-ground-truth-correlation.constants';
import type { F5RevisionEvidenceInterval } from './f5-ground-truth-correlation.types';
import {
  assignRevisionToLongitudinalSegment,
  computeDeterministicSegmentEpochCount,
  computeSegmentAwareContinuityMetrics,
  type F5ReplacementBoundaryV1,
} from './f5-longitudinal-segmentation.policy';

function rev(
  id: string,
  first: string,
  last: string,
): F5RevisionEvidenceInterval {
  return {
    revisionId: id,
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    firstIncludedAnchorAt: new Date(first),
    lastIncludedAnchorAt: new Date(last),
  };
}

function boundary(id: string, effectiveAt: string): F5ReplacementBoundaryV1 {
  return { groundTruthEventId: id, effectiveAt: new Date(effectiveAt) };
}

describe('F5 longitudinal segmentation G3.1', () => {
  const scope = F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE;

  it('G3.1-S1 — two revisions before same replacement share segment identity', () => {
    const boundaries = [boundary('gt-r1', '2026-06-15T00:00:00.000Z')];
    const a = assignRevisionToLongitudinalSegment(
      rev('r1', '2026-05-01T00:00:00.000Z', '2026-05-10T00:00:00.000Z'),
      boundaries,
      scope,
    );
    const b = assignRevisionToLongitudinalSegment(
      rev('r2', '2026-05-11T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      boundaries,
      scope,
    );
    expect(a.kind).toBe('assigned');
    expect(b.kind).toBe('assigned');
    if (a.kind === 'assigned' && b.kind === 'assigned') {
      expect(a.segmentKey).toBe(b.segmentKey);
      expect(a.epochIndex).toBe(0);
    }
  });

  it('G3.1-S2 — pre- and post-replacement revisions have different segment identity', () => {
    const boundaries = [boundary('gt-r1', '2026-06-15T00:00:00.000Z')];
    const pre = assignRevisionToLongitudinalSegment(
      rev('r-pre', '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      boundaries,
      scope,
    );
    const post = assignRevisionToLongitudinalSegment(
      rev('r-post', '2026-06-20T00:00:00.000Z', '2026-06-25T00:00:00.000Z'),
      boundaries,
      scope,
    );
    expect(pre.kind).toBe('assigned');
    expect(post.kind).toBe('assigned');
    if (pre.kind === 'assigned' && post.kind === 'assigned') {
      expect(pre.segmentKey).not.toBe(post.segmentKey);
    }
  });

  it('G3.1-S3 — repeatabilityPairCount ignores pre/post replacement pair', () => {
    const boundaries = [boundary('gt-r1', '2026-06-15T00:00:00.000Z')];
    const assignments = [
      assignRevisionToLongitudinalSegment(
        rev('r-pre', '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
        boundaries,
        scope,
      ),
      assignRevisionToLongitudinalSegment(
        rev('r-post', '2026-06-20T00:00:00.000Z', '2026-06-25T00:00:00.000Z'),
        boundaries,
        scope,
      ),
    ];
    const metrics = computeSegmentAwareContinuityMetrics(assignments);
    expect(metrics.repeatabilityPairCount).toBe(0);
  });

  it('G3.1-S4 — two post-replacement revisions in same segment may repeat', () => {
    const boundaries = [boundary('gt-r1', '2026-06-15T00:00:00.000Z')];
    const assignments = [
      assignRevisionToLongitudinalSegment(
        rev('r1', '2026-06-20T00:00:00.000Z', '2026-06-21T00:00:00.000Z'),
        boundaries,
        scope,
      ),
      assignRevisionToLongitudinalSegment(
        rev('r2', '2026-06-22T00:00:00.000Z', '2026-06-25T00:00:00.000Z'),
        boundaries,
        scope,
      ),
    ];
    const metrics = computeSegmentAwareContinuityMetrics(assignments);
    expect(metrics.repeatabilityPairCount).toBe(1);
  });

  it('G3.1-S5 — crossing effectiveAt is intervention_crossing', () => {
    const boundaries = [boundary('gt-r1', '2026-06-15T12:00:00.000Z')];
    const assignment = assignRevisionToLongitudinalSegment(
      rev('r-x', '2026-06-14T00:00:00.000Z', '2026-06-16T00:00:00.000Z'),
      boundaries,
      scope,
    );
    expect(assignment.kind).toBe('intervention_crossing');
    const metrics = computeSegmentAwareContinuityMetrics([assignment]);
    expect(metrics.interventionCrossingRevisionCount).toBe(1);
    expect(metrics.repeatabilityPairCount).toBe(0);
  });

  it('G3.1-S6 — two replacements produce three epochs', () => {
    expect(
      computeDeterministicSegmentEpochCount(2),
    ).toBe(3);
  });
});
