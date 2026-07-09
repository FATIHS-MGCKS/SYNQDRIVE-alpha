import { Module } from '@nestjs/common';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { DocumentsController } from './documents.controller';
import { LegalDocumentsController } from './legal-documents.controller';
import { GeneratedDocumentsService } from './generated-documents.service';
import { LegalDocumentsService } from './legal-documents.service';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { DocumentNumberingService } from './document-numbering.service';
import { DocumentRendererService } from './document-renderer.service';
import { DOCUMENT_RENDERER } from './renderers/render-model';
import { DOCUMENTS_STORAGE } from './storage/document-storage.interface';
import { LocalDocumentStorageService } from './storage/local-document-storage.service';

/**
 * Central document engine for the Booking Document Lifecycle.
 *
 * Owns rendering, private storage, document metadata, download endpoints,
 * bundle orchestration and legal document versioning. Business modules
 * (bookings/invoices/handover) provide data and trigger generation; they do not
 * render or store PDFs themselves. The storage + renderer are bound behind
 * tokens so a future S3 / Chromium implementation can be swapped in.
 */
@Module({
  imports: [InvoicesModule, TasksModule, OutboundEmailModule, CustomersModule],
  controllers: [DocumentsController, LegalDocumentsController],
  providers: [
    LocalDocumentStorageService,
    { provide: DOCUMENTS_STORAGE, useClass: LocalDocumentStorageService },
    DocumentRendererService,
    { provide: DOCUMENT_RENDERER, useClass: DocumentRendererService },
    GeneratedDocumentsService,
    LegalDocumentsService,
    DocumentNumberingService,
    BookingDocumentBundleService,
    BookingDocumentEmailService,
  ],
  exports: [BookingDocumentBundleService, GeneratedDocumentsService, LegalDocumentsService, BookingDocumentEmailService],
})
export class DocumentsModule {}
