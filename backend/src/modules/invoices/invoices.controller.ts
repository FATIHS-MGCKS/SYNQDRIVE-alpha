import {
  Controller, Get, Post, Patch, Body, Param, Query, Req,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { InvoicesService } from './invoices.service';
import { InvoiceDetailReadService } from './invoice-detail-read.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { StorageService } from '@shared/storage/storage.service';
import { InvoiceDocumentEmailService } from '@modules/outbound-email/invoice-document-email.service';
import { SendInvoiceEmailDto } from '@modules/outbound-email/dto/send-invoice-email.dto';
import {
  CreateInvoiceDto,
  InvoiceQueryDto,
  RecordInvoicePaymentDto,
  UpdateInvoiceDto,
} from './dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'invoices');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller()
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoiceDetail: InvoiceDetailReadService,
    private readonly invoiceEmail: InvoiceDocumentEmailService,
    private readonly storage: StorageService,
  ) {}

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

  @Get('organizations/:orgId/invoices/:id/detail')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findDetail(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoiceDetail.findDetail(orgId, id);
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
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: Request & { requestId?: string },
    @Body() body: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(orgId, body, {
      userId,
      correlationId: req.requestId ?? null,
    });
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
  ) {
    return this.invoicesService.recordPayment(id, orgId, body);
  }

  @Patch('organizations/:orgId/invoices/:id/pay')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async markPaid(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.markPaid(id, orgId);
  }

  @Post('organizations/:orgId/invoices/:invoiceId/send-email')
  @UseGuards(OrgScopingGuard, RolesGuard)
  @Roles('ORG_ADMIN', 'MASTER_ADMIN', 'SUB_ADMIN')
  async sendEmail(
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: Request & { requestId?: string },
    @Body() body: SendInvoiceEmailDto,
  ) {
    return this.invoiceEmail.sendInvoiceEmail(orgId, invoiceId, userId ?? null, {
      ...body,
      correlationId: req.requestId ?? undefined,
    });
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
