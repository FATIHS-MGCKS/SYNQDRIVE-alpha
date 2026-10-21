import { Injectable } from '@nestjs/common';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import { buildVsiApdsReadonlyCapabilityObservation } from './vsi-apds-readonly.adapter';
import { correlateApdsShadowWithVsiCapability } from './vsi-apds-shadow-correlation.engine';
import type {
  VsiApdsReadonlyAdapterInputV1,
  VsiApdsShadowCorrelationResultV1,
  VsiApdsShadowDecisionSnapshotV1,
} from './vsi-apds-p5.types';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { resolveHistoricalActiveSourceLinkUniqueness } from './vsi-apds-historical-link-uniqueness';
import {
  isProviderSourceLinkActiveAtDecision,
  VsiApdsCorrelationAnalysisMode,
} from './vsi-apds-shadow-opportunity-binding';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';
import { classifyProfileEvidenceFromRevisionAsOf } from './vsi-apds-p5b2-historical-profile-evidence';
import { mapVsiProfileRevisionToCapabilityContext } from './vsi-profile-revision-to-capability-context.mapper';
import type { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';

/**
 * P5A read-only orchestration — no APDS shadow wiring (P5B gate default OFF elsewhere).
 */
@Injectable()
export class VsiApdsP5ReadonlyService {
  constructor(private readonly profiles: VsiCapabilityResolverRepository) {}

  async buildObservation(
    input: Omit<
      VsiApdsReadonlyAdapterInputV1,
      'requirementsContractVersion' | 'policyVersion'
    > & {
      requirementsContractVersion?: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
      policyVersion: string;
      activationEpochId?: string | null;
      correlationAnalysisMode?: VsiApdsCorrelationAnalysisMode;
    },
  ) {
    const adapter: VsiApdsReadonlyAdapterInputV1 = {
      ...input,
      requirementsContractVersion:
        input.requirementsContractVersion ?? VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    };
    const link = await this.profiles.loadLinkContext({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
    });
    const profileBundle = await this.profiles.loadProfileContextWithTemporal({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
    });
    const currentActiveSourceLinkCount = await this.profiles.countActiveSourceLinks(
      adapter.vehicleId,
    );
    const historicalLinkRows = await this.profiles.listVehicleSourceLinksForHistoricalAttribution({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
    });
    const persistedRow = await this.profiles.loadPersistedApdsShadowDecision({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      opportunityId: adapter.shadowOpportunityId,
      policyVersion: adapter.policyVersion,
    });
    const tenantMatch = link?.organizationId === adapter.organizationId;
    const decisionAtMs = adapter.shadowDecisionAt.getTime();
    const historicalLinkActiveAtDecision =
      link != null &&
      Number.isFinite(decisionAtMs) &&
      isProviderSourceLinkActiveAtDecision({
        activatedAt: link.activatedAt,
        deactivatedAt: link.deactivatedAt,
        supersededAt: link.supersededAt,
        decisionAtMs,
      });
    const historicalUniqueness = resolveHistoricalActiveSourceLinkUniqueness({
      links: historicalLinkRows.links,
      decisionAtMs,
      attributionRowLimitExceeded: historicalLinkRows.rowLimitExceeded,
    });
    const persisted = persistedRow
      ? {
          organizationId: persistedRow.organizationId,
          vehicleId: persistedRow.vehicleId,
          opportunityId: persistedRow.opportunityId,
          decisionAt: persistedRow.decisionAt,
          policyVersion: persistedRow.policyVersion,
          activationEpochId: persistedRow.activationEpochId,
          decision: persistedRow.decision,
        }
      : null;
    return buildVsiApdsReadonlyCapabilityObservation({
      adapter,
      profile: profileBundle?.profile ?? null,
      profileTemporal: profileBundle?.temporal ?? null,
      trustedProviderIdentity: profileBundle?.trustedProviderIdentity ?? null,
      trustedVerifiedModality: profileBundle?.trustedVerifiedModality ?? null,
      trustedTelemetrySourceFamily: profileBundle?.trustedTelemetrySourceFamily ?? null,
      linkActive: link?.isActive ?? false,
      linkSuperseded: link?.supersededAt != null,
      tenantMatch,
      currentActiveSourceLinkCount,
      historicalActiveLinkCountAtDecision: historicalUniqueness.historicalActiveLinkCount,
      historicalActiveLinkIds: historicalUniqueness.historicalActiveLinkIds,
      historicalLinkUniquenessEvidenceComplete: historicalUniqueness.evidenceComplete,
      persistedShadowDecision: persisted,
      historicalLinkActiveAtDecision,
      correlationAnalysisMode:
        input.correlationAnalysisMode ?? VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
    });
  }

  correlateShadowDecision(input: {
    decision: VsiApdsShadowDecisionSnapshotV1;
    observation: Awaited<ReturnType<typeof buildVsiApdsReadonlyCapabilityObservation>>;
  }): VsiApdsShadowCorrelationResultV1 {
    return correlateApdsShadowWithVsiCapability(input);
  }

  /**
   * P5B.2 offline replay — immutable P5-H1 revision at `shadowDecisionAt` (no mutable profile read).
   */
  async buildHistoricalAsOfObservation(
    input: Omit<
      VsiApdsReadonlyAdapterInputV1,
      'requirementsContractVersion' | 'policyVersion'
    > & {
      requirementsContractVersion?: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
      policyVersion: string;
      activationEpochId?: string | null;
      correlationAnalysisMode?: VsiApdsCorrelationAnalysisMode;
      historicalLinkAttributionProven: boolean;
    },
    revisionHistory: VsiProfileRevisionHistoryRepository,
  ) {
    const adapter: VsiApdsReadonlyAdapterInputV1 = {
      ...input,
      requirementsContractVersion:
        input.requirementsContractVersion ?? VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    };
    const link = await this.profiles.loadLinkContext({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
    });
    const currentActiveSourceLinkCount = await this.profiles.countActiveSourceLinks(
      adapter.vehicleId,
    );
    const historicalLinkRows = await this.profiles.listVehicleSourceLinksForHistoricalAttribution({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
    });
    const persistedRow = await this.profiles.loadPersistedApdsShadowDecision({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      opportunityId: adapter.shadowOpportunityId,
      policyVersion: adapter.policyVersion,
    });
    const tenantMatch = link?.organizationId === adapter.organizationId;
    const decisionAtMs = adapter.shadowDecisionAt.getTime();
    const historicalLinkActiveAtDecision =
      link != null &&
      Number.isFinite(decisionAtMs) &&
      isProviderSourceLinkActiveAtDecision({
        activatedAt: link.activatedAt,
        deactivatedAt: link.deactivatedAt,
        supersededAt: link.supersededAt,
        decisionAtMs,
      });
    const historicalUniqueness = resolveHistoricalActiveSourceLinkUniqueness({
      links: historicalLinkRows.links,
      decisionAtMs,
      attributionRowLimitExceeded: historicalLinkRows.rowLimitExceeded,
    });
    const persisted = persistedRow
      ? {
          organizationId: persistedRow.organizationId,
          vehicleId: persistedRow.vehicleId,
          opportunityId: persistedRow.opportunityId,
          decisionAt: persistedRow.decisionAt,
          policyVersion: persistedRow.policyVersion,
          activationEpochId: persistedRow.activationEpochId,
          decision: persistedRow.decision,
        }
      : null;

    const asOf = await revisionHistory.resolveRevisionAsOf({
      organizationId: adapter.organizationId,
      vehicleId: adapter.vehicleId,
      providerSourceLinkId: adapter.providerSourceLinkId,
      decisionAt: adapter.shadowDecisionAt,
      historicalLinkAttributionProven: input.historicalLinkAttributionProven,
    });

    const mappedProfile =
      asOf.selectedRevision != null
        ? mapVsiProfileRevisionToCapabilityContext(asOf.selectedRevision)
        : null;
    const malformedProjection =
      asOf.selectedRevision != null && mappedProfile == null;
    const profileEvidence = classifyProfileEvidenceFromRevisionAsOf({
      resolution: asOf,
      malformedProfileProjection: malformedProjection,
    });

    const trustedFromRevision = asOf.selectedRevision;
    return {
      observation: buildVsiApdsReadonlyCapabilityObservation({
        adapter,
        profile: mappedProfile,
        profileTemporal: null,
        trustedProviderIdentity: trustedFromRevision?.providerIdentity ?? null,
        trustedVerifiedModality: trustedFromRevision?.verifiedModality ?? null,
        trustedTelemetrySourceFamily: trustedFromRevision?.telemetrySourceFamily ?? null,
        linkActive: link?.isActive ?? false,
        linkSuperseded: link?.supersededAt != null,
        tenantMatch,
        currentActiveSourceLinkCount,
        historicalActiveLinkCountAtDecision: historicalUniqueness.historicalActiveLinkCount,
        historicalActiveLinkIds: historicalUniqueness.historicalActiveLinkIds,
        historicalLinkUniquenessEvidenceComplete: historicalUniqueness.evidenceComplete,
        persistedShadowDecision: persisted,
        historicalLinkActiveAtDecision,
        correlationAnalysisMode:
          input.correlationAnalysisMode ??
          VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
        replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF,
        profileEvidenceOverride: {
          interpretation: profileEvidence.interpretation,
          decisionTimeRetrospectiveAssessable: profileEvidence.decisionTimeRetrospectiveAssessable,
          limitations: profileEvidence.limitations,
        },
      }),
      revisionAsOf: asOf,
      historicalRevisionEvidence: profileEvidence.historicalRevisionEvidence,
    };
  }
}
