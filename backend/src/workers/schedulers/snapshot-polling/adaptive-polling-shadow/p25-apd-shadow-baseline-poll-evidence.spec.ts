import {
  evaluateBaselineLvSourceAdvanceFromPayload,
  evaluateBaselineSkipDiscoveryDelay,
  evaluateBaselineTopLevelSourceAdvance,
  parseSnapshotCorrelationId,
} from './p25-apd-shadow-baseline-poll-evidence';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';
import type { AdaptivePollingShadowPostPollContext } from './adaptive-polling-shadow.types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lossCases = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/fable-skip-safety-audit-loss-cases.json'),
    'utf8',
  ),
) as Array<{
  id: string;
  preLastLvSourceAt: string;
  payloadLvProviderSourceAt: string;
  pollStartedAt: string;
  pollCompletedAt: string;
  nextBaselinePollStartedAt: string;
}>;

describe('p25-apd-shadow-baseline-poll-evidence', () => {
  describe('LV advance (payload authority)', () => {
    it('detects strict provider timestamp advance', () => {
      const r = evaluateBaselineLvSourceAdvanceFromPayload({
        previousLvProviderSourceMs: 1_000,
        payloadLvProviderSourceMs: 2_000,
      });
      expect(r).toEqual({ kind: 'TRUE_ADVANCE', providerSourceMs: 2_000 });
    });

    it('does not treat async DB race replay as advance when payload unchanged', () => {
      const r = evaluateBaselineLvSourceAdvanceFromPayload({
        previousLvProviderSourceMs: 5_000,
        payloadLvProviderSourceMs: 5_000,
      });
      expect(r).toEqual({ kind: 'NO_ADVANCE' });
    });

    it('UNKNOWN when payload missing (Tesla / no LV field)', () => {
      expect(
        evaluateBaselineLvSourceAdvanceFromPayload({
          previousLvProviderSourceMs: null,
          payloadLvProviderSourceMs: null,
        }).kind,
      ).toBe('UNKNOWN');
    });
  });

  describe('Top-level advance', () => {
    it('TRUE_ADVANCE only with known previous', () => {
      expect(
        evaluateBaselineTopLevelSourceAdvance({
          previousSourceTimestampMs: 100,
          newSourceTimestampMs: 200,
        }),
      ).toEqual({ evidence: 'TRUE_ADVANCE', informative: true });
    });

    it('UNKNOWN when previous missing (no false advance)', () => {
      expect(
        evaluateBaselineTopLevelSourceAdvance({
          previousSourceTimestampMs: null,
          newSourceTimestampMs: 200,
        }),
      ).toEqual({ evidence: 'UNKNOWN', informative: false });
    });
  });

  describe('Fable audit loss cases (frozen regression)', () => {
    const evidence = new ApdShadowBaselinePollEvidenceService({} as never);

    for (const c of lossCases) {
      it(`${c.id} → informative LV + discovery delay on WOULD_SKIP`, () => {
        const preMs = Date.parse(c.preLastLvSourceAt);
        const payloadMs = Date.parse(c.payloadLvProviderSourceAt);
        const completedMs = Date.parse(c.pollCompletedAt);
        const nextPollMs = Date.parse(c.nextBaselinePollStartedAt);
        const ctx: AdaptivePollingShadowPostPollContext = {
          organizationId: 'org',
          vehicleId: 'veh',
          opportunityId: 'opp',
          realPollId: 'poll',
          pollStartedAtMs: Date.parse(c.pollStartedAt),
          pollCompletedAtMs: completedMs,
          realPollVisibleLvSourceAtMs: null,
          previousLvSourceMs: preMs,
          baselineLvProviderSourceMs: payloadMs,
          previousTopLevelSourceMs: preMs,
          newTopLevelSourceMs: payloadMs,
          providerFetchedAtMs: null,
        };
        const patch = evidence.buildObservationalPatch({
          ctx,
          prePollDecision: 'WOULD_SKIP',
          nextBaselineSnapshotPollStartedAtMs: nextPollMs,
        });
        expect(patch.newLvSourceObserved).toBe(true);
        expect(patch.newLvSourceAt?.getTime()).toBe(payloadMs);
        expect(patch.simulatedNextPollAt?.getTime()).toBe(nextPollMs);
        expect(patch.additionalDiscoveryDelayMs).toBe(nextPollMs - completedMs);
      });
    }
  });

  it('parseSnapshotCorrelationId', () => {
    const parsed = parseSnapshotCorrelationId(
      'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
    );
    expect(parsed?.vehicleId).toBe('19fedd4b-c4e8-4de8-a125-dab293326e7e');
    expect(parsed?.fetchedAtMs).toBe(Date.parse('2026-10-25T10:29:02.655Z'));
  });

  it('discovery delay UNKNOWN without next baseline poll', () => {
    expect(
      evaluateBaselineSkipDiscoveryDelay({
        pollCompletedAtMs: 1000,
        informativeLvProviderSourceMs: 900,
        informativeTopLevelSourceMs: null,
        nextBaselineSnapshotPollStartedAtMs: null,
      }).kind,
    ).toBe('UNKNOWN');
  });
});
