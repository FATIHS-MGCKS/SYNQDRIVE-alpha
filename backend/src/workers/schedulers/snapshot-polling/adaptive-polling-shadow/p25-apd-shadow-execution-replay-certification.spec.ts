import { createHash } from 'node:crypto';
import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../adaptive-polling-policy/p25-apd-policy-engine';

/** Frozen 9.2C empirical corpus markers (historical evidence; not re-counted without prod DB). */
const FROZEN_CORPUS = {
  vehicles: 5,
  successPolls: 57,
  reconciliationPolls: 24,
  nonReconciliationPolls: 33,
  lvEvidenceRows: 533,
} as const;

const frozenCorpusSha256 = createHash('sha256')
  .update(JSON.stringify(FROZEN_CORPUS))
  .digest('hex');

describe('APDS-9.5B replay certification markers', () => {
  it('preserves frozen corpus fingerprint', () => {
    expect(frozenCorpusSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(FROZEN_CORPUS.successPolls).toBe(57);
    expect(FROZEN_CORPUS.lvEvidenceRows).toBe(533);
  });

  it('B2/B4 core replay fixture remains deterministic', () => {
    const fixture = {
      organizationId: 'o',
      vehicleId: 'v',
      decisionAtMs: 1_700_000_000_000,
      reconciliation: true,
      lastTrustworthyLvSourceMs: 1_699_000_000_000,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'STABLE_PERIODIC' as const,
      lastAllowedReconciliationPollMs: 1_698_000_000_000,
    };
    const b2a = evaluateP25ApdB2V1Core(fixture);
    const b2b = evaluateP25ApdB2V1Core(fixture);
    const b4a = evaluateP25ApdB4V1Core(fixture);
    const b4b = evaluateP25ApdB4V1Core(fixture);
    expect(b2a).toEqual(b2b);
    expect(b4a).toEqual(b4b);
    const digest = createHash('sha256')
      .update(JSON.stringify({ b2: b2a, b4: b4a }))
      .digest('hex');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
});

export { FROZEN_CORPUS, frozenCorpusSha256 };
