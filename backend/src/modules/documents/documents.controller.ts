import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { GeneratedDocumentsService } from './generated-documents.service';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { RentalContractService } from './rental-contract.service';
import { BookingDocumentGenerationDispatcherService } from './booking-document-generation/booking-document-generation.dispatcher.service';
import { toBookingDocumentGenerationJobDto } from './booking-document-generation/booking-document-generation.dto';
import { buildContentDispositionInline } from './storage/document-storage-content-disposition.util';

/**
 * Booking document lifecycle + document download/metadata/void.
 *
 * All routes are org-scoped (OrgScopingGuard validates the :orgId path against
 * the caller's JWT). Generated PDFs are served only here, authenticated — never
 * via a public URL. Downloads serve the STORED file (no silent regeneration).
 */
@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly bundle: BookingDocumentBundleService,
    private readonly generated: GeneratedDocumentsService,
    private readonly rentalContract: RentalContractService,
    private readonly documentGeneration: BookingDocumentGenerationDispatcherService,
  ) {}

  @Get('bookings/:bookingId/rental-contract')
  getRentalContract(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.rentalContract.getByBooking(orgId, bookingId);
  }

  @Get('bookings/:bookingId/rental-contract/download')
  @Header('Cache-Control', 'no-store')
  async downloadRentalContract(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const ctx = await this.rentalContract.getDownloadContext(orgId, bookingId);
    const dl = await this.generated.getDownload(orgId, ctx.generatedDocumentId);
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': buildContentDispositionInline(dl.fileName),
      'X-SynqDrive-Legal-Snapshot-Frozen-At': ctx.legalSnapshotFrozenAt ?? '',
    });
    return new StreamableFile(dl.stream);
  }

  @Get('bookings/:bookingId/documents')
  @RequirePermission('bookings', 'read')
  getBookingDocuments(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.bundle.getBundleView(orgId, bookingId);
  }

  @Post('bookings/:bookingId/documents/generate-initial-bundle')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @RequirePermission('bookings', 'write')
  async generateInitialBundle(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const enqueued = await this.documentGeneration.enqueueInitialBundle(
      orgId,
      bookingId,
      userId ?? null,
    );
    if (enqueued.enqueued) {
      return { queued: true, job: enqueued };
    }
    return this.bundle.generateInitialBundle(orgId, bookingId, userId ?? null);
  }

  @Get('bookings/:bookingId/document-generation-jobs')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @RequirePermission('bookings', 'read')
  async listGenerationJobs(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    const jobs = await this.documentGeneration.listForBooking(orgId, bookingId);
    return jobs.map(toBookingDocumentGenerationJobDto);
  }

  @Post('bookings/:bookingId/document-generation-jobs/:jobId/retry')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @RequirePermission('bookings', 'write')
  async retryGenerationJob(
    @Param('orgId') orgId: string,
    @Param('jobId') jobId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const result = await this.documentGeneration.manualRetry(orgId, jobId, userId ?? null);
    return result;
  }

  @Post('bookings/:bookingId/documents/generate-initial-bundle-sync')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @RequirePermission('bookings', 'write')
  generateInitialBundleSync(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.bundle.generateInitialBundle(orgId, bookingId, userId ?? null);
  }

  @Post('bookings/:bookingId/documents/regenerate/:documentType')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @RequirePermission('bookings', 'write')
  regenerate(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('documentType') documentType: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.bundle.regenerate(orgId, bookingId, documentType, userId ?? null);
  }

  @Get('documents/:documentId/metadata')
  @RequirePermission('bookings', 'read')
  async metadata(@Param('orgId') orgId: string, @Param('documentId') documentId: string) {
    return this.generated.toDto(await this.generated.getById(orgId, documentId));
  }

  @Post('documents/:documentId/void')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @RequirePermission('bookings', 'manage')
  async void(@Param('orgId') orgId: string, @Param('documentId') documentId: string) {
    return this.generated.toDto(await this.generated.voidDocument(orgId, documentId));
  }

  @Get('documents/:documentId/download')
  @RequirePermission('bookings', 'read')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('orgId') orgId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const dl = await this.generated.getDownload(orgId, documentId);
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': buildContentDispositionInline(dl.fileName),
    });
    return new StreamableFile(dl.stream);
  }
}
