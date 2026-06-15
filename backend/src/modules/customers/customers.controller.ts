import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerTimelineService } from './customer-timeline.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { StorageService } from '@shared/storage/storage.service';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import {
  AddCustomerNoteDto,
  ArchiveCustomerDto,
  CheckCustomerDuplicatesQueryDto,
  CreateCustomerDto,
  ListCustomersQueryDto,
  ReviewCustomerDocumentDto,
  UpdateCustomerDto,
  UpdateCustomerRiskDto,
  UpdateCustomerStatusDto,
  UploadCustomerDocumentDto,
} from './dto';
import { PaginationParams } from '@shared/utils/pagination';

const CUSTOMER_DOCS_DIR = join(process.cwd(), 'uploads', 'customer-documents');
if (!existsSync(CUSTOMER_DOCS_DIR))
  mkdirSync(CUSTOMER_DOCS_DIR, { recursive: true });

const CUSTOMER_DOCUMENT_TYPES = new Set([
  'id-front',
  'id-back',
  'license-front',
  'license-back',
]);

const customerDocUploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, CUSTOMER_DOCS_DIR),
    filename: (req, file, cb) => {
      const orgId = (req.params as { orgId?: string })?.orgId ?? 'unknown';
      const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
      cb(null, `${safeOrg}-${unique}${extname(file.originalname)}`);
    },
  }),
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
});

@Controller('organizations/:orgId/customers')
@UseGuards(OrgScopingGuard, RolesGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerDocumentsService: CustomerDocumentsService,
    private readonly customerTimelineService: CustomerTimelineService,
    private readonly storage: StorageService,
  ) {}

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.customersService.getCustomerStats(orgId);
  }

  @Get('duplicates')
  async checkDuplicates(
    @Param('orgId') orgId: string,
    @Query() query: CheckCustomerDuplicatesQueryDto,
  ) {
    const duplicates = await this.customersService.findPotentialDuplicates(
      orgId,
      query,
    );
    return {
      duplicates,
      hasHardMatch: duplicates.some((d) => d.matchType === 'hard'),
    };
  }

  /**
   * Legacy pre-registration upload — kept for backward compatibility during
   * multi-step customer create flows. New uploads should use
   * POST /:id/documents which creates CustomerDocument rows.
   */
  @Post('documents')
  @UseInterceptors(customerDocUploadInterceptor)
  async uploadCustomerDocumentLegacy(
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
    @Query() query: ListCustomersQueryDto,
  ) {
    return this.customersService.findAll(orgId, query);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: CreateCustomerDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.customersService.create(orgId, body, userId);
  }

  @Get(':id/eligibility')
  async getEligibility(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
  ) {
    return this.customersService.getEligibility(orgId, id, startDate);
  }

  @Get(':id/documents')
  async listDocuments(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.customerDocumentsService.listDocuments(orgId, id);
  }

  @Post(':id/documents')
  @UseInterceptors(customerDocUploadInterceptor)
  async uploadDocument(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UploadCustomerDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
    @CurrentUser('id') userId?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.customerDocumentsService.uploadDocument(
      orgId,
      id,
      file,
      body,
      userId,
    );
  }

  @Patch(':id/documents/:documentId/review')
  async reviewDocument(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() body: ReviewCustomerDocumentDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.customerDocumentsService.reviewDocument(
      orgId,
      id,
      documentId,
      body,
      userId,
    );
  }

  @Get(':id/timeline')
  async listTimeline(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: PaginationParams,
  ) {
    return this.customerTimelineService.listEvents(orgId, id, query);
  }

  @Post(':id/timeline/notes')
  async addNote(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: AddCustomerNoteDto,
    @CurrentUser('id') userId?: string,
  ) {
    await this.customersService.findById(orgId, id);
    return this.customerTimelineService.addEvent(
      orgId,
      id,
      'NOTE_ADDED',
      body.title?.trim() || 'Note added',
      { note: body.note },
      userId,
      body.note,
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateCustomerStatusDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.customersService.updateStatus(orgId, id, body, userId);
  }

  @Patch(':id/risk')
  async updateRisk(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateCustomerRiskDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.customersService.updateRisk(orgId, id, body, userId);
  }

  @Get(':id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    const customer = await this.customersService.findById(orgId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.customersService.update(orgId, id, body, userId);
  }

  @Delete(':id')
  async archive(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: ArchiveCustomerDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.customersService.archiveCustomer(orgId, id, body, userId);
  }
}
