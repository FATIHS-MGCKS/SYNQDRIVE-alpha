import type { DiV0ValidatedPositionWindow } from './di-v0-position-acquisition.types';
import { DI_V0_POSITION_QUERY_SPEC_V0_1 } from './di-v0-position-acquisition.versions';

/**
 * Historical position query for DI V0. Selects only the bucket label and the location signal
 * so that row existence is not inflated by unrelated signals.
 */
export function buildDiV0HistoricalPositionQuery(
  dimoTokenId: number,
  window: DiV0ValidatedPositionWindow,
): string {
  if (!Number.isSafeInteger(dimoTokenId) || dimoTokenId <= 0) {
    throw new Error('dimoTokenId must be a positive integer');
  }
  const spec = DI_V0_POSITION_QUERY_SPEC_V0_1;
  return `
    query DiV0HistoricalPosition {
      signals(
        tokenId: ${dimoTokenId}
        from: "${window.fromUtc}"
        to: "${window.toUtc}"
        interval: "${spec.interval}"
      ) {
        ${spec.bucketLabelField}
        ${spec.signal}(agg: ${spec.coordinateAggregation}) { latitude longitude }
      }
    }
  `.trim();
}
