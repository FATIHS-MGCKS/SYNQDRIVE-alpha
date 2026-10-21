import { VsiApdsP5b1OfflineReplayService } from './vsi-apds-p5b1-offline-replay.service';
import { VsiApdsP5b1DecisionRepository } from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1EvidenceWriter } from './vsi-apds-p5b1-evidence.writer';
import { VsiApdsP5b2Phase2ManifestReplayService } from './vsi-apds-p5b2-phase2-manifest-replay.service';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';
import type { ValidatedVsiApdsP5b2Phase2ManifestV1 } from './vsi-apds-p5b2-phase2-manifest';

describe('vsi-apds-p5b2 phase2 manifest replay service', () => {
  const manifest: ValidatedVsiApdsP5b2Phase2ManifestV1 = {
    sha256: 'test-sha',
    organizationId: 'org-1',
    activationEpochId: 'epoch-1',
    allowedVehicleIds: ['veh-1'],
    decisionAtFrom: new Date('2026-10-17T19:07:24.212Z'),
    decisionAtTo: new Date('2026-10-21T12:04:24.059Z'),
    orderedDecisionIds: ['id-1', 'id-2'],
    entriesById: new Map(),
  };

  const persistedRows = [
    {
      id: 'id-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: 'opp',
      decisionAt: new Date('2026-10-18T10:00:00.000Z'),
      activationEpochId: 'epoch-1',
      policyVersion: 'P25_APD_B2_V1',
      shadowExecutionVersion: null,
      decision: 'WOULD_POLL',
      reason: 'test',
      realPollId: 'poll-1',
      realPollStatus: 'SUCCESS',
    },
    {
      id: 'id-2',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: 'opp',
      decisionAt: new Date('2026-10-18T10:00:00.000Z'),
      activationEpochId: 'epoch-1',
      policyVersion: 'P25_APD_B4_V1',
      shadowExecutionVersion: null,
      decision: 'WOULD_POLL',
      reason: 'test',
      realPollId: 'poll-1',
      realPollStatus: 'SUCCESS',
    },
  ];

  it('preserves manifest order and sets persistedShadowDecisionId without evidence writes', async () => {
    const correlate = jest
      .fn()
      .mockImplementation(async (row: { id: string }) => ({
        contractVersion: 'vsi-apds-p5b1-offline-v1',
        decisionIdentity: {
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          opportunityId: 'opp',
          policyVersion: 'P25_APD_B2_V1',
          decisionAt: '2026-10-18T10:00:00.000Z',
          activationEpochId: 'epoch-1',
          shadowExecutionVersion: null,
        },
        originalApdsDecision: 'WOULD_POLL',
        originalApdsReason: 'test',
        sourceLinkAttribution: {
          status: 'UNIQUE_ATTRIBUTED',
          providerSourceLinkId: 'link-1',
          historicalActiveLinkCountAtDecision: 1,
          reasons: [],
        },
        observation: { consumerDemand: [] },
        correlation: { matchedVehicleLink: true },
        investigationHints: [],
        processingStatus: 'CORRELATED',
        errorCode: null,
        skippedReason: null,
        persistedShadowDecisionId: row.id,
      }));

    const offlineReplay = {
      correlatePersistedShadowDecisionForResearch: correlate,
    } as unknown as VsiApdsP5b1OfflineReplayService;

    const decisions = {
      loadShadowDecisionsByIds: jest.fn().mockResolvedValue(persistedRows),
    } as unknown as VsiApdsP5b1DecisionRepository;

    const evidenceWriter = {
      appendCorrelationEvidence: jest.fn(),
    } as unknown as VsiApdsP5b1EvidenceWriter;

    const service = new VsiApdsP5b2Phase2ManifestReplayService(decisions, offlineReplay);
    const legacy = await service.runManifestReplay({
      manifest,
      replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE,
      decisionRows: persistedRows,
    });
    const history = await service.runManifestReplay({
      manifest,
      replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF,
      decisionRows: persistedRows,
    });

    expect(legacy.correlationRows.map((r) => r.persistedShadowDecisionId)).toEqual(['id-1', 'id-2']);
    expect(history.correlationRows.map((r) => r.persistedShadowDecisionId)).toEqual(['id-1', 'id-2']);
    expect(legacy.evidenceStoreRowsAppended).toBe(0);
    expect(legacy.evidenceStoreWriteAttempted).toBe(false);
    expect(evidenceWriter.appendCorrelationEvidence).not.toHaveBeenCalled();
    expect(correlate).toHaveBeenCalledTimes(4);
    expect(legacy.aggregates.b2B4TwinSamePollId).toBe(1);
  });
});
