import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { InvoiceDocumentBackfillService } from './invoice-document-backfill.service';
import { InvoiceDocumentIntegrityAuditService } from './invoice-document-integrity-audit.service';

/**
 * Lean Nest context for invoice/document audit + controlled backfill CLI scripts.
 */
@Module({
  imports: [PrismaModule],
  providers: [InvoiceDocumentIntegrityAuditService, InvoiceDocumentBackfillService],
  exports: [InvoiceDocumentIntegrityAuditService, InvoiceDocumentBackfillService],
})
export class InvoiceDocumentAuditCliModule {}
