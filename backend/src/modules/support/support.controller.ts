import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { SupportService } from './support.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { StorageService } from '@shared/storage/storage.service';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  AdminCreateSupportTicketDto,
  CreateInternalNoteDto,
  CreateSupportMessageDto,
  CreateSupportTicketDto,
  QuerySupportTicketsDto,
  UpdateSupportTicketDto,
  UpdateTicketStatusDto,
} from '@shared/dto/support.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'support');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function isAllowedUploadMime(mime: string): boolean {
  if (mime.startsWith('image/')) return true;
  return ALLOWED_UPLOAD_MIME.has(mime);
}

interface AuthRequest {
  user?: { id?: string; email?: string; name?: string };
}

@Controller()
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly storage: StorageService,
  ) {}

  // ─── Master Admin routes (legacy /admin/support/*) ─────────────────

  @Get('admin/support/stats')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async getStats() {
    return this.supportService.getStats();
  }

  @Get('master/support/stats')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async getMasterStats() {
    return this.supportService.getStats();
  }

  @Get('admin/support/newest')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async getNewest(@Query('limit') limit?: string) {
    return this.supportService.getNewest(limit ? parseInt(limit, 10) : 5);
  }

  @Get('admin/support/open')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async getOpen(@Query('limit') limit?: string) {
    return this.supportService.getOpenTickets(limit ? parseInt(limit, 10) : 10);
  }

  @Get('admin/support/tickets')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async findAll(@Query() query: QuerySupportTicketsDto) {
    return this.supportService.findAll(query);
  }

  @Get('master/support/tickets')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async masterFindAll(@Query() query: QuerySupportTicketsDto) {
    return this.supportService.findAll(query);
  }

  @Get('admin/support/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async findOne(@Param('id') id: string) {
    return this.supportService.findById(id, { includeInternalMessages: true });
  }

  @Get('master/support/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async masterFindOne(@Param('id') id: string) {
    return this.supportService.findById(id, { includeInternalMessages: true });
  }

  @Post('admin/support/tickets')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminCreate(@Body() body: AdminCreateSupportTicketDto) {
    return this.supportService.create({
      organizationId: body.organizationId,
      reporterEmail: body.reporterEmail,
      reporterName: body.reporterName,
      subject: body.subject,
      description: body.description,
      category: body.category,
      priority: body.priority,
    });
  }

  @Post('admin/support/tickets/:id/messages')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminAddMessage(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CreateSupportMessageDto,
  ) {
    const parsed = this.supportService.parseMessageDto(body);
    return this.supportService.addAdminPublicMessage(id, {
      senderUserId: req.user?.id,
      senderName: req.user?.name || 'Support Team',
      ...parsed,
    });
  }

  @Post('master/support/tickets/:id/messages')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async masterAddMessage(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CreateSupportMessageDto,
  ) {
    const parsed = this.supportService.parseMessageDto(body);
    return this.supportService.addAdminPublicMessage(id, {
      senderUserId: req.user?.id,
      senderName: req.user?.name || 'Support Team',
      ...parsed,
    });
  }

  @Post('admin/support/tickets/:id/internal-notes')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminInternalNote(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CreateInternalNoteDto,
  ) {
    return this.supportService.addInternalNote(id, {
      senderUserId: req.user?.id,
      senderName: req.user?.name || 'Support Team',
      body: body.body.trim(),
    });
  }

  @Post('master/support/tickets/:id/internal-notes')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async masterInternalNote(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CreateInternalNoteDto,
  ) {
    return this.supportService.addInternalNote(id, {
      senderUserId: req.user?.id,
      senderName: req.user?.name || 'Support Team',
      body: body.body.trim(),
    });
  }

  @Patch('admin/support/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async update(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: UpdateSupportTicketDto,
  ) {
    return this.supportService.update(
      id,
      {
        status: body.status,
        priority: body.priority,
        category: body.category,
        assignedToUserId: body.assignedToUserId,
      },
      req.user?.name || 'Support Team',
    );
  }

  @Patch('master/support/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async masterUpdate(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: UpdateSupportTicketDto,
  ) {
    return this.update(id, req, body);
  }

  @Patch('admin/support/tickets/:id/status')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async updateStatus(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateStatus(id, body.status, req.user?.name || 'Support Team');
  }

  // ─── Org-scoped routes ───────────────────────────

  @Get('organizations/:orgId/support/unread-count')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgUnreadCount(@Param('orgId') orgId: string) {
    return this.supportService.getUnreadCountForOrganization(orgId);
  }

  @Get('organizations/:orgId/support/tickets')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindAll(@Param('orgId') orgId: string, @Query() query: QuerySupportTicketsDto) {
    const result = await this.supportService.findByOrganization(orgId, query);
    return query.page || query.limit ? result : result.data;
  }

  @Get('support/org/:orgId/tickets')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindAllAlias(@Param('orgId') orgId: string, @Query() query: QuerySupportTicketsDto) {
    return this.orgFindAll(orgId, query);
  }

  @Get('organizations/:orgId/support/tickets/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.supportService.findByIdForOrganization(orgId, id);
  }

  @Get('support/org/:orgId/tickets/:ticketId')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindOneAlias(
    @Param('orgId') orgId: string,
    @Param('ticketId') ticketId: string,
  ) {
    return this.orgFindOne(orgId, ticketId);
  }

  @Post('organizations/:orgId/support/tickets')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgCreate(
    @Param('orgId') orgId: string,
    @Req() req: AuthRequest,
    @Body() body: CreateSupportTicketDto,
  ) {
    const attachments = body.attachments?.length
      ? (body.attachments as unknown as import('@prisma/client').Prisma.InputJsonValue)
      : undefined;
    return this.supportService.create({
      organizationId: orgId,
      createdByUserId: req.user?.id,
      reporterEmail: req.user?.email || '',
      reporterName: req.user?.name || '',
      subject: body.subject,
      description: body.description,
      category: body.category,
      priority: body.priority,
      relatedEntityType: body.relatedEntityType,
      relatedEntityId: body.relatedEntityId,
      sourcePage: body.sourcePage,
      metadata: body.metadata as import('@prisma/client').Prisma.InputJsonValue | undefined,
      imageUrl: body.imageUrl,
      attachments,
    });
  }

  @Post('support/org/:orgId/tickets')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgCreateAlias(
    @Param('orgId') orgId: string,
    @Req() req: AuthRequest,
    @Body() body: CreateSupportTicketDto,
  ) {
    return this.orgCreate(orgId, req, body);
  }

  @Post('organizations/:orgId/support/tickets/:id/messages')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgAddMessage(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CreateSupportMessageDto,
  ) {
    const parsed = this.supportService.parseMessageDto(body);
    return this.supportService.addMessageForOrganization(orgId, id, {
      senderUserId: req.user?.id,
      senderName: req.user?.name || 'User',
      ...parsed,
    });
  }

  @Post('support/org/:orgId/tickets/:ticketId/messages')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgAddMessageAlias(
    @Param('orgId') orgId: string,
    @Param('ticketId') ticketId: string,
    @Req() req: AuthRequest,
    @Body() body: CreateSupportMessageDto,
  ) {
    return this.orgAddMessage(orgId, ticketId, req, body);
  }

  @Post('organizations/:orgId/support/tickets/:id/reopen')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgReopen(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.supportService.reopenForOrganization(
      orgId,
      id,
      req.user?.name || req.user?.email || 'User',
    );
  }

  @Post('support/org/:orgId/tickets/:ticketId/reopen')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgReopenAlias(
    @Param('orgId') orgId: string,
    @Param('ticketId') ticketId: string,
    @Req() req: AuthRequest,
  ) {
    return this.orgReopen(orgId, ticketId, req);
  }

  // ─── File upload ─────────────────────────────────

  @Post('support/upload')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
          cb(null, unique + extname(file.originalname));
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!isAllowedUploadMime(file.mimetype)) {
          cb(
            new BadRequestException(
              'Allowed uploads: images, PDF, TXT, CSV, JSON',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.storage.finalizeUpload('support', file);
    return { url };
  }

  @Post('organizations/:orgId/support/upload')
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
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!isAllowedUploadMime(file.mimetype)) {
          cb(
            new BadRequestException(
              'Allowed uploads: images, PDF, TXT, CSV, JSON',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadFileForOrg(
    @Param('orgId') orgId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = await this.storage.finalizeUpload('support', file, orgId);
    return { url };
  }
}
