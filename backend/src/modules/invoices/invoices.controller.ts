import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { InvoicesService } from './invoices.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { StorageService } from '@shared/storage/storage.service';
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

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'invoices');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller()
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoiceListRead: InvoiceListReadService,
    private readonly storage: StorageService,
    private readonly invoiceDocuments: InvoiceDocumentsService,
    private readonly invoiceTimeline: InvoiceTimelineService,
    private readonly invoiceEmail: InvoiceDocumentEmailService,
  ) {}

  @Get('organizations/:orgId/invoices/list')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async listItems(
    @Param('orgId') orgId: string,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoiceListRead.list(orgId, query);
  }

  @Get('organizations/:orgId/invoices')
  @UseGuards(OrgScopingGuard, RolesGuard)
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
  @UseGuards(OrgScopingGuard, RolesGuard)
  async getStats(@Param('orgId') orgId: string) {
    return this.invoicesService.getStats(orgId);
  }

  @Get('organizations/:orgId/invoices/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.findById(id, orgId);
  }

  @Get('organizations/:orgId/customers/:customerId/invoices')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findByCustomer(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.invoicesService.findByCustomer(orgId, customerId);
  }

  @Post('organizations/:orgId/invoices')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async create(@Param('orgId') orgId: string, @Body() body: CreateInvoiceDto) {
    return this.invoicesService.create(orgId, body);
  }

  @Patch('organizations/:orgId/invoices/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, body, orgId);
  }

  @Post('organizations/:orgId/invoices/:id/issue')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async issue(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.issue(id, orgId);
  }

  /** @deprecated Prefer `POST …/documents/send-email` for PDF delivery; retained for external/manual send marking. */
  @Post('organizations/:orgId/invoices/:id/mark-sent')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async markSent(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.markSent(id, orgId);
  }

  @Post('organizations/:orgId/invoices/:id/payments')
  @UseGuards(OrgScopingGuard, RolesGuard)
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
  @UseGuards(OrgScopingGuard, RolesGuard)
  async markPaid(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.markPaid(id, orgId);
  }

  @Get('organizations/:orgId/invoices/:id/timeline')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async getTimeline(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoiceTimeline.getTimeline(orgId, id);
  }

  @Get('organizations/:orgId/invoices/:id/documents')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async getDocumentsPanel(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('membershipRole') membershipRole?: string,
  ) {
    const isAdmin = membershipRole === 'ORG_ADMIN' || membershipRole === 'MASTER_ADMIN';
    return this.invoiceDocuments.getPanel(orgId, id, { isAdmin });
  }

  @Post('organizations/:orgId/invoices/:id/documents/generate')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
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
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async sendInvoiceEmail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SendInvoiceEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.invoiceEmail.sendInvoiceEmail(orgId, id, userId ?? null, body);
  }

  @Post('organizations/:orgId/invoices/:id/documents/delivery/:emailId/retry')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async retryInvoiceEmail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('emailId') emailId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.invoiceEmail.retryInvoiceEmail(orgId, id, emailId, userId ?? null);
  }

  /** Legacy attachment upload only — NOT for AI extraction. Use document-extraction upload. */
  @Post('organizations/:orgId/invoices/upload')
  @UseGuards(OrgScopingGuard, RolesGuard)
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
    const url = await this.storage.finalizeUpload('invoices', file, orgId);
    return { url, purpose: 'attachment_only' };
  }
}
