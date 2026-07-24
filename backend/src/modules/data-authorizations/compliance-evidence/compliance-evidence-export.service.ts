import {
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  ComplianceEvidenceAuditAction,
  ComplianceEvidenceReportStatus,
  ComplianceEvidenceReportType,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '@shared/database/prisma.service';
import { ComplianceEvidenceAssemblerService } from './compliance-evidence-assembler.service';
import { ComplianceEvidenceAuditService } from './compliance-evidence-audit.service';
import { COMPLIANCE_EVIDENCE } from './compliance-evidence.constants';
import type { CreateComplianceEvidenceExportDto } from './dto/compliance-evidence.dto';

@Injectable()
export class ComplianceEvidenceExportService {
  private readonly logger = new Logger(ComplianceEvidenceExportService.name);
  private readonly exportRoot = join(process.cwd(), 'uploads', 'compliance-evidence');

  constructor(
    private readonly prisma: PrismaService,
    private readonly assembler: ComplianceEvidenceAssemblerService,
    private readonly audit: ComplianceEvidenceAuditService,
  ) {}

  buildIdempotencyKey(
    orgId: string,
    dto: CreateComplianceEvidenceExportDto,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          orgId,
          reportType: dto.reportType,
          periodFrom: dto.periodFrom ?? null,
          periodTo: dto.periodTo ?? null,
          format: 'JSON',
          v: COMPLIANCE_EVIDENCE.recordVersion,
        }),
      )
      .digest('hex');
  }

  async requestExport(
    orgId: string,
    dto: CreateComplianceEvidenceExportDto,
    actorUserId?: string,
  ) {
    const idempotencyKey = this.buildIdempotencyKey(orgId, dto);
    const existing = await this.prisma.complianceEvidenceReport.findUnique({
      where: { idempotencyKey },
    });

    if (existing?.status === ComplianceEvidenceReportStatus.COMPLETED) {
      return { ...existing, idempotentReplay: true };
    }

    const periodFrom = dto.periodFrom ? new Date(dto.periodFrom) : undefined;
    const periodTo = dto.periodTo ? new Date(dto.periodTo) : undefined;

    const report =
      existing ??
      (await this.prisma.complianceEvidenceReport.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          reportType: dto.reportType,
          status: ComplianceEvidenceReportStatus.PLANNED,
          idempotencyKey,
          periodFrom: periodFrom ?? null,
          periodTo: periodTo ?? null,
          generatedByUserId: actorUserId ?? null,
          recordVersion: COMPLIANCE_EVIDENCE.recordVersion,
        },
      }));

    await this.audit.record({
      organizationId: orgId,
      action: ComplianceEvidenceAuditAction.EXPORT_REQUESTED,
      actorUserId,
      reportId: report.id,
      metadata: { reportType: dto.reportType, async: dto.async ?? false },
    });

    const estimatedRows = await this.estimateRowCount(orgId, dto.reportType);
    const shouldAsync = dto.async === true || estimatedRows > COMPLIANCE_EVIDENCE.asyncRowThreshold;

    if (!shouldAsync) {
      return this.processReport(report.id, actorUserId);
    }

    return {
      id: report.id,
      status: ComplianceEvidenceReportStatus.PLANNED,
      async: true,
      message: 'Report queued for asynchronous generation',
    };
  }

  async processReport(reportId: string, actorUserId?: string) {
    const report = await this.prisma.complianceEvidenceReport.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException({ message: 'Report not found' });
    }

    if (report.status === ComplianceEvidenceReportStatus.COMPLETED) {
      return { ...report, idempotentReplay: true };
    }

    await this.prisma.complianceEvidenceReport.update({
      where: { id: reportId },
      data: { status: ComplianceEvidenceReportStatus.IN_PROGRESS },
    });

    try {
      const pkg = await this.assembler.assemble({
        organizationId: report.organizationId,
        reportType: report.reportType,
        periodFrom: report.periodFrom ?? undefined,
        periodTo: report.periodTo ?? undefined,
        correlationId: `compliance-evidence-${report.id}`,
      });

      const canonical = JSON.stringify(pkg, null, 2);
      const content = Buffer.from(canonical, 'utf8');
      const checksumSha256 = createHash('sha256').update(content).digest('hex');
      const snapshotAt = new Date(pkg.generatedAt);
      const expiresAt = new Date(
        snapshotAt.getTime() + COMPLIANCE_EVIDENCE.exportTtlHours * 60 * 60 * 1000,
      );
      const fileName = `compliance-evidence-${report.reportType.toLowerCase()}-${report.organizationId.slice(0, 8)}-${snapshotAt.toISOString().slice(0, 10)}.json`;
      const orgDir = join(this.exportRoot, report.organizationId);
      await mkdir(orgDir, { recursive: true });
      const filePath = join(orgDir, `${report.id}-${fileName}`);
      await writeFile(filePath, content);

      const updated = await this.prisma.complianceEvidenceReport.update({
        where: { id: reportId },
        data: {
          status: ComplianceEvidenceReportStatus.COMPLETED,
          generatedAt: snapshotAt,
          gitCommit: pkg.gitCommit,
          buildVersion: pkg.buildVersion,
          includesRuntimeData: pkg.includesRuntimeData,
          complianceClaimAllowed: pkg.complianceClaimAllowed,
          gapCount: pkg.gapCount,
          sectionSummary: pkg.sections.map((s) => ({
            sectionType: s.sectionType,
            recordCount: s.recordCount,
            hasGap: s.hasGap,
            gapReason: s.gapReason ?? null,
          })),
          fileName,
          filePath,
          mimeType: 'application/json; charset=utf-8',
          checksumSha256,
          dataSnapshotAt: snapshotAt,
          expiresAt,
          errorMessage: null,
        },
      });

      await this.audit.record({
        organizationId: report.organizationId,
        action: ComplianceEvidenceAuditAction.EXPORT_COMPLETED,
        actorUserId: actorUserId ?? report.generatedByUserId,
        reportId: report.id,
        metadata: {
          checksumSha256,
          gapCount: pkg.gapCount,
          complianceClaimAllowed: pkg.complianceClaimAllowed,
          provenanceLabel: pkg.provenanceLabel,
        },
      });

      return {
        ...updated,
        disclaimer: COMPLIANCE_EVIDENCE.disclaimer,
        downloadPath: `/organizations/${report.organizationId}/data-authorizations/compliance-evidence/exports/${report.id}/download`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.complianceEvidenceReport.update({
        where: { id: reportId },
        data: {
          status: ComplianceEvidenceReportStatus.FAILED,
          errorMessage: message,
        },
      });
      await this.audit.record({
        organizationId: report.organizationId,
        action: ComplianceEvidenceAuditAction.EXPORT_FAILED,
        actorUserId,
        reportId: report.id,
        metadata: { error: message },
      });
      this.logger.error(`Compliance evidence export failed report=${reportId}`, err instanceof Error ? err.stack : message);
      throw err;
    }
  }

  async downloadExport(orgId: string, reportId: string, actorUserId?: string) {
    const record = await this.prisma.complianceEvidenceReport.findFirst({
      where: { id: reportId, organizationId: orgId },
    });
    if (!record || !record.filePath || !record.fileName) {
      throw new NotFoundException({ message: 'Export not found', code: 'COMPLIANCE_EVIDENCE_NOT_FOUND' });
    }
    if (!record.expiresAt || record.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException({ message: 'Export expired', code: 'COMPLIANCE_EVIDENCE_EXPIRED' });
    }
    if (record.status !== ComplianceEvidenceReportStatus.COMPLETED) {
      throw new NotFoundException({ message: 'Export not ready', code: 'COMPLIANCE_EVIDENCE_NOT_READY' });
    }

    const buffer = await readFile(record.filePath);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    if (record.checksumSha256 && checksum !== record.checksumSha256) {
      throw new NotFoundException({ message: 'Export integrity check failed', code: 'COMPLIANCE_EVIDENCE_INTEGRITY' });
    }

    await this.audit.record({
      organizationId: orgId,
      action: ComplianceEvidenceAuditAction.EXPORT_DOWNLOADED,
      actorUserId,
      reportId: record.id,
      metadata: { checksumSha256: checksum },
    });

    return new StreamableFile(buffer, {
      type: record.mimeType ?? 'application/json',
      disposition: `attachment; filename="${record.fileName}"`,
    });
  }

  async purgeExpiredExports(): Promise<number> {
    const expired = await this.prisma.complianceEvidenceReport.findMany({
      where: { expiresAt: { lte: new Date() } },
      take: 100,
    });
    for (const row of expired) {
      await this.prisma.complianceEvidenceReport.delete({ where: { id: row.id } });
    }
    return expired.length;
  }

  private async estimateRowCount(orgId: string, reportType: ComplianceEvidenceReportType): Promise<number> {
    if (reportType === ComplianceEvidenceReportType.FULL_PACKAGE) {
      return (
        (await this.prisma.processingActivity.count({ where: { organizationId: orgId } })) +
        (await this.prisma.authorizationDecisionEvent.count({ where: { organizationId: orgId } }))
      );
    }
    if (reportType === ComplianceEvidenceReportType.AUTHORIZATION_DECISIONS) {
      return this.prisma.authorizationDecisionEvent.count({ where: { organizationId: orgId } });
    }
    return 50;
  }
}
