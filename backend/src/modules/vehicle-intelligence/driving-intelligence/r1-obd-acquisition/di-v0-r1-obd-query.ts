import { DI_V0_R1_OBD_QUERY_SPEC_V0_1 } from './di-v0-r1-obd-acquisition.versions';
import type { DiV0ValidatedPositionWindow } from '../position-acquisition/di-v0-position-acquisition.types';

/**
 * Bounded historical OBD subset — same DIMO `signals(interval:"1s")` family as legacy HF,
 * without position coordinates (S3A owns coordinates).
 */
export function buildDiV0HistoricalR1ObdQuery(
  tokenId: number,
  window: DiV0ValidatedPositionWindow,
): string {
  const signalLines = DI_V0_R1_OBD_QUERY_SPEC_V0_1.signals
    .map((s) => `        ${s.providerField}(agg: ${s.aggregation})`)
    .join('\n');
  return `
    query DiV0R1ObdHistorical {
      signals(
        tokenId: ${tokenId}
        from: "${window.fromUtc}"
        to: "${window.toUtc}"
        interval: "${DI_V0_R1_OBD_QUERY_SPEC_V0_1.interval}"
      ) {
        timestamp
${signalLines}
      }
    }
  `.trim();
}
