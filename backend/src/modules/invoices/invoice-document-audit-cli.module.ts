import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { InvoiceDocumentIntegrityAuditService } from './invoice-document-integrity-audit.service';

/**
 * Lean Nest context for read-only invoice/document integrity audits.
 * Avoids booting the full AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [InvoiceDocumentIntegrityAuditService],
  exports: [InvoiceDocumentIntegrityAuditService],
})
export class InvoiceDocumentAuditCliModule {}
