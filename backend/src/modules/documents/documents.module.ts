import { Module, forwardRef } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentsConfig from '@config/documents.config';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { MockDocumentMalwareScannerService } from '@modules/document-extraction/scanners/mock-document-malware-scanner.service';
import { UnavailableDocumentMalwareScannerService } from '@modules/document-extraction/scanners/unavailable-document-malware-scanner.service';
import { DOCUMENT_MALWARE_SCANNER } from '@modules/document-extraction/document-malware-scanner.interface';
import { DocumentsController } from './documents.controller';
import { LegalDocumentsController } from './legal-documents.controller';
import { GeneratedDocumentsService } from './generated-documents.service';
import { LegalDocumentEventsService } from './legal-document-events.service';
import { LegalDocumentScopeService } from './legal-document-scope.service';
import { LegalDocumentResolverService } from './legal-document-resolver.service';
import { LegalDocumentFourEyesService } from './legal-document-four-eyes.service';
import { LegalDocumentPdfValidationService } from './legal-document-pdf-validation.service';
import { LegalDocumentMalwareScanService } from './legal-document-malware-scan.service';
import { LegalDocumentIngestionService } from './legal-document-ingestion.service';
import { LegalDocumentsService } from './legal-documents.service';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { BookingDocumentOrgLegalNotificationService } from './booking-document-org-legal-notification.service';
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
  imports: [
    forwardRef(() => InvoicesModule),
    forwardRef(() => NotificationsModule),
    TasksModule,
  ],
  controllers: [DocumentsController, LegalDocumentsController],
  providers: [
    LocalDocumentStorageService,
    { provide: DOCUMENTS_STORAGE, useClass: LocalDocumentStorageService },
    DocumentRendererService,
    { provide: DOCUMENT_RENDERER, useClass: DocumentRendererService },
    GeneratedDocumentsService,
    LegalDocumentEventsService,
    LegalDocumentScopeService,
    LegalDocumentResolverService,
    LegalDocumentFourEyesService,
    LegalDocumentPdfValidationService,
    LegalDocumentMalwareScanService,
    LegalDocumentIngestionService,
    MockDocumentMalwareScannerService,
    UnavailableDocumentMalwareScannerService,
    {
      provide: DOCUMENT_MALWARE_SCANNER,
      useFactory: (
        config: ConfigType<typeof documentsConfig>,
        mockScanner: MockDocumentMalwareScannerService,
        unavailableScanner: UnavailableDocumentMalwareScannerService,
      ) => {
        if (!config.legalMalwareScanEnabled) return unavailableScanner;
        if (config.legalMalwareScannerProvider === 'mock') return mockScanner;
        return unavailableScanner;
      },
      inject: [
        documentsConfig.KEY,
        MockDocumentMalwareScannerService,
        UnavailableDocumentMalwareScannerService,
      ],
    },
    LegalDocumentsService,
    DocumentNumberingService,
    BookingDocumentOrgLegalNotificationService,
    BookingDocumentBundleService,
  ],
  exports: [
    BookingDocumentBundleService,
    GeneratedDocumentsService,
    LegalDocumentEventsService,
    LegalDocumentResolverService,
    LegalDocumentsService,
    DocumentNumberingService,
    DOCUMENTS_STORAGE,
    DOCUMENT_RENDERER,
  ],
})
export class DocumentsModule {}
