import { Injectable } from '@nestjs/common';
import { ComplianceEvidenceReportType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EnforcementCoverageRegistryService } from '../enforcement-coverage-registry/enforcement-coverage-registry.service';
import { COMPLIANCE_EVIDENCE, COMPLIANCE_EVIDENCE_SECTION_TYPES } from './compliance-evidence.constants';
import type { ComplianceEvidencePackage, ComplianceEvidenceSection } from './compliance-evidence.types';
import { resolveComplianceEvidenceVersion } from './compliance-evidence-version.util';

export interface AssembleEvidenceInput {
  organizationId: string;
  reportType: ComplianceEvidenceReportType;
  periodFrom?: Date;
  periodTo?: Date;
  correlationId?: string;
}

@Injectable()
export class ComplianceEvidenceAssemblerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: EnforcementCoverageRegistryService,
  ) {}

  async assemble(input: AssembleEvidenceInput): Promise<ComplianceEvidencePackage> {
    const version = resolveComplianceEvidenceVersion();
    const snapshotAt = new Date();
    const periodFrom = input.periodFrom ?? null;
    const periodTo = input.periodTo ?? snapshotAt;

    const sectionTypes = this.resolveSectionTypes(input.reportType);
    const sections: ComplianceEvidenceSection[] = [];

    for (const sectionType of sectionTypes) {
      sections.push(await this.assembleSection(input.organizationId, sectionType, periodFrom, periodTo, input.correlationId));
    }

    const gaps = sections
      .filter((s) => s.hasGap)
      .map((s) => ({ sectionType: s.sectionType, reason: s.gapReason ?? 'MISSING_REQUIRED_DATA' }));

    const includesRuntimeData = sections.some((s) =>
      ['AUTHORIZATION_DECISIONS', 'RUNTIME_HEALTH', 'ENFORCEMENT_COVERAGE'].includes(s.sectionType),
    );

    const mandatoryGaps =
      input.reportType === ComplianceEvidenceReportType.FULL_PACKAGE
        ? gaps.filter((g) =>
            (COMPLIANCE_EVIDENCE.mandatorySectionsForFullPackage as readonly string[]).includes(g.sectionType),
          )
        : gaps.filter((g) => g.sectionType === this.reportTypeToSection(input.reportType));

    const complianceClaimAllowed = mandatoryGaps.length === 0;

    return {
      generatedAt: snapshotAt.toISOString(),
      recordVersion: version.recordVersion,
      gitCommit: includesRuntimeData ? version.gitCommit : null,
      buildVersion: includesRuntimeData ? version.buildVersion : null,
      provenanceLabel: includesRuntimeData ? version.provenanceLabel : version.recordVersion,
      includesRuntimeData,
      complianceClaimAllowed,
      gapCount: gaps.length,
      gaps,
      disclaimer: COMPLIANCE_EVIDENCE.disclaimer,
      periodFrom: periodFrom?.toISOString() ?? null,
      periodTo: periodTo.toISOString(),
      sections,
    };
  }

  private resolveSectionTypes(reportType: ComplianceEvidenceReportType) {
    if (reportType === ComplianceEvidenceReportType.FULL_PACKAGE) {
      return [...COMPLIANCE_EVIDENCE_SECTION_TYPES];
    }
    const single = this.reportTypeToSection(reportType);
    return single ? [single] : [];
  }

  private reportTypeToSection(reportType: ComplianceEvidenceReportType) {
    const map: Partial<Record<ComplianceEvidenceReportType, (typeof COMPLIANCE_EVIDENCE_SECTION_TYPES)[number]>> = {
      [ComplianceEvidenceReportType.PROCESSING_ACTIVITY_VERSION]: 'PROCESSING_ACTIVITY_VERSION',
      [ComplianceEvidenceReportType.LEGAL_BASIS]: 'LEGAL_BASIS',
      [ComplianceEvidenceReportType.CONSENT]: 'CONSENT',
      [ComplianceEvidenceReportType.PROVIDER_ACCESS_GRANT]: 'PROVIDER_ACCESS_GRANT',
      [ComplianceEvidenceReportType.DATA_PROCESSING_AGREEMENT]: 'DATA_PROCESSING_AGREEMENT',
      [ComplianceEvidenceReportType.DPIA]: 'DPIA',
      [ComplianceEvidenceReportType.ENFORCEMENT_COVERAGE]: 'ENFORCEMENT_COVERAGE',
      [ComplianceEvidenceReportType.REVIEW_APPROVAL]: 'REVIEW_APPROVAL',
      [ComplianceEvidenceReportType.POLICY_DEPLOYMENT]: 'POLICY_DEPLOYMENT',
      [ComplianceEvidenceReportType.REVOCATION]: 'REVOCATION',
      [ComplianceEvidenceReportType.RETENTION]: 'RETENTION',
      [ComplianceEvidenceReportType.DELETION]: 'DELETION',
      [ComplianceEvidenceReportType.AUTHORIZATION_DECISIONS]: 'AUTHORIZATION_DECISIONS',
      [ComplianceEvidenceReportType.RUNTIME_HEALTH]: 'RUNTIME_HEALTH',
      [ComplianceEvidenceReportType.PROVIDER_CONSISTENCY]: 'PROVIDER_CONSISTENCY',
    };
    return map[reportType];
  }

  private dateFilter(periodFrom: Date | null, periodTo: Date) {
    return {
      ...(periodFrom ? { gte: periodFrom } : {}),
      lte: periodTo,
    };
  }

  private async assembleSection(
    orgId: string,
    sectionType: (typeof COMPLIANCE_EVIDENCE_SECTION_TYPES)[number],
    periodFrom: Date | null,
    periodTo: Date,
    correlationId?: string,
  ): Promise<ComplianceEvidenceSection> {
    switch (sectionType) {
      case 'PROCESSING_ACTIVITY_VERSION':
        return this.sectionProcessingActivities(orgId, periodFrom, periodTo);
      case 'LEGAL_BASIS':
        return this.sectionLegalBasis(orgId, periodFrom, periodTo);
      case 'CONSENT':
        return this.sectionConsent(orgId, periodFrom, periodTo);
      case 'PROVIDER_ACCESS_GRANT':
        return this.sectionProviderGrants(orgId, periodFrom, periodTo);
      case 'DATA_PROCESSING_AGREEMENT':
        return this.sectionDpa(orgId, periodFrom, periodTo);
      case 'DPIA':
        return this.sectionDpia(orgId, periodFrom, periodTo);
      case 'ENFORCEMENT_COVERAGE':
        return this.sectionEnforcementCoverage(orgId, correlationId);
      case 'REVIEW_APPROVAL':
        return this.sectionReviewApproval(orgId, periodFrom, periodTo);
      case 'POLICY_DEPLOYMENT':
        return this.sectionPolicyDeployment(orgId, periodFrom, periodTo);
      case 'REVOCATION':
        return this.sectionRevocation(orgId, periodFrom, periodTo);
      case 'RETENTION':
        return this.sectionRetention(orgId, periodFrom, periodTo);
      case 'DELETION':
        return this.sectionDeletion(orgId, periodFrom, periodTo);
      case 'AUTHORIZATION_DECISIONS':
        return this.sectionAuthorizationDecisions(orgId, periodFrom, periodTo);
      case 'RUNTIME_HEALTH':
        return this.sectionRuntimeHealth(orgId);
      case 'PROVIDER_CONSISTENCY':
        return this.sectionProviderConsistency(orgId);
      default:
        return {
          sectionType,
          recordCount: 0,
          hasGap: true,
          gapReason: 'UNKNOWN_SECTION',
          immutableVersionRefs: [],
          summary: {},
        };
    }
  }

  private async sectionProcessingActivities(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.processingActivity.findMany({
      where: {
        organizationId: orgId,
        updatedAt: this.dateFilter(periodFrom, periodTo),
      },
      select: {
        id: true,
        policyFamilyId: true,
        versionNumber: true,
        status: true,
        contentFingerprint: true,
        activatedAt: true,
        isCurrentVersion: true,
      },
      orderBy: { versionNumber: 'desc' },
      take: 200,
    });
    return this.buildSection('PROCESSING_ACTIVITY_VERSION', rows, rows.length === 0, {
      activeVersions: rows.filter((r) => r.isCurrentVersion).length,
    });
  }

  private async sectionLegalBasis(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.legalBasisAssessment.findMany({
      where: { organizationId: orgId, updatedAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        policyFamilyId: true,
        versionNumber: true,
        status: true,
        legalBasisType: true,
        validFrom: true,
        validUntil: true,
      },
      take: 200,
    });
    return this.buildSection('LEGAL_BASIS', rows, rows.length === 0, {
      activeCount: rows.filter((r) => r.status === 'ACTIVE').length,
    });
  }

  private async sectionConsent(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.dataSubjectConsent.findMany({
      where: { organizationId: orgId, updatedAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        consentStatus: true,
        processingActivityId: true,
        grantedAt: true,
        expiresAt: true,
        evidenceReference: true,
        consentTextVersion: true,
      },
      take: 200,
    });
    return this.buildSection('CONSENT', rows, rows.length === 0, {
      grantedCount: rows.filter((r) => r.consentStatus === 'GRANTED').length,
    });
  }

  private async sectionProviderGrants(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.providerAccessGrant.findMany({
      where: { organizationId: orgId, updatedAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        provider: true,
        providerStatus: true,
        processingActivityId: true,
        grantedAt: true,
        revokedAt: true,
      },
      take: 200,
    });
    return this.buildSection('PROVIDER_ACCESS_GRANT', rows, rows.length === 0, {
      activeGrants: rows.filter((r) => r.providerStatus === 'ACTIVE').length,
    });
  }

  private async sectionDpa(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.dataProcessingAgreement.findMany({
      where: { organizationId: orgId, updatedAt: this.dateFilter(periodFrom, periodTo), isCurrentVersion: true },
      select: {
        id: true,
        policyFamilyId: true,
        versionNumber: true,
        status: true,
        processorName: true,
        contractReference: true,
      },
      take: 200,
    });
    return this.buildSection('DATA_PROCESSING_AGREEMENT', rows, rows.length === 0, {
      activeCount: rows.filter((r) => r.status === 'ACTIVE').length,
    });
  }

  private async sectionDpia(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.processingActivityDpia.findMany({
      where: { organizationId: orgId, updatedAt: this.dateFilter(periodFrom, periodTo), isCurrent: true },
      select: {
        id: true,
        processingActivityId: true,
        approvalStatus: true,
        evidenceReference: true,
        contentFingerprint: true,
      },
      take: 200,
    });
    return this.buildSection('DPIA', rows, rows.length === 0, {
      approvedCount: rows.filter((r) => r.approvalStatus === 'DPIA_APPROVED').length,
    });
  }

  private sectionEnforcementCoverage(orgId: string, correlationId?: string): ComplianceEvidenceSection {
    const summary = this.coverage.evaluate(orgId, correlationId ?? `evidence-${orgId}`);
    const hasGap = summary.notImplementedCount > 0 || summary.enforcementErrorCount > 0;
    return {
      sectionType: 'ENFORCEMENT_COVERAGE',
      recordCount: summary.totalFlows,
      hasGap,
      gapReason: hasGap ? 'ENFORCEMENT_GAPS_PRESENT' : undefined,
      immutableVersionRefs: [
        { coverageVersion: summary.coverageVersion, gitCommit: summary.gitCommit, buildVersion: summary.buildVersion },
      ],
      summary: {
        enforcedCount: summary.enforcedCount,
        notImplementedCount: summary.notImplementedCount,
        enforcementErrorCount: summary.enforcementErrorCount,
        fullyProtected: summary.fullyProtected,
        evaluatedAt: summary.evaluatedAt,
      },
    };
  }

  private async sectionReviewApproval(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const decisions = await this.prisma.dataProcessingReviewDecision.findMany({
      where: { organizationId: orgId, decidedAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        reviewCycleId: true,
        stepType: true,
        decision: true,
        actorUserId: true,
        entityVersionNumber: true,
        decidedAt: true,
      },
      take: 200,
    });
    return this.buildSection('REVIEW_APPROVAL', decisions, decisions.length === 0, {
      approvedSteps: decisions.filter((d) => d.decision === 'APPROVED').length,
    });
  }

  private async sectionPolicyDeployment(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.processingActivityLifecycleEvent.findMany({
      where: { organizationId: orgId, createdAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        processingActivityId: true,
        previousStatus: true,
        newStatus: true,
        eventType: true,
        actorUserId: true,
        createdAt: true,
      },
      take: 200,
    });
    return this.buildSection('POLICY_DEPLOYMENT', rows, rows.length === 0, {
      activationEvents: rows.filter((r) => r.newStatus === 'ACTIVE').length,
    });
  }

  private async sectionRevocation(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.dataAuthorizationRevocationWorkflow.findMany({
      where: { organizationId: orgId, createdAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        status: true,
        triggerType: true,
        processingActivityId: true,
        completedAt: true,
      },
      take: 200,
    });
    return this.buildSection('REVOCATION', rows, false, {
      completedCount: rows.filter((r) => r.status === 'REVOCATION_COMPLETE').length,
    });
  }

  private async sectionRetention(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.processingActivityRetentionPolicy.findMany({
      where: { organizationId: orgId, updatedAt: this.dateFilter(periodFrom, periodTo), isConfigured: true },
      select: {
        id: true,
        processingActivityId: true,
        retentionClass: true,
        legalHold: true,
        deletionDueAt: true,
        deletionCompletedAt: true,
      },
      take: 200,
    });
    return this.buildSection('RETENTION', rows, rows.length === 0, {
      legalHoldCount: rows.filter((r) => r.legalHold).length,
    });
  }

  private async sectionDeletion(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const [jobs, decisions] = await Promise.all([
      this.prisma.processingActivityDeletionJob.findMany({
        where: { organizationId: orgId, createdAt: this.dateFilter(periodFrom, periodTo) },
        select: { id: true, status: true, dryRun: true, partialFailure: true, retentionPolicyId: true },
        take: 100,
      }),
      this.prisma.processingActivityDeletionDecision.findMany({
        where: { organizationId: orgId, createdAt: this.dateFilter(periodFrom, periodTo) },
        select: { id: true, decisionType: true, outcome: true, retentionPolicyId: true },
        take: 100,
      }),
    ]);
    const rows = [...jobs.map((j) => ({ kind: 'job', ...j })), ...decisions.map((d) => ({ kind: 'decision', ...d }))];
    return this.buildSection('DELETION', rows, rows.length === 0, {
      jobCount: jobs.length,
      decisionCount: decisions.length,
    });
  }

  private async sectionAuthorizationDecisions(orgId: string, periodFrom: Date | null, periodTo: Date) {
    const rows = await this.prisma.authorizationDecisionEvent.findMany({
      where: { organizationId: orgId, createdAt: this.dateFilter(periodFrom, periodTo) },
      select: {
        id: true,
        eventType: true,
        pathId: true,
        policyVersion: true,
        engineVersion: true,
        resourceReferenceHash: true,
        evaluatedAt: true,
      },
      take: 500,
    });
    return this.buildSection('AUTHORIZATION_DECISIONS', rows, false, {
      denyCount: rows.filter((r) => r.eventType === 'DENY').length,
      allowCount: rows.filter((r) => r.eventType === 'ALLOW').length,
    });
  }

  private sectionRuntimeHealth(orgId: string): ComplianceEvidenceSection {
    const metrics = this.coverage.getRuntimeMetricsSnapshot();
    return {
      sectionType: 'RUNTIME_HEALTH',
      recordCount: Object.keys(metrics).length,
      hasGap: Object.keys(metrics).length === 0,
      gapReason: Object.keys(metrics).length === 0 ? 'NO_RUNTIME_METRICS' : undefined,
      immutableVersionRefs: [],
      summary: { domains: Object.keys(metrics), organizationId: orgId },
    };
  }

  private async sectionProviderConsistency(orgId: string) {
    const [grants, dpas] = await Promise.all([
      this.prisma.providerAccessGrant.findMany({
        where: { organizationId: orgId, providerStatus: 'ACTIVE' },
        select: { id: true, provider: true, processingActivityId: true },
        take: 100,
      }),
      this.prisma.dataProcessingAgreement.findMany({
        where: { organizationId: orgId, isCurrentVersion: true, status: 'ACTIVE' },
        select: { id: true, processorName: true },
        take: 100,
      }),
    ]);
    const grantProviders = new Set(grants.map((g) => g.provider.toLowerCase()));
    const dpaProcessors = new Set(dpas.map((d) => d.processorName.toLowerCase()));
    const unmatchedGrants = grants.filter((g) => !dpaProcessors.has(g.provider.toLowerCase()));
    const hasGap = unmatchedGrants.length > 0;
    return {
      sectionType: 'PROVIDER_CONSISTENCY' as const,
      recordCount: grants.length + dpas.length,
      hasGap,
      gapReason: hasGap ? 'ACTIVE_GRANT_WITHOUT_MATCHING_DPA' : undefined,
      immutableVersionRefs: dpas.map((d) => ({ agreementId: d.id, processorName: d.processorName })),
      summary: {
        activeGrants: grants.length,
        activeDpas: dpas.length,
        unmatchedGrantCount: unmatchedGrants.length,
      },
    };
  }

  private buildSection(
    sectionType: (typeof COMPLIANCE_EVIDENCE_SECTION_TYPES)[number],
    rows: Array<Record<string, unknown>>,
    hasGap: boolean,
    summaryExtra: Record<string, unknown> = {},
  ): ComplianceEvidenceSection {
    const immutableVersionRefs = rows.map((row) => {
      const ref: Record<string, string | number | null> = { id: String(row.id) };
      if (row.policyFamilyId) ref.policyFamilyId = String(row.policyFamilyId);
      if (row.versionNumber != null) ref.versionNumber = Number(row.versionNumber);
      if (row.status) ref.status = String(row.status);
      if (row.contentFingerprint) ref.contentFingerprint = String(row.contentFingerprint);
      return ref;
    });

    return {
      sectionType,
      recordCount: rows.length,
      hasGap,
      gapReason: hasGap ? 'NO_RECORDS_IN_PERIOD' : undefined,
      immutableVersionRefs,
      summary: summaryExtra,
    };
  }
}
