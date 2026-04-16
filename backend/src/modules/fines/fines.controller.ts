import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { FinesService } from './fines.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'fines');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller()
export class FinesController {
  constructor(private readonly finesService: FinesService) {}

  @Get('organizations/:orgId/fines')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findAll(@Param('orgId') orgId: string) {
    return this.finesService.findByOrg(orgId);
  }

  @Get('organizations/:orgId/fines/stats')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async getStats(@Param('orgId') orgId: string) {
    return this.finesService.getStats(orgId);
  }

  @Get('organizations/:orgId/fines/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findOne(@Param('id') id: string) {
    return this.finesService.findById(id);
  }

  @Get('organizations/:orgId/customers/:customerId/fines')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findByCustomer(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.finesService.findByCustomer(orgId, customerId);
  }

  @Post('organizations/:orgId/fines')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async create(
    @Param('orgId') orgId: string,
    @Body() body: {
      fineNumber?: string;
      title: string;
      description?: string;
      offenseType?: string;
      issuingAuthority?: string;
      offenseDate?: string;
      receivedDate?: string;
      location?: string;
      amountCents: number;
      currency?: string;
      dueDate?: string;
      vehicleId?: string;
      imageUrl?: string;
      extractedData?: Record<string, unknown>;
      notes?: string;
    },
  ) {
    return this.finesService.create(orgId, body);
  }

  @Patch('organizations/:orgId/fines/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async update(
    @Param('id') id: string,
    @Body() body: {
      fineNumber?: string;
      title?: string;
      description?: string;
      offenseType?: string;
      issuingAuthority?: string;
      location?: string;
      amountCents?: number;
      dueDate?: string;
      status?: string;
      vehicleId?: string;
      bookingId?: string;
      customerId?: string;
      notes?: string;
    },
  ) {
    return this.finesService.update(id, body);
  }

  @Post('organizations/:orgId/fines/upload')
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
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { url: `/uploads/fines/${file.filename}` };
  }
}
