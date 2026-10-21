import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  VsiApdsP5b1DecisionRepository,
  type VsiApdsP5b1PersistedShadowDecisionManifestRow,
} from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1OfflineReplayService } from './vsi-apds-p5b1-offline-replay.service';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';
import { buildP5b2HistoricalScientificMetrics } from './vsi-apds-p5b2-metrics';
import type { ValidatedVsiApdsP5b2Phase2ManifestV1 } from './vsi-apds-p5b2-phase2-manifest';
import {
  assertManifestDecisionRowsMatchScope,
  assertManifestPersistedMetadataParity,
} from './vsi-apds-p5b2-phase2-manifest-scope';
import {
  buildPhase2DecisionResearchRow,
  buildPhase2ScientificAggregates,
  type VsiApdsP5b2Phase2DecisionResearchRowV1,
  type VsiApdsP5b2Phase2ScientificAggregatesV1,
} from './vsi-apds-p5b2-phase2-scientific-summary';

export type VsiApdsP5b2Phase2ManifestReplayResultV1 = {
  contractVersion: typeof VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION;
  dryRun: true;
  readOnly: true;
  replayRunId: string;
  manifestSha256: string;
  replayProfileMode: (typeof VsiApdsP5b1OfflineReplayProfileMode)[keyof typeof VsiApdsP5b1OfflineReplayProfileMode];
  organizationId: string;
  activationEpochId: string;
  decisionCount: number;
  correlationRows: VsiApdsP5b1OfflineCorrelationRowV1[];
  researchRows: VsiApdsP5b2Phase2DecisionResearchRowV1[];
  aggregates: VsiApdsP5b2Phase2ScientificAggregatesV1;
  historicalScientificMetrics: ReturnType<typeof buildP5b2HistoricalScientificMetrics> | null;
  evidenceStoreWriteAttempted: false;
  evidenceStoreRowsAppended: 0;
  sourceAdvanceResearchNote: string;
};

const SOURCE_ADVANCE_RESEARCH_NOTE =
  'new_top_level_source_observed is not strict source-advance proof (previousTop may be null). ' +
  'new_lv_source_observed was 0 in the Phase 2 production inventory window. P2C capture is OFF. ' +
  'HTTP poll SUCCESS does not prove signal payload advance.';

@Injectable()
export class VsiApdsP5b2Phase2ManifestReplayService {
  constructor(
    private readonly decisions: VsiApdsP5b1DecisionRepository,
    private readonly offlineReplay: VsiApdsP5b1OfflineReplayService,
  ) {}

  async loadManifestDecisions(
    manifest: ValidatedVsiApdsP5b2Phase2ManifestV1,
  ): Promise<VsiApdsP5b1PersistedShadowDecisionManifestRow[]> {
    const rows = await this.decisions.loadShadowDecisionsByIds({
      organizationId: manifest.organizationId,
      decisionIds: manifest.orderedDecisionIds,
    });
    assertManifestDecisionRowsMatchScope(manifest, rows);
    assertManifestPersistedMetadataParity(manifest, rows);
    return rows;
  }

  async runManifestReplay(input: {
    manifest: ValidatedVsiApdsP5b2Phase2ManifestV1;
    replayProfileMode: (typeof VsiApdsP5b1OfflineReplayProfileMode)[keyof typeof VsiApdsP5b1OfflineReplayProfileMode];
    decisionRows?: readonly VsiApdsP5b1PersistedShadowDecisionManifestRow[];
  }): Promise<VsiApdsP5b2Phase2ManifestReplayResultV1> {
    const started = Date.now();
    const decisionRows =
      input.decisionRows ?? (await this.loadManifestDecisions(input.manifest));
    assertManifestDecisionRowsMatchScope(input.manifest, decisionRows);
    assertManifestPersistedMetadataParity(input.manifest, decisionRows);

    const replayRunId = randomUUID();
    const correlationRows: VsiApdsP5b1OfflineCorrelationRowV1[] = [];
    const researchRows: VsiApdsP5b2Phase2DecisionResearchRowV1[] = [];

    for (const persisted of decisionRows) {
      const correlationRow = await this.offlineReplay.correlatePersistedShadowDecisionForResearch(
        persisted,
        input.replayProfileMode,
      );
      const withId: VsiApdsP5b1OfflineCorrelationRowV1 = {
        ...correlationRow,
        persistedShadowDecisionId: persisted.id,
      };
      correlationRows.push(withId);
      researchRows.push(
        buildPhase2DecisionResearchRow({
          persisted,
          correlationRow: withId,
          manifestEntry: input.manifest.entriesById.get(persisted.id),
          replayProfileMode: input.replayProfileMode,
        }),
      );
    }

    const elapsedMs = Date.now() - started;
    const aggregates = buildPhase2ScientificAggregates({ researchRows, elapsedMs });

    return {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      dryRun: true,
      readOnly: true,
      replayRunId,
      manifestSha256: input.manifest.sha256,
      replayProfileMode: input.replayProfileMode,
      organizationId: input.manifest.organizationId,
      activationEpochId: input.manifest.activationEpochId,
      decisionCount: decisionRows.length,
      correlationRows,
      researchRows,
      aggregates,
      historicalScientificMetrics:
        input.replayProfileMode === VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF
          ? buildP5b2HistoricalScientificMetrics(correlationRows)
          : null,
      evidenceStoreWriteAttempted: false,
      evidenceStoreRowsAppended: 0,
      sourceAdvanceResearchNote: SOURCE_ADVANCE_RESEARCH_NOTE,
    };
  }
}
