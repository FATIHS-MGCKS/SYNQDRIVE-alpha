import {
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  ProcessingActivityRegisterAuditAction,
  ProcessingActivityRegisterExportFormat,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '@shared/database/prisma.service';
import { PDFDocument } from '../../documents/pdfkit-document';
import { PROCESSING_ACTIVITY_REGISTER } from './processing-activity-register.constants';
import { ProcessingActivityRegisterAuditService } from './processing-activity-register-audit.service';
import { ProcessingActivityRegisterService } from './processing-activity-register.service';
import { mapRegisterDetail } from './processing-activity-register.mapper';
import { ProcessingActivityRegisterCompletenessService } from './processing-activity-register-completeness.service';
import type { CreateRegisterExportDto } from './dto/processing-activity-register.dto';
import { REGISTER_ACTIVITY_INCLUDE } from './processing-activity-register.mapper';

@Injectable()
export class ProcessingActivityRegisterExportService {
  private readonly exportRoot = join(process.cwd(), 'uploads', 'processing-activity-register');

  constructor(
    private readonly prisma: PrismaService,
    private readonly register: ProcessingActivityRegisterService,
    private readonly completeness: ProcessingActivityRegisterCompletenessService,
    private readonly audit: ProcessingActivityRegisterAuditService,
  ) {}

  async createExport(
    orgId: string,
    dto: CreateRegisterExportDto,
    actorUserId?: string,
  ) {
    const snapshotAt = new Date();
    const rows = dto.processingActivityId
      ? [await this.register.findOrThrow(orgId, dto.processingActivityId)]
      : await this.prisma.processingActivity.findMany({
          where: { organizationId: orgId, isCurrentVersion: true },
          include: REGISTER_ACTIVITY_INCLUDE,
          orderBy: { title: 'asc' },
        });

    const details = rows.map((r) => mapRegisterDetail(r, this.completeness));
    const expiresAt = new Date(
      snapshotAt.getTime() + PROCESSING_ACTIVITY_REGISTER.exportTtlHours * 60 * 60 * 1000,
    );

    const content =
      dto.format === ProcessingActivityRegisterExportFormat.CSV
        ? this.buildCsv(details, snapshotAt)
        : await this.buildPdf(details, snapshotAt);

    const checksumSha256 = createHash('sha256').update(content).digest('hex');
    const fileName = `art30-register-${orgId.slice(0, 8)}-${snapshotAt.toISOString().slice(0, 10)}.${dto.format === ProcessingActivityRegisterExportFormat.CSV ? 'csv' : 'pdf'}`;
    const orgDir = join(this.exportRoot, orgId);
    await mkdir(orgDir, { recursive: true });
    const filePath = join(orgDir, `${randomUUID()}-${fileName}`);
    await writeFile(filePath, content);

    const mimeType =
      dto.format === ProcessingActivityRegisterExportFormat.CSV
        ? 'text/csv; charset=utf-8'
        : 'application/pdf';

    const exportRecord = await this.prisma.processingActivityRegisterExport.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        requestedByUserId: actorUserId ?? null,
        format: dto.format,
        fileName,
        filePath,
        mimeType,
        dataSnapshotAt: snapshotAt,
        activityCount: details.length,
        recordVersion: PROCESSING_ACTIVITY_REGISTER.recordVersion,
        checksumSha256,
        expiresAt,
        processingActivityId: dto.processingActivityId ?? null,
      },
    });

    await this.audit.record({
      organizationId: orgId,
      action: ProcessingActivityRegisterAuditAction.EXPORT_CREATED,
      actorUserId,
      exportId: exportRecord.id,
      processingActivityId: dto.processingActivityId ?? null,
      metadata: { format: dto.format, activityCount: details.length, expiresAt: expiresAt.toISOString() },
    });

    return {
      id: exportRecord.id,
      format: exportRecord.format,
      fileName: exportRecord.fileName,
      mimeType: exportRecord.mimeType,
      dataSnapshotAt: exportRecord.dataSnapshotAt,
      activityCount: exportRecord.activityCount,
      recordVersion: exportRecord.recordVersion,
      checksumSha256: exportRecord.checksumSha256,
      expiresAt: exportRecord.expiresAt,
      disclaimer: PROCESSING_ACTIVITY_REGISTER.disclaimer,
      downloadPath: `/organizations/${orgId}/data-authorizations/processing-activity-register/exports/${exportRecord.id}/download`,
    };
  }

  async downloadExport(orgId: string, exportId: string, actorUserId?: string) {
    const record = await this.prisma.processingActivityRegisterExport.findFirst({
      where: { id: exportId, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException({ message: 'Export not found', code: 'REGISTER_EXPORT_NOT_FOUND' });
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException({ message: 'Export expired', code: 'REGISTER_EXPORT_EXPIRED' });
    }

    const buffer = await readFile(record.filePath);

    await this.audit.record({
      organizationId: orgId,
      action: ProcessingActivityRegisterAuditAction.EXPORT_DOWNLOADED,
      actorUserId,
      exportId: record.id,
    });

    return new StreamableFile(buffer, {
      type: record.mimeType,
      disposition: `attachment; filename="${record.fileName}"`,
    });
  }

  async purgeExpiredExports(): Promise<number> {
    const expired = await this.prisma.processingActivityRegisterExport.findMany({
      where: { expiresAt: { lte: new Date() } },
      take: 100,
    });
    for (const row of expired) {
      await this.prisma.processingActivityRegisterExport.delete({ where: { id: row.id } });
    }
    return expired.length;
  }

  private buildCsv(
    details: ReturnType<typeof mapRegisterDetail>[],
    snapshotAt: Date,
  ): Buffer {
    const header = [
      'activityCode',
      'title',
      'status',
      'purposeSummary',
      'dataCategories',
      'processingPurposes',
      'dataSubjectTypes',
      'retentionDescription',
      'retentionPeriodDays',
      'legalBasisPresent',
      'dpiaStatus',
      'nextReviewDate',
      'completenessStatus',
      'blockingGaps',
      'dataSnapshotAt',
      'disclaimer',
    ];
    const lines = [header.join(';')];
    for (const d of details) {
      lines.push(
        [
          this.csv(d.activityCode),
          this.csv(d.title),
          d.status,
          this.csv(d.purposeSummary ?? ''),
          this.csv((d.dataCategories ?? []).join('|')),
          this.csv((d.processingPurposes ?? []).join('|')),
          this.csv((d.dataSubjectTypes ?? []).join('|')),
          this.csv(d.retention?.description ?? ''),
          d.retention?.periodDays ?? '',
          d.legalBasisAssessments?.some((a) => a.status === 'ACTIVE' || a.status === 'APPROVED')
            ? 'yes'
            : 'no',
          d.dpiaStatus,
          d.nextReviewDate?.toISOString() ?? '',
          d.completeness.status,
          this.csv((d.completeness.blockingGaps ?? []).join('|')),
          snapshotAt.toISOString(),
          this.csv(PROCESSING_ACTIVITY_REGISTER.disclaimer),
        ].join(';'),
      );
    }
    return Buffer.from(lines.join('\n'), 'utf8');
  }

  private csv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private async buildPdf(
    details: ReturnType<typeof mapRegisterDetail>[],
    snapshotAt: Date,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text('Verzeichnis der Verarbeitungstätigkeiten (Art. 30)', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#444');
      doc.text(PROCESSING_ACTIVITY_REGISTER.disclaimer);
      doc.text(`Datenstand: ${snapshotAt.toISOString()}`);
      doc.text(`Einträge: ${details.length}`);
      doc.moveDown();

      for (const d of details) {
        doc.fillColor('#000').fontSize(12).text(d.title, { continued: false });
        doc.fontSize(9);
        doc.text(`Code: ${d.activityCode} | Status: ${d.status} | Vollständigkeit: ${d.completeness.status}`);
        if (d.completeness.blockingGaps.length > 0) {
          doc.fillColor('#b45309').text(`Blockierend fehlend: ${d.completeness.blockingGaps.join(', ')}`);
          doc.fillColor('#000');
        }
        doc.text(`Zweck: ${d.purposeSummary ?? '—'}`);
        doc.text(`Datenkategorien: ${(d.dataCategories ?? []).join(', ') || '—'}`);
        doc.text(`Betroffene: ${(d.dataSubjectTypes ?? []).join(', ') || '—'}`);
        doc.text(`Aufbewahrung: ${d.retention?.description ?? '—'}`);
        doc.moveDown(0.75);
      }

      doc.end();
    });
  }
}
