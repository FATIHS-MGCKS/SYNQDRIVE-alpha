import { Injectable } from '@nestjs/common';
import { ComplianceEvidenceReportStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { COMPLIANCE_EVIDENCE } from './compliance-evidence.constants';
import { ComplianceEvidenceAssemblerService } from './compliance-evidence-assembler.service';
import type { ListComplianceEvidenceReportsQueryDto } from './dto/compliance-evidence.dto';

@Injectable()
export class ComplianceEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assembler: ComplianceEvidenceAssemblerService,
  ) {}

  getConfig() {
    return {
      ...COMPLIANCE_EVIDENCE,
      reportTypes: [
        'FULL_PACKAGE',
        'PROCESSING_ACTIVITY_VERSION',
        'LEGAL_BASIS',
        'CONSENT',
        'PROVIDER_ACCESS_GRANT',
        'DATA_PROCESSING_AGREEMENT',
        'DPIA',
        'ENFORCEMENT_COVERAGE',
        'REVIEW_APPROVAL',
        'POLICY_DEPLOYMENT',
        'REVOCATION',
        'RETENTION',
        'DELETION',
        'AUTHORIZATION_DECISIONS',
        'RUNTIME_HEALTH',
        'PROVIDER_CONSISTENCY',
      ],
    };
  }

  async listReports(orgId: string, query: ListComplianceEvidenceReportsQueryDto) {
    return this.prisma.complianceEvidenceReport.findMany({
      where: {
        organizationId: orgId,
        ...(query.reportType ? { reportType: query.reportType } : {}),
        ...(query.periodFrom ? { createdAt: { gte: new Date(query.periodFrom) } } : {}),
        ...(query.periodTo ? { createdAt: { lte: new Date(query.periodTo) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        reportType: true,
        status: true,
        generatedAt: true,
        generatedByUserId: true,
        complianceClaimAllowed: true,
        gapCount: true,
        checksumSha256: true,
        expiresAt: true,
        createdAt: true,
        includesRuntimeData: true,
        gitCommit: true,
        buildVersion: true,
      },
    });
  }

  async previewPackage(
    orgId: string,
    reportType: Parameters<ComplianceEvidenceAssemblerService['assemble']>[0]['reportType'],
    periodFrom?: string,
    periodTo?: string,
  ) {
    return this.assembler.assemble({
      organizationId: orgId,
      reportType,
      periodFrom: periodFrom ? new Date(periodFrom) : undefined,
      periodTo: periodTo ? new Date(periodTo) : undefined,
      correlationId: `preview-${orgId}`,
    });
  }

  async listAuditEvents(orgId: string) {
    return this.prisma.complianceEvidenceReportAuditEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getReport(orgId: string, reportId: string) {
    return this.prisma.complianceEvidenceReport.findFirst({
      where: { id: reportId, organizationId: orgId },
    });
  }

  countPending(): Promise<number> {
    return this.prisma.complianceEvidenceReport.count({
      where: { status: ComplianceEvidenceReportStatus.PLANNED },
    });
  }
}
