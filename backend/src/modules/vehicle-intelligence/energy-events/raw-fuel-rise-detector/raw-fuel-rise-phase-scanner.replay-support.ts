import type { DetectedRiseDraft } from './raw-fuel-rise-state-machine';
import type { RawFuelRisePhaseScannerPreBaseline } from './raw-fuel-rise-phase-scanner.types';

/** F3 channel-rise pre plateau + recency — no fabricated freshness. */
export function preBaselineFromChannelRise(draft: DetectedRiseDraft): RawFuelRisePhaseScannerPreBaseline {
  const classification = draft.baselineRecencyMeta?.baselineRecencyClassification;
  const fresh = classification === 'FRESH';
  return {
    medianLiters: draft.prePlateau.median,
    fresh,
    staleReason: fresh ? null : String(classification ?? draft.baselineRecencyReason ?? 'UNKNOWN'),
  };
}
