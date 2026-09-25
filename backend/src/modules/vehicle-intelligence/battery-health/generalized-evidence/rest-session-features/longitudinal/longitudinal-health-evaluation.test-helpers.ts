import { buildLongitudinalAssessmentInputV1 } from './longitudinal-assessment-input.adapter';
import type { M3_3E_LongitudinalAssessmentInputV1 } from './longitudinal-assessment-input.types';
import type { LongitudinalInputFeatureScalars } from './longitudinal-input.types';
import {
  buildE1GoldenConsumptionFixture,
  buildE1OkFromSessions,
} from './longitudinal-assessment-input.test-helpers';
import type { LongitudinalInputSessionInventoryItem } from './longitudinal-input.types';
import {
  buildProfileTestInventoryItem,
} from './longitudinal-profile.test-fixtures';
import type { RestSessionFeatureInputAnchorResolutionStatus } from '../rest-session-feature-input-snapshot.types';

export function buildE3InputFromSessions(
  sessions: LongitudinalInputSessionInventoryItem[],
  revisionId = 'e3-test-rev',
): M3_3E_LongitudinalAssessmentInputV1 {
  const fixture = buildE1OkFromSessions(sessions, revisionId);
  const built = buildLongitudinalAssessmentInputV1(fixture);
  if (built.status !== 'OK') {
    throw new Error(`E1 build failed: ${built.reason}`);
  }
  return built.input;
}

export function buildE3GoldenInput(): M3_3E_LongitudinalAssessmentInputV1 {
  const f = buildE1GoldenConsumptionFixture();
  const built = buildLongitudinalAssessmentInputV1(f);
  if (built.status !== 'OK') {
    throw new Error('golden E1 build failed');
  }
  return built.input;
}

export function sessionWithFeatures(input: {
  restSessionId: string;
  anchorAt: string;
  features?: Partial<LongitudinalInputFeatureScalars>;
  anchorResolutionStatus?: RestSessionFeatureInputAnchorResolutionStatus;
}): LongitudinalInputSessionInventoryItem {
  const item = buildProfileTestInventoryItem({
    restSessionId: input.restSessionId,
    anchorAt: input.anchorAt,
    inclusionMode: 'DEFAULT',
  });
  if (input.features && item.features) {
    item.features = { ...item.features, ...input.features };
  }
  if (input.anchorResolutionStatus && item.snapshot) {
    item.snapshot = { ...item.snapshot, anchorResolutionStatus: input.anchorResolutionStatus };
  }
  return item;
}
