import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VsiApdsP5ReadonlyService } from './vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { resolveHistoricalActiveSourceLinkUniqueness } from './vsi-apds-historical-link-uniqueness';
import { resolveOfflineCorrelationSourceLink } from './vsi-apds-p5b1-link-attribution';
import {
  VsiApdsP5b1DecisionRepository,
  type VsiApdsP5b1PersistedShadowDecisionRow,
} from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1EvidenceWriter } from './vsi-apds-p5b1-evidence.writer';
import { buildP5b1OfflineCoverage, buildP5b1ProductMetrics } from './vsi-apds-p5b1-metrics';
import { isVsiP5b1OfflineReplayDisabled } from './vsi-apds-p5b1.config';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import type {
  VsiApdsP5b1OfflineCorrelationRowV1,
  VsiApdsP5b1OfflineReplayFilterV1,
  VsiApdsP5b1OfflineReplayPaginationV1,
  VsiApdsP5b1OfflineReplayResultV1,
} from './vsi-apds-p5b1.types';

@Injectable()
export class VsiApdsP5b1OfflineReplayService {
  constructor(
    private readonly decisions: VsiApdsP5b1DecisionRepository,
    private readonly profiles: VsiCapabilityResolverRepository,
    private readonly p5: VsiApdsP5ReadonlyService,
    private readonly evidenceWriter: VsiApdsP5b1EvidenceWriter,
  ) {}

  async runOfflineReplayBatch(input: {
    filter: VsiApdsP5b1OfflineReplayFilterV1;
    pagination?: VsiApdsP5b1OfflineReplayPaginationV1;
    dryRun?: boolean;
    replayRunId?: string;
  }): Promise<VsiApdsP5b1OfflineReplayResultV1> {
    if (isVsiP5b1OfflineReplayDisabled()) {
      throw new Error('VSI_P5B1_OFFLINE_REPLAY_DISABLED');
    }
    const dryRun = input.dryRun ?? true;
    if (!dryRun) {
      throw new Error('P5B1_OFFLINE_REPLAY_REQUIRES_DRY_RUN_TRUE');
    }

    const replayRunId = input.replayRunId ?? randomUUID();
    const { rows: decisionRows, hasMore } = await this.decisions.loadShadowDecisionsPage({
      filter: input.filter,
      cursorDecisionAt: input.pagination?.cursorDecisionAt,
      cursorId: input.pagination?.cursorId,
      limit: input.pagination?.limit,
    });

    const rows: VsiApdsP5b1OfflineCorrelationRowV1[] = [];
    for (const decision of decisionRows) {
      rows.push(await this.correlateOneDecision(decision));
    }

    const coverage = buildP5b1OfflineCoverage(rows);
    const productMetrics = buildP5b1ProductMetrics(rows);
    const last = decisionRows[decisionRows.length - 1];

    return {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      dryRun: true,
      readOnly: true,
      replayRunId,
      coverage,
      productMetrics,
      rows,
      nextCursor:
        hasMore && last
          ? { decisionAt: last.decisionAt.toISOString(), id: last.id }
          : null,
      evidenceStoreWriteAttempted: false,
      evidenceStoreRowsAppended: 0,
    };
  }

  /** Optional evidence persistence — separate from default dry-run output path. */
  async persistEvidenceForRows(input: {
    replayRunId: string;
    rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[];
  }): Promise<number> {
    let appended = 0;
    for (const row of input.rows) {
      const result = await this.evidenceWriter.appendCorrelationEvidence({
        replayRunId: input.replayRunId,
        row,
      });
      appended += result.appended;
    }
    return appended;
  }

  private async correlateOneDecision(
    decision: VsiApdsP5b1PersistedShadowDecisionRow,
  ): Promise<VsiApdsP5b1OfflineCorrelationRowV1> {
    const decisionIdentity = {
      organizationId: decision.organizationId,
      vehicleId: decision.vehicleId,
      opportunityId: decision.opportunityId,
      policyVersion: decision.policyVersion,
      decisionAt: decision.decisionAt.toISOString(),
      activationEpochId: decision.activationEpochId,
      shadowExecutionVersion: decision.shadowExecutionVersion,
    };

    const decisionAtMs = decision.decisionAt.getTime();
    const linkRows = await this.profiles.listVehicleSourceLinksForHistoricalAttribution({
      organizationId: decision.organizationId,
      vehicleId: decision.vehicleId,
    });
    const historical = resolveHistoricalActiveSourceLinkUniqueness({
      links: linkRows.links,
      decisionAtMs,
      attributionRowLimitExceeded: linkRows.rowLimitExceeded,
    });
    const attribution = resolveOfflineCorrelationSourceLink({ historical });

    if (attribution.providerSourceLinkId == null) {
      return {
        contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
        decisionIdentity,
        originalApdsDecision: decision.decision,
        originalApdsReason: decision.reason,
        sourceLinkAttribution: attribution,
        observation: null,
        correlation: null,
        investigationHints: ['OFFLINE_CORRELATION_SKIPPED_NO_ATTRIBUTABLE_SOURCE_LINK'],
        skippedReason: 'NO_ATTRIBUTABLE_SOURCE_LINK',
      };
    }

    const observation = await this.p5.buildObservation({
      organizationId: decision.organizationId,
      vehicleId: decision.vehicleId,
      providerSourceLinkId: attribution.providerSourceLinkId,
      shadowOpportunityId: decision.opportunityId,
      shadowDecisionAt: decision.decisionAt,
      policyVersion: decision.policyVersion,
      activationEpochId: decision.activationEpochId,
    });

    const correlation = this.p5.correlateShadowDecision({
      decision: {
        organizationId: decision.organizationId,
        vehicleId: decision.vehicleId,
        opportunityId: decision.opportunityId,
        decisionAt: decision.decisionAt.toISOString(),
        policyVersion: decision.policyVersion,
        activationEpochId: decision.activationEpochId,
        baselineDecision: decision.decision,
        executionVersion: decision.shadowExecutionVersion,
      },
      observation,
    });

    return {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity,
      originalApdsDecision: decision.decision,
      originalApdsReason: decision.reason,
      sourceLinkAttribution: attribution,
      observation,
      correlation,
      investigationHints: [...correlation.investigationHints],
      skippedReason: null,
    };
  }
}
