import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { StorageService } from '@shared/storage/storage.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { UpdateTenantOrganizationProfileDto } from './dto/update-tenant-organization-profile.dto';
import { isAllowedLogoUpload } from './utils/tenant-profile-normalizer.util';

const LOGO_UPLOAD_DIR = join(process.cwd(), 'uploads', 'org-logos');
if (!existsSync(LOGO_UPLOAD_DIR)) mkdirSync(LOGO_UPLOAD_DIR, { recursive: true });

interface AuthedRequest {
  user?: {
    id?: string;
    platformRole?: string;
    organizationId?: string;
    membershipRole?: string;
  };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Tenant-scoped endpoints for the *own* organization profile.
 *
 * Distinct from `OrganizationsController` (admin/organizations — MASTER_ADMIN only):
 * this controller lives at `/organizations/:orgId/profile` and is guarded by
 * `OrgScopingGuard` so tenant users can read/write their own org's profile
 * (company info + logo) without needing platform-admin access.
 *
 * Write access is restricted to ORG_ADMIN (or MASTER_ADMIN for support).
 */
@Controller('organizations/:orgId/profile')
@UseGuards(OrgScopingGuard, RolesGuard)
export class TenantOrganizationProfileController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async getProfile(@Param('orgId') orgId: string) {
    return this.organizationsService.getTenantProfile(orgId);
  }

  @Patch()
  async updateProfile(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() body: UpdateTenantOrganizationProfileDto,
  ) {
    this.assertCanWriteOrgProfile(req);
    const ctx = AuditService.contextFromRequest(req);
    return this.organizationsService.updateTenantProfile(orgId, body, {
      actorUserId: ctx.actorUserId,
      ip: ctx.ipAddress,
      userAgent: ctx.userAgent,
      route: 'PATCH /organizations/:orgId/profile',
    });
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, LOGO_UPLOAD_DIR),
        filename: (req, file, cb) => {
          const orgId = (req.params as { orgId?: string })?.orgId ?? 'unknown';
          const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
          const ext = extname(file.originalname).toLowerCase();
          const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${safeOrg}-${unique}${safeExt}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!isAllowedLogoUpload(file)) {
          cb(
            new BadRequestException(
              'Only PNG, JPG/JPEG, and WebP images are allowed (max 2 MB)',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.assertCanWriteOrgProfile(req);
    if (!file) throw new BadRequestException('No file uploaded');
    if (!isAllowedLogoUpload(file)) {
      throw new BadRequestException('Only PNG, JPG/JPEG, and WebP images are allowed');
    }

    const previous = await this.organizationsService
      .getTenantProfile(orgId)
      .catch(() => null);
    const oldLogoUrl = previous?.logoUrl ?? null;

    const url = await this.storage.finalizeUpload('org-logos', file, orgId);
    const ctx = AuditService.contextFromRequest(req);
    await this.organizationsService.updateTenantProfile(
      orgId,
      { logoUrl: url },
      {
        actorUserId: ctx.actorUserId,
        ip: ctx.ipAddress,
        userAgent: ctx.userAgent,
        route: 'POST /organizations/:orgId/profile/logo',
      },
    );

    if (oldLogoUrl && oldLogoUrl !== url) {
      await this.storage.removeByPublicUrl(oldLogoUrl);
    }

    void this.audit.record({
      actorUserId: ctx.actorUserId,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ORGANIZATION,
      entityId: orgId,
      description: 'Organization logo uploaded',
      route: 'POST /organizations/:orgId/profile/logo',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      level: 'INFO',
    });

    return { url };
  }

  private assertCanWriteOrgProfile(req: AuthedRequest): void {
    const user = req.user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.platformRole === 'MASTER_ADMIN') return;
    if (user.membershipRole === 'ORG_ADMIN') return;
    throw new ForbiddenException(
      'Only organization admins can edit the company profile',
    );
  }
}
