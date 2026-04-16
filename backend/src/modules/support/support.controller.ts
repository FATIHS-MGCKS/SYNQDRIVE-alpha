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
import { Roles } from '@shared/decorators/roles.decorator';
import { PaginationParams } from '@shared/utils/pagination';
import { TicketStatus, TicketPriority } from '@prisma/client';
import {
  CreateSupportTicketDto,
  AdminCreateSupportTicketDto,
  UpdateSupportTicketDto,
  AddSupportMessageDto,
  UpdateTicketStatusDto,
} from '@shared/dto/support.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'support');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ─── Admin routes (Master Admin) ─────────────────

  @Get('admin/support/stats')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async getStats() {
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
  async findAll(
    @Query()
    query: PaginationParams & {
      status?: string;
      priority?: string;
      organizationId?: string;
    },
  ) {
    return this.supportService.findAll(query);
  }

  @Get('admin/support/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async findOne(@Param('id') id: string) {
    return this.supportService.findById(id);
  }

  @Post('admin/support/tickets')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminCreate(@Body() body: AdminCreateSupportTicketDto) {
    return this.supportService.create(body);
  }

  @Post('admin/support/tickets/:id/messages')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminAddMessage(
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; name?: string } },
    @Body() body: AddSupportMessageDto,
  ) {
    return this.supportService.addMessage(id, {
      senderId: req.user?.id,
      senderName: req.user?.name || 'Support Team',
      senderRole: 'admin',
      content: body.content,
      imageUrl: body.imageUrl,
    });
  }

  @Patch('admin/support/tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async update(@Param('id') id: string, @Body() body: UpdateSupportTicketDto) {
    return this.supportService.update(id, body as any);
  }

  @Patch('admin/support/tickets/:id/status')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async updateStatus(@Param('id') id: string, @Body() body: UpdateTicketStatusDto) {
    return this.supportService.updateStatus(id, body.status as any);
  }

  // ─── Org-scoped routes ───────────────────────────

  @Get('organizations/:orgId/support/tickets')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindAll(@Param('orgId') orgId: string) {
    return this.supportService.findByOrganization(orgId);
  }

  @Get('organizations/:orgId/support/tickets/:id')
  @UseGuards(RolesGuard)
  async orgFindOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.supportService.findByIdForOrganization(orgId, id);
  }

  @Post('organizations/:orgId/support/tickets')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgCreate(
    @Param('orgId') orgId: string,
    @Req() req: { user?: { id?: string; email?: string; name?: string } },
    @Body() body: CreateSupportTicketDto,
  ) {
    return this.supportService.create({
      organizationId: orgId,
      createdByUserId: req.user?.id,
      reporterEmail: req.user?.email || '',
      reporterName: req.user?.name || '',
      subject: body.subject,
      description: body.description,
      priority: body.priority,
      imageUrl: body.imageUrl,
    });
  }

  @Post('organizations/:orgId/support/tickets/:id/messages')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgAddMessage(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; name?: string } },
    @Body() body: AddSupportMessageDto,
  ) {
    return this.supportService.addMessageForOrganization(orgId, id, {
      senderId: req.user?.id,
      senderName: req.user?.name || 'User',
      senderRole: 'user',
      content: body.content,
      imageUrl: body.imageUrl,
    });
  }

  // ─── File upload ─────────────────────────────────

  @Post('support/upload')
  @UseGuards(RolesGuard)
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
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Only image files allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { url: `/uploads/support/${file.filename}` };
  }
}
