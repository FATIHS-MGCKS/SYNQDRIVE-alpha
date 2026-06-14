import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { InvoicesService } from './invoices.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { StorageService } from '@shared/storage/storage.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'invoices');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller()
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly storage: StorageService,
  ) {}

  @Get('organizations/:orgId/invoices')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findAll(
    @Param('orgId') orgId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.invoicesService.findByOrg(orgId, { type, status });
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
  async create(
    @Param('orgId') orgId: string,
    @Body() body: {
      type: 'OUTGOING_BOOKING' | 'OUTGOING_MANUAL' | 'OUTGOING_FINAL' | 'INCOMING_VENDOR' | 'INCOMING_UPLOADED';
      customerId?: string;
      vendorId?: string;
      vendorName?: string;
      bookingId?: string;
      vehicleId?: string;
      title: string;
      description?: string;
      lineItems?: any;
      subtotalCents?: number;
      taxCents?: number;
      totalCents: number;
      currency?: string;
      invoiceDate?: string;
      dueDate?: string;
      status?: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
      templateId?: string;
      imageUrl?: string;
      extractedData?: Record<string, unknown>;
      notes?: string;
    },
  ) {
    return this.invoicesService.create(orgId, body);
  }

  @Patch('organizations/:orgId/invoices/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      description?: string;
      lineItems?: any;
      subtotalCents?: number;
      taxCents?: number;
      totalCents?: number;
      dueDate?: string;
      status?: string;
      vendorId?: string | null;
      vendorName?: string;
      customerId?: string;
      notes?: string;
      templateId?: string;
    },
  ) {
    return this.invoicesService.update(id, body, orgId);
  }

  @Patch('organizations/:orgId/invoices/:id/pay')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async markPaid(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.invoicesService.markPaid(id, orgId);
  }

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
  async uploadFile(
    @Param('orgId') orgId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.storage.finalizeUpload('invoices', file, orgId);
    return { url };
  }
}
