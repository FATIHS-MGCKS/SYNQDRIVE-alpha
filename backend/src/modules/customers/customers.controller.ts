import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { CustomersService } from './customers.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PaginationParams } from '@shared/utils/pagination';
import { StorageService } from '@shared/storage/storage.service';
import { Prisma } from '@prisma/client';

const CUSTOMER_DOCS_DIR = join(process.cwd(), 'uploads', 'customer-documents');
if (!existsSync(CUSTOMER_DOCS_DIR))
  mkdirSync(CUSTOMER_DOCS_DIR, { recursive: true });

// Slot keys the UI uploads to during customer registration.
// Kept here (and not as a DB enum) because we only need them to namespace
// filenames — the actual column the URL ends up in lives on the Customer row.
const CUSTOMER_DOCUMENT_TYPES = new Set([
  'id-front',
  'id-back',
  'license-front',
  'license-back',
]);

@Controller('organizations/:orgId/customers')
@UseGuards(OrgScopingGuard, RolesGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly storage: StorageService,
  ) {}

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.customersService.getCustomerStats(orgId);
  }

  /**
   * Upload a single KYC document (front/back of Personalausweis / Führerschein).
   * Stored under /uploads/customer-documents/ so the URL survives across
   * multi-step registration (the customer row doesn't exist yet).
   *
   * The UI is expected to include the returned URL in the Customer create/patch
   * payload (idFrontUrl, idBackUrl, licenseFrontUrl, licenseBackUrl).
   */
  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, CUSTOMER_DOCS_DIR),
        filename: (req, file, cb) => {
          const orgId = (req.params as { orgId?: string })?.orgId ?? 'unknown';
          const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
          cb(null, `${safeOrg}-${unique}${extname(file.originalname)}`);
        },
      }),
      // 8 MB — ID / license photos are larger than a 128x128 org logo.
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype.startsWith('image/') ||
          file.mimetype === 'application/pdf';
        if (!ok) {
          cb(
            new BadRequestException(
              'Only image or PDF files are allowed for customer documents',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadCustomerDocument(
    @Param('orgId') orgId: string,
    @Body() body: { documentType?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const type = (body?.documentType ?? '').toLowerCase();
    if (type && !CUSTOMER_DOCUMENT_TYPES.has(type)) {
      throw new BadRequestException(
        `Invalid documentType. Expected one of: ${Array.from(CUSTOMER_DOCUMENT_TYPES).join(', ')}`,
      );
    }
    const url = await this.storage.finalizeUpload('customer-documents', file, orgId);
    return { url, documentType: type || null };
  }

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams,
  ) {
    return this.customersService.findAll(orgId, query);
  }

  @Get(':id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.customersService.findById(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: Omit<Prisma.CustomerCreateInput, 'organization'>,
  ) {
    return this.customersService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Prisma.CustomerUpdateInput,
  ) {
    return this.customersService.update(orgId, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.customersService.softDelete(orgId, id);
  }
}
