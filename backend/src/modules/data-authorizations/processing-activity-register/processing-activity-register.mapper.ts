import type { Prisma } from '@prisma/client';
import { buildPolicyStatusSemantics } from '../privacy-domain/policy-lifecycle/policy-lifecycle-status-semantics';
import { PROCESSING_ACTIVITY_REGISTER } from './processing-activity-register.constants';
import {
  ProcessingActivityRegisterCompletenessService,
  summarizeProviderAccess,
  type RegisterCompletenessInput,
} from './processing-activity-register-completeness.service';

export const REGISTER_ACTIVITY_INCLUDE = {
  dataCategories: true,
  purposes: true,
  dataSubjectTypes: true,
  legalBasisAssessments: {
    where: { isCurrentVersion: true },
    orderBy: { versionNumber: 'desc' as const },
    take: 3,
  },
  dataSharingAuthorizations: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
  dataProcessingAgreements: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
  providerAccessGrants: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
  enforcementPolicies: {
    where: { isCurrentVersion: true },
    orderBy: { versionNumber: 'desc' as const },
    take: 10,
  },
  riskAssessments: {
    where: { isCurrent: true },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.ProcessingActivityInclude;

export type RegisterActivityRecord = Prisma.ProcessingActivityGetPayload<{
  include: typeof REGISTER_ACTIVITY_INCLUDE;
}>;

export function toCompletenessInput(record: RegisterActivityRecord): RegisterCompletenessInput {
  return {
    title: record.title,
    purposeSummary: record.purposeSummary,
    dataCategories: record.dataCategories.map((c) => c.dataCategory),
    purposes: record.purposes.map((p) => p.purpose),
    dataSubjectTypes: record.dataSubjectTypes.map((s) => s.subjectType),
    recipientCategoriesSummary: record.recipientCategoriesSummary,
    dataSharingAuthorizations: record.dataSharingAuthorizations.map((s) => ({
      status: s.status,
      transferCountry: s.transferCountry,
      transferMechanism: s.transferMechanism,
      recipient: s.recipient,
    })),
    retentionDescription: record.retentionDescription,
    retentionPeriodDays: record.retentionPeriodDays,
    technicalOrganizationalMeasures: record.technicalOrganizationalMeasures,
    controllerReference: record.controllerReference,
    dataProcessingAgreements: record.dataProcessingAgreements.map((d) => ({
      status: d.status,
      processorLabel: d.processorLabel,
    })),
    jointControllerSummary: record.jointControllerSummary,
    legalBasisAssessments: record.legalBasisAssessments.map((a) => ({
      status: a.status,
      legalBasisType: a.legalBasisType,
      reviewDate: a.reviewDate,
    })),
    dpiaStatus: record.dpiaStatus,
    hasCurrentRiskAssessment: record.riskAssessments.length > 0,
    nextReviewDate: record.nextReviewDate,
    ownerUserId: record.ownerUserId,
    ownerRole: record.ownerRole,
  };
}

export function mapRegisterListItem(
  record: RegisterActivityRecord,
  completenessService: ProcessingActivityRegisterCompletenessService,
  runtimeCoverageSummary?: { enforcedFlows: number; totalFlows: number },
) {
  const completeness = completenessService.evaluate(toCompletenessInput(record));
  return {
    id: record.id,
    activityCode: record.activityCode,
    title: record.title,
    status: record.status,
    statusSemantics: buildPolicyStatusSemantics(record.status),
    versionNumber: record.versionNumber,
    isCurrentVersion: record.isCurrentVersion,
    ownerUserId: record.ownerUserId,
    ownerRole: record.ownerRole,
    nextReviewDate: record.nextReviewDate,
    dpiaStatus: record.dpiaStatus,
    deletionStatus: record.deletionStatus,
    completeness,
    hasBlockingGaps: completeness.blockingGaps.length > 0,
    updatedAt: record.updatedAt,
    runtimeCoverage: runtimeCoverageSummary ?? null,
  };
}

export function mapRegisterDetail(
  record: RegisterActivityRecord,
  completenessService: ProcessingActivityRegisterCompletenessService,
  runtimeCoverageSummary?: { enforcedFlows: number; totalFlows: number },
) {
  const completeness = completenessService.evaluate(toCompletenessInput(record));
  const intlTransfers = record.dataSharingAuthorizations
    .filter((s) => s.transferCountry || s.transferMechanism)
    .map((s) => ({
      recipient: s.recipient,
      country: s.transferCountry,
      mechanism: s.transferMechanism,
      status: s.status,
    }));

  return {
    ...mapRegisterListItem(record, completenessService, runtimeCoverageSummary),
    description: record.description,
    purposeSummary: record.purposeSummary,
    dataCategories: record.dataCategories.map((c) => c.dataCategory),
    processingPurposes: record.purposes.map((p) => p.purpose),
    dataSubjectTypes: record.dataSubjectTypes.map((s) => s.subjectType),
    recipientCategoriesSummary: record.recipientCategoriesSummary,
    internationalTransfers: intlTransfers,
    retention: {
      description: record.retentionDescription,
      periodDays: record.retentionPeriodDays,
    },
    technicalOrganizationalMeasures: record.technicalOrganizationalMeasures,
    controllerReference: record.controllerReference,
    jointControllerSummary: record.jointControllerSummary,
    processors: record.dataProcessingAgreements.map((d) => ({
      id: d.id,
      label: d.processorLabel,
      status: d.status,
      agreementRef: d.agreementRef,
    })),
    legalBasisAssessments: record.legalBasisAssessments.map((a) => ({
      id: a.id,
      status: a.status,
      legalBasisType: a.legalBasisType,
      reviewDate: a.reviewDate,
      versionNumber: a.versionNumber,
    })),
    enforcementPolicies: record.enforcementPolicies.map((p) => ({
      id: p.id,
      status: p.status,
      dataCategory: p.dataCategory,
      processingPurpose: p.processingPurpose,
      versionNumber: p.versionNumber,
    })),
    providerAccessSummary: summarizeProviderAccess(
      record.providerAccessGrants.map((g) => ({
        providerStatus: g.providerStatus,
        provider: g.provider,
      })),
    ),
    dataSharingAuthorizations: record.dataSharingAuthorizations.map((s) => ({
      id: s.id,
      recipient: s.recipient,
      recipientRole: s.recipientRole,
      status: s.status,
      transferCountry: s.transferCountry,
      transferMechanism: s.transferMechanism,
    })),
    disclaimer: PROCESSING_ACTIVITY_REGISTER.disclaimer,
    completeness,
  };
}
