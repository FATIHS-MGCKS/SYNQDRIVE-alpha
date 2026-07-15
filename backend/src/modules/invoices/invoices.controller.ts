import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException, Header, Res, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { InvoicesService } from './invoices.service';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import {
  CreateInvoiceDto,
  InvoiceQueryDto,
  ListInvoicesQueryDto,
  RecordInvoicePaymentDto,
  UpdateInvoiceDto,
} from './dto';
import { InvoiceListReadService } from './invoice-list-read.service';
import { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoiceTimelineService } from './invoice-timeline.service';
import { InvoiceDocumentEmailService } from '@modules/outbound-email/invoice-document-email.service';
import { InvoiceAttachmentsService } from './invoice-attachments.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'invoices');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller()
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoiceListRead: InvoiceListReadService,
    private readonly invoiceDocuments: InvoiceDocumentsService,
    private readonly invoiceTimeline: InvoiceTimelineService,
    private readonly invoiceEmail: InvoiceDocumentEmailService,
    private readonly invoiceAttachments: InvoiceAttachmentsService,
  ) {}

  @Get('organizations/:orgId/invoices/list')
  @RequirePermission('invoices', 'read')
  async listItems(
    @Param('orgId') orgId: string,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoiceListRead.list(orgId, query);
  }

  @Get('organizations/:orgId/invoices')
  @RequirePermission('invoices', 'read')
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: InvoiceQueryDto,
    @Query('type') typeLegacy?: string,
    @Query('status') statusLegacy?: string,
  ) {
    return this.invoicesService.findByOrg(orgId, {
      type: query.type ?? typeLegacy,
      status: query.status ?? statusLegacy,
      direction: query.direction,
    });
  }

  @Get('organizations/:orgId/invoices/stats')
  @RequirePermission('invoices', 'read')
  async getStats(@Param('orgId') orgId: string) {
    return this.invoicesService.getStats(orgId);
  }

  @Get('organizations/:orgId/invoices/:id')
  @RequirePermission('invoices', 'read')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.findById(id, orgId);
  }

  @Get('organizations/:orgId/customers/:customerId/invoices')
  @RequirePermission('invoices', 'read')
  async findByCustomer(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.invoicesService.findByCustomer(orgId, customerId);
  }

  @Post('organizations/:orgId/invoices')
  @RequirePermission('invoices', 'write')
  async create(@Param('orgId') orgId: string, @Body() body: CreateInvoiceDto) {
    return this.invoicesService.create(orgId, body);
  }

  @Patch('organizations/:orgId/invoices/:id')
  @RequirePermission('invoices', 'write')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, body, orgId);
  }

  @Post('organizations/:orgId/invoices/:id/issue')
  @RequirePermission('invoices', 'write')
  async issue(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.issue(id, orgId);
  }

  @Post('organizations/:orgId/invoices/:id/cancel')
  @RequirePermission('invoices', 'write')
  async cancel(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.cancel(id, orgId);
  }

  /** @deprecated Prefer `POST …/documents/send-email` for PDF delivery; retained for external/manual send marking. */
  @Post('organizations/:orgId/invoices/:id/mark-sent')
  @RequirePermission('invoices', 'write')
  async markSent(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.markSent(id, orgId);
  }

  @Post('organizations/:orgId/invoices/:id/payments')
  @RequirePermission('invoices', 'write')
  async recordPayment(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RecordInvoicePaymentDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.invoicesService.recordPayment(id, orgId, body, userId);
  }

  /** @deprecated Prefer `POST …/payments` with explicit amount/method; shortcut for full bank-transfer settlement. */
  @Patch('organizations/:orgId/invoices/:id/pay')
  @RequirePermission('invoices', 'write')
  async markPaid(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.markPaid(id, orgId);
  }

  @Get('organizations/:orgId/invoices/:id/timeline')
  @RequirePermission('invoices', 'read')
  async getTimeline(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoiceTimeline.getTimeline(orgId, id);
  }

  @Get('organizations/:orgId/invoices/:id/documents')
  @RequirePermission('invoices', 'read')
  async getDocumentsPanel(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('membershipRole') membershipRole?: string,
  ) {
    const isAdmin = membershipRole === 'ORG_ADMIN' || membershipRole === 'MASTER_ADMIN';
    return this.invoiceDocuments.getPanel(orgId, id, { isAdmin });
  }

  @Post('organizations/:orgId/invoices/:id/documents/generate')
  @RequirePermission('invoices', 'write')
  async generateDocument(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Query('regenerate') regenerate?: string,
  ) {
    return this.invoiceDocuments.generate(orgId, id, userId ?? null, {
      regenerate: regenerate === 'true' || regenerate === '1',
    });
  }

  @Post('organizations/:orgId/invoices/:id/documents/send-email')
  @RequirePermission('invoices', 'write')
  async sendInvoiceEmail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SendInvoiceEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.invoiceEmail.sendInvoiceEmail(orgId, id, userId ?? null, body);
  }

  @Post('organizations/:orgId/invoices/:id/documents/delivery/:emailId/retry')
  @RequirePermission('invoices', 'write')
  async retryInvoiceEmail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.invoiceEmail.retryInvoiceEmail(orgId, id, emailId, userId ?? null);
  }

  @Get('organizations/:orgId/invoices/:id/attachment')
  @RequirePermission('invoices', 'read')
  @Header('Cache-Control', 'no-store')
  async downloadAttachment(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const invoice = await this.invoicesService.findById(id, orgId);
    const imageUrl = invoice.imageUrl as string | null;
    if (!imageUrl) {
      throw new BadRequestException('Kein Anhang vorhanden');
    }
    if (!this.invoiceAttachments.hasDownloadableAttachment(imageUrl)) {
      throw new BadRequestException('Anhang ist nicht über einen sicheren Download erreichbar');
    }
    const dl = await this.invoiceAttachments.getDownload(imageUrl, String(invoice.title ?? 'attachment'));
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(dl.fileName)}"`,
    });
    return new StreamableFile(dl.stream);
  }

  /** Legacy attachment upload only — NOT for AI extraction. Use document-extraction upload. */
  @Post('organizations/:orgId/invoices/upload')
  @RequirePermission('invoices', 'write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
          cb(null, unique + extname(file.originalname));
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only image or PDF files allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadAttachment(
    @Param('orgId') orgId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.invoiceAttachments.storeUpload(orgId, file);
    return { url, purpose: 'attachment_only' };
  }
}
