import {
  ComplianceEvidenceAuditAction,
  ComplianceEvidenceReportStatus,
  ComplianceEvidenceReportType,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { ComplianceEvidenceAssemblerService } from './compliance-evidence-assembler.service';
import { ComplianceEvidenceAuditService } from './compliance-evidence-audit.service';
import { ComplianceEvidenceExportService } from './compliance-evidence-export.service';
import { COMPLIANCE_EVIDENCE } from './compliance-evidence.constants';

describe('Compliance evidence integration (in-memory harness)', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';

  function buildHarness() {
    const reports: Array<Record<string, unknown>> = [];
    const auditEvents: Array<Record<string, unknown>> = [];

    const prisma = {
      processingActivity: { findMany: jest.fn(async () => [{ id: 'pa-1', policyFamilyId: 'fam-1', versionNumber: 1, status: 'ACTIVE', contentFingerprint: 'fp1', activatedAt: new Date(), isCurrentVersion: true }]), count: jest.fn(async () => 1) },
      legalBasisAssessment: { findMany: jest.fn(async () => [{ id: 'lb-1', policyFamilyId: 'lb-fam', versionNumber: 1, status: 'ACTIVE', legalBasisType: 'CONSENT', validFrom: new Date(), validUntil: null }]) },
      dataSubjectConsent: { findMany: jest.fn(async () => [{ id: 'c-1', consentStatus: 'GRANTED', processingActivityId: 'pa-1', grantedAt: new Date(), expiresAt: null, evidenceReference: 'ref-1', consentTextVersion: 'v1' }]) },
      providerAccessGrant: { findMany: jest.fn(async () => [{ id: 'g-1', provider: 'DIMO', providerStatus: 'ACTIVE', processingActivityId: 'pa-1', grantedAt: new Date(), revokedAt: null }]) },
      dataProcessingAgreement: { findMany: jest.fn(async () => [{ id: 'dpa-1', policyFamilyId: 'dpa-fam', versionNumber: 1, status: 'ACTIVE', processorName: 'DIMO', contractReference: 'C-1' }]) },
      processingActivityDpia: { findMany: jest.fn(async () => [{ id: 'dpia-1', processingActivityId: 'pa-1', approvalStatus: 'DPIA_APPROVED', evidenceReference: 'ev-1', contentFingerprint: 'fp' }]) },
      dataProcessingReviewDecision: { findMany: jest.fn(async () => [{ id: 'rd-1', reviewCycleId: 'rc-1', stepType: 'FINAL_APPROVAL', decision: 'APPROVED', actorUserId: 'u-1', entityVersionNumber: 1, decidedAt: new Date() }]) },
      processingActivityLifecycleEvent: { findMany: jest.fn(async () => [{ id: 'le-1', processingActivityId: 'pa-1', previousStatus: 'APPROVED', newStatus: 'ACTIVE', eventType: 'ACTIVATED', actorUserId: 'u-1', createdAt: new Date() }]) },
      dataAuthorizationRevocationWorkflow: { findMany: jest.fn(async () => [{ id: 'rw-1', status: 'REVOCATION_COMPLETE', triggerType: 'CONSENT_WITHDRAWN', processingActivityId: 'pa-1', completedAt: new Date() }]) },
      processingActivityRetentionPolicy: { findMany: jest.fn(async () => [{ id: 'rp-1', processingActivityId: 'pa-1', retentionClass: 'TELEMETRY', legalHold: false, deletionDueAt: null, deletionCompletedAt: null }]) },
      processingActivityDeletionJob: { findMany: jest.fn(async () => [{ id: 'dj-1', status: 'COMPLETED', dryRun: false, partialFailure: false, retentionPolicyId: 'rp-1' }]) },
      processingActivityDeletionDecision: { findMany: jest.fn(async () => [{ id: 'dd-1', decisionType: 'DELETION_EXECUTED', outcome: 'COMPLETED', retentionPolicyId: 'rp-1' }]) },
      authorizationDecisionEvent: { findMany: jest.fn(async () => [{ id: 'ad-1', eventType: 'ALLOW', pathId: 'live-gps', policyVersion: 1, engineVersion: 'v1', resourceReferenceHash: 'hash', evaluatedAt: new Date() }]), count: jest.fn(async () => 1) },
      complianceEvidenceReport: {
        findUnique: jest.fn(async ({ where }: { where: { id?: string; idempotencyKey?: string } }) =>
          reports.find((r) => r.id === where.id || r.idempotencyKey === where.idempotencyKey) ?? null,
        ),
        findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) =>
          reports.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
        ),
        findMany: jest.fn(async () => reports),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data };
          reports.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = reports.find((r) => r.id === where.id);
          Object.assign(row!, data);
          return row;
        }),
        delete: jest.fn(),
        count: jest.fn(async () => 0),
      },
      complianceEvidenceReportAuditEvent: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          auditEvents.push(data);
          return data;
        }),
        findMany: jest.fn(async () => auditEvents),
      },
    };

    const coverage = {
      evaluate: jest.fn(() => ({
        coverageVersion: 'cov@v1',
        gitCommit: 'abc123',
        buildVersion: '0.1.0',
        evaluatedAt: new Date().toISOString(),
        totalFlows: 10,
        enforcedCount: 9,
        partiallyEnforcedCount: 1,
        notImplementedCount: 0,
        enforcementErrorCount: 0,
        disabledCount: 0,
        fullyProtected: true,
        unregisteredProductivePaths: [],
        flows: [],
      })),
      getRuntimeMetricsSnapshot: jest.fn(() => ({ telemetry: { allow: 1 } })),
    };

    const audit = new ComplianceEvidenceAuditService(prisma as never);
    const assembler = new ComplianceEvidenceAssemblerService(prisma as never, coverage as never);
    const exports = new ComplianceEvidenceExportService(prisma as never, assembler, audit);

    return { prisma, reports, auditEvents, assembler, exports, coverage };
  }

  it('assembles full package with immutable version refs and gap labeling', async () => {
    const h = buildHarness();
    const pkg = await h.assembler.assemble({
      organizationId: orgId,
      reportType: ComplianceEvidenceReportType.FULL_PACKAGE,
    });

    expect(pkg.sections.length).toBeGreaterThan(10);
    expect(pkg.disclaimer).toContain('keine automatische Compliance-Behauptung');
    expect(pkg.includesRuntimeData).toBe(true);
    expect(pkg.gitCommit).toBeTruthy();
    expect(pkg.complianceClaimAllowed).toBe(true);
    expect(pkg.sections.every((s) => Array.isArray(s.immutableVersionRefs))).toBe(true);
  });

  it('marks compliance claim disallowed when mandatory section has gap', async () => {
    const h = buildHarness();
    h.prisma.processingActivityRetentionPolicy.findMany.mockResolvedValue([]);
    const pkg = await h.assembler.assemble({
      organizationId: orgId,
      reportType: ComplianceEvidenceReportType.FULL_PACKAGE,
    });
    expect(pkg.complianceClaimAllowed).toBe(false);
    expect(pkg.gaps.some((g) => g.sectionType === 'RETENTION')).toBe(true);
  });

  it('creates export with checksum and audit trail', async () => {
    const h = buildHarness();
    const result = (await h.exports.requestExport(
      orgId,
      { reportType: ComplianceEvidenceReportType.LEGAL_BASIS },
      'auditor-1',
    )) as { status: string; checksumSha256: string };

    expect(result.status).toBe(ComplianceEvidenceReportStatus.COMPLETED);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(h.auditEvents.some((e) => e.action === ComplianceEvidenceAuditAction.EXPORT_REQUESTED)).toBe(true);
    expect(h.auditEvents.some((e) => e.action === ComplianceEvidenceAuditAction.EXPORT_COMPLETED)).toBe(true);
  });

  it('replays idempotent export without error', async () => {
    const h = buildHarness();
    const dto = { reportType: ComplianceEvidenceReportType.DPIA };
    const first = await h.exports.requestExport(orgId, dto, 'auditor-1');
    const second = await h.exports.requestExport(orgId, dto, 'auditor-1');
    expect((second as { idempotentReplay?: boolean }).idempotentReplay).toBe(true);
    expect(second.id).toBe(first.id);
    expect(h.reports).toHaveLength(1);
  });

  it('rejects download for wrong tenant', async () => {
    const h = buildHarness();
    const created = await h.exports.requestExport(orgId, { reportType: ComplianceEvidenceReportType.CONSENT }, 'auditor-1');
    await expect(h.exports.downloadExport(otherOrgId, created.id as string, 'auditor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uses deterministic idempotency key for reproducible packages', () => {
    const h = buildHarness();
    const dto = { reportType: ComplianceEvidenceReportType.FULL_PACKAGE, periodFrom: '2026-01-01T00:00:00.000Z' };
    const a = h.exports.buildIdempotencyKey(orgId, dto);
    const b = h.exports.buildIdempotencyKey(orgId, dto);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('labels provider consistency gaps', async () => {
    const h = buildHarness();
    h.prisma.providerAccessGrant.findMany.mockResolvedValue([
      { id: 'g-2', provider: 'UNKNOWN_VENDOR', providerStatus: 'ACTIVE', processingActivityId: 'pa-1', grantedAt: new Date(), revokedAt: null },
    ]);
    const pkg = await h.assembler.assemble({
      organizationId: orgId,
      reportType: ComplianceEvidenceReportType.PROVIDER_CONSISTENCY,
    });
    const section = pkg.sections.find((s) => s.sectionType === 'PROVIDER_CONSISTENCY');
    expect(section?.hasGap).toBe(true);
    expect(section?.gapReason).toBe('ACTIVE_GRANT_WITHOUT_MATCHING_DPA');
  });

  it('documents record version constant', () => {
    expect(COMPLIANCE_EVIDENCE.recordVersion).toBe('compliance-evidence-v1');
  });
});
