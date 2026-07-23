import {
  Controller,
  Get,
  Header,
  Headers,
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
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { BookingAccessService } from '@modules/bookings/booking-access.service';
import { BookingIdempotencyService } from '@modules/bookings/idempotency/booking-idempotency.service';
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
    private readonly bookingAccess: BookingAccessService,
    private readonly bookingIdempotency: BookingIdempotencyService,
  ) {}

  @Get('bookings/:bookingId/rental-contract')
  @RequirePermission('bookings-documents', 'read')
  async getRentalContract(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.rentalContract.getByBooking(orgId, bookingId);
  }

  @Get('bookings/:bookingId/rental-contract/download')
  @RequirePermission('bookings-documents', 'read')
  @Header('Cache-Control', 'no-store')
  async downloadRentalContract(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
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
  @RequirePermission('bookings-documents', 'read')
  async getBookingDocuments(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.bundle.getBundleView(orgId, bookingId);
  }

  @Post('bookings/:bookingId/documents/generate-initial-bundle')
  @RequirePermission('bookings-documents', 'write')
  async generateInitialBundle(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const key = this.bookingIdempotency.requireKey(idempotencyKey, 'BOOKING_DOCUMENT_GENERATE');

    const executed = await this.bookingIdempotency.execute({
      organizationId: orgId,
      actorUserId: userId ?? null,
      operation: 'BOOKING_DOCUMENT_GENERATE',
      idempotencyKey: key,
      resourceId: bookingId,
      fingerprintPayload: { bookingId, mode: 'async' },
      handler: async () => {
        const enqueued = await this.documentGeneration.enqueueInitialBundle(
          orgId,
          bookingId,
          userId ?? null,
        );
        if (enqueued.enqueued) {
          return { result: { queued: true, job: enqueued }, resultReference: enqueued.jobId ?? bookingId };
        }
        const sync = await this.bundle.generateInitialBundle(orgId, bookingId, userId ?? null);
        return { result: sync, resultReference: bookingId };
      },
    });

    return executed.result;
  }

  @Get('bookings/:bookingId/document-generation-jobs')
  @RequirePermission('bookings-documents', 'read')
  async listGenerationJobs(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const jobs = await this.documentGeneration.listForBooking(orgId, bookingId);
    return jobs.map(toBookingDocumentGenerationJobDto);
  }

  @Post('bookings/:bookingId/document-generation-jobs/:jobId/retry')
  @RequirePermission('bookings-documents', 'write')
  async retryGenerationJob(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('jobId') jobId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.documentGeneration.manualRetry(orgId, jobId, userId ?? null);
    return result;
  }

  @Post('bookings/:bookingId/documents/generate-initial-bundle-sync')
  @RequirePermission('bookings-documents', 'write')
  async generateInitialBundleSync(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const key = this.bookingIdempotency.requireKey(idempotencyKey, 'BOOKING_DOCUMENT_GENERATE');

    const executed = await this.bookingIdempotency.execute({
      organizationId: orgId,
      actorUserId: userId ?? null,
      operation: 'BOOKING_DOCUMENT_GENERATE',
      idempotencyKey: key,
      resourceId: bookingId,
      fingerprintPayload: { bookingId, mode: 'sync' },
      handler: async () => {
        const result = await this.bundle.generateInitialBundle(orgId, bookingId, userId ?? null);
        return { result, resultReference: bookingId };
      },
    });

    return executed.result;
  }

  @Post('bookings/:bookingId/documents/regenerate/:documentType')
  @RequirePermission('bookings-documents', 'write')
  async regenerate(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('documentType') documentType: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.bundle.regenerate(orgId, bookingId, documentType, userId ?? null);
  }

  @Get('documents/:documentId/metadata')
  @RequirePermission('bookings-documents', 'read')
  async metadata(@Param('orgId') orgId: string, @Param('documentId') documentId: string) {
    return this.generated.toDto(await this.generated.getById(orgId, documentId));
  }

  @Post('documents/:documentId/void')
  @RequirePermission('bookings-documents', 'manage')
  async void(@Param('orgId') orgId: string, @Param('documentId') documentId: string) {
    return this.generated.toDto(await this.generated.voidDocument(orgId, documentId));
  }

  @Get('documents/:documentId/download')
  @RequirePermission('bookings-documents', 'read')
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
