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
import {
  buildP5b1OfflineCoverage,
  buildP5b1ProductMetrics,
  buildP5b1ScientificProductMetrics,
} from './vsi-apds-p5b1-metrics';
import { isVsiP5b1OfflineReplayDisabled } from './vsi-apds-p5b1.config';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import {
  parseP5b1OperatorScope,
  resolveBoundedBatchLimit,
} from './vsi-apds-p5b1-operator-scope';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { VsiApdsShadowBindingStatus } from './vsi-apds-shadow-opportunity-binding';
import type {
  VsiApdsP5b1OfflineCorrelationRowV1,
  VsiApdsP5b1OfflineReplayFilterV1,
  VsiApdsP5b1OfflineReplayPaginationV1,
  VsiApdsP5b1OfflineReplayResultV1,
  VsiApdsP5b1RowProcessingStatus,
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
    maxTotalDecisions?: number;
    decisionsProcessedSoFar?: number;
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

    const scope = parseP5b1OperatorScope({
      filter: input.filter,
      pagination: input.pagination,
      maxTotalDecisions: input.maxTotalDecisions,
    });
    const decisionsProcessedSoFar = input.decisionsProcessedSoFar ?? 0;
    const batchLimit = resolveBoundedBatchLimit({ scope, decisionsProcessedSoFar });
    if (batchLimit === 0) {
      return this.emptyResult(scope, input.replayRunId ?? randomUUID());
    }

    const replayRunId = input.replayRunId ?? randomUUID();
    const { rows: decisionRows, hasMore } = await this.decisions.loadShadowDecisionsPage({
      filter: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        opportunityId: scope.opportunityId,
        activationEpochId: scope.activationEpochId,
        policyVersions: scope.policyVersions,
        decisionAtFrom: scope.decisionAtFrom,
        decisionAtTo: scope.decisionAtTo,
      },
      cursorDecisionAt: input.pagination?.cursorDecisionAt,
      cursorId: input.pagination?.cursorId,
      limit: batchLimit,
    });

    const rows: VsiApdsP5b1OfflineCorrelationRowV1[] = [];
    for (const decision of decisionRows) {
      try {
        rows.push(await this.correlateOneDecision(decision));
      } catch {
        rows.push(this.correlationErrorRow(decision, 'CORRELATION_EXCEPTION'));
      }
    }

    const coverage = buildP5b1OfflineCoverage(rows);
    const scientificMetrics = buildP5b1ScientificProductMetrics(rows);
    const productMetrics = buildP5b1ProductMetrics(rows);
    const last = decisionRows[decisionRows.length - 1];
    const moreWithinCap =
      hasMore &&
      decisionsProcessedSoFar + decisionRows.length < scope.maxTotalDecisions;

    return {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      dryRun: true,
      readOnly: true,
      replayRunId,
      operatorScope: {
        organizationId: scope.organizationId,
        decisionAtFrom: scope.decisionAtFrom.toISOString(),
        decisionAtTo: scope.decisionAtTo.toISOString(),
        batchLimit: scope.batchLimit,
        maxTotalDecisions: scope.maxTotalDecisions,
      },
      coverage,
      scientificMetrics,
      productMetrics,
      rows,
      nextCursor:
        moreWithinCap && last
          ? { decisionAt: last.decisionAt.toISOString(), id: last.id }
          : null,
      evidenceStoreWriteAttempted: false,
      evidenceStoreRowsAppended: 0,
    };
  }

  private emptyResult(
    scope: ReturnType<typeof parseP5b1OperatorScope>,
    replayRunId: string,
  ): VsiApdsP5b1OfflineReplayResultV1 {
    return {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      dryRun: true,
      readOnly: true,
      replayRunId,
      operatorScope: {
        organizationId: scope.organizationId,
        decisionAtFrom: scope.decisionAtFrom.toISOString(),
        decisionAtTo: scope.decisionAtTo.toISOString(),
        batchLimit: scope.batchLimit,
        maxTotalDecisions: scope.maxTotalDecisions,
      },
      coverage: buildP5b1OfflineCoverage([]),
      scientificMetrics: buildP5b1ScientificProductMetrics([]),
      productMetrics: buildP5b1ProductMetrics([]),
      rows: [],
      nextCursor: null,
      evidenceStoreWriteAttempted: false,
      evidenceStoreRowsAppended: 0,
    };
  }

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

  private correlationErrorRow(
    decision: VsiApdsP5b1PersistedShadowDecisionRow,
    errorCode: string,
  ): VsiApdsP5b1OfflineCorrelationRowV1 {
    return {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity: this.decisionIdentity(decision),
      originalApdsDecision: decision.decision,
      originalApdsReason: decision.reason,
      sourceLinkAttribution: {
        status: 'UNPROVEN',
        providerSourceLinkId: null,
        historicalActiveLinkCountAtDecision: null,
        reasons: [errorCode],
      },
      observation: null,
      correlation: null,
      investigationHints: [],
      processingStatus: 'CORRELATION_ERROR',
      errorCode,
      skippedReason: errorCode,
    };
  }

  private decisionIdentity(decision: VsiApdsP5b1PersistedShadowDecisionRow) {
    return {
      organizationId: decision.organizationId,
      vehicleId: decision.vehicleId,
      opportunityId: decision.opportunityId,
      policyVersion: decision.policyVersion,
      decisionAt: decision.decisionAt.toISOString(),
      activationEpochId: decision.activationEpochId,
      shadowExecutionVersion: decision.shadowExecutionVersion,
    };
  }

  private resolveProcessingStatus(input: {
    attributionStatus: VsiApdsP5b1OfflineCorrelationRowV1['sourceLinkAttribution']['status'];
    profileInterpretation: string | undefined;
    shadowBindingStatus: string | undefined;
    matchedVehicleLink: boolean;
  }): VsiApdsP5b1RowProcessingStatus {
    if (input.attributionStatus !== 'UNIQUE_ATTRIBUTED') {
      return 'SKIPPED_NO_ATTRIBUTABLE_LINK';
    }
    if (
      input.profileInterpretation !==
      VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT
    ) {
      return 'PROFILE_NOT_ASSESSABLE';
    }
    if (
      input.matchedVehicleLink &&
      input.shadowBindingStatus === VsiApdsShadowBindingStatus.MATCHED
    ) {
      return 'VERIFIED_CORRELATION';
    }
    return 'CORRELATED';
  }

  private async correlateOneDecision(
    decision: VsiApdsP5b1PersistedShadowDecisionRow,
  ): Promise<VsiApdsP5b1OfflineCorrelationRowV1> {
    const decisionIdentity = this.decisionIdentity(decision);
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
        processingStatus: 'SKIPPED_NO_ATTRIBUTABLE_LINK',
        errorCode: null,
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

    const processingStatus = this.resolveProcessingStatus({
      attributionStatus: attribution.status,
      profileInterpretation: observation.profileEvidenceInterpretation,
      shadowBindingStatus: observation.shadowBindingStatus,
      matchedVehicleLink: correlation.matchedVehicleLink,
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
      processingStatus,
      errorCode: null,
      skippedReason: null,
    };
  }
}
