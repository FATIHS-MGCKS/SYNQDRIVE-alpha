import type { DiV0PositionAcquisitionFailureClass } from '../../position-acquisition/di-v0-position-acquisition.types';
import { mapDiV0S4cPositionFailure } from '../di-v0-s4c-position-failure-map';

const CLASSES: DiV0PositionAcquisitionFailureClass[] = [
  'INVALID_REQUEST',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK',
  'PROVIDER_HTTP_ERROR',
  'PROVIDER_BUDGET_UNAVAILABLE',
  'GRAPHQL_ERROR',
  'MALFORMED_RESPONSE',
  'UNKNOWN',
];

describe('DI V0 S4C position failure mapping', () => {
  it('is exhaustive over S3A failure classes', () => {
    for (const failureClass of CLASSES) {
      const retryable = ['RATE_LIMITED', 'TIMEOUT', 'NETWORK', 'PROVIDER_BUDGET_UNAVAILABLE'].includes(failureClass);
      const action = mapDiV0S4cPositionFailure({
        failureClass,
        retryable,
        httpStatus: null,
        safeMessage: 'test',
      });
      expect(action).toBeDefined();
    }
  });
});
