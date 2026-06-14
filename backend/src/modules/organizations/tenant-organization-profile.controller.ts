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
import { OrganizationsService } from './organizations.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { StorageService } from '@shared/storage/storage.service';

const LOGO_UPLOAD_DIR = join(process.cwd(), 'uploads', 'org-logos');
if (!existsSync(LOGO_UPLOAD_DIR)) mkdirSync(LOGO_UPLOAD_DIR, { recursive: true });

interface AuthedRequest {
  user?: {
    id?: string;
    platformRole?: string;
    organizationId?: string;
    membershipRole?: string;
  };
}

/**
 * Tenant-scoped endpoints for the *own* organization profile.
 *
 * Distinct from `OrganizationsController` (admin/organizations — MASTER_ADMIN only):
 * this controller lives at `/organizations/:orgId/profile` and is guarded by
 * `OrgScopingGuard` so tenant users can read/write their own org's profile
 * (company info + logo) without needing platform-admin access.
 *
 * Write access is further restricted to ORG_ADMIN (or MASTER_ADMIN for
 * support/impersonation) — other roles can still GET for display.
 */
@Controller('organizations/:orgId/profile')
@UseGuards(OrgScopingGuard, RolesGuard)
export class TenantOrganizationProfileController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async getProfile(@Param('orgId') orgId: string) {
    return this.organizationsService.getTenantProfile(orgId);
  }

  @Patch()
  async updateProfile(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body()
    body: {
      companyName?: string;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      country?: string | null;
      taxId?: string | null;
      phone?: string | null;
      email?: string | null;
      website?: string | null;
      timezone?: string | null;
      language?: string | null;
      managerName?: string | null;
      managerEmail?: string | null;
      logoUrl?: string | null;
    },
  ) {
    this.assertCanWriteOrgProfile(req);
    return this.organizationsService.updateTenantProfile(orgId, body);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, LOGO_UPLOAD_DIR),
        filename: (req, file, cb) => {
          const orgId = (req.params as { orgId?: string })?.orgId ?? 'unknown';
          const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
          cb(null, `${safeOrg}-${unique}${extname(file.originalname)}`);
        },
      }),
      // 2 MB — mirrors the client-side limit shown in the Company Profile tab.
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Only image files are allowed'), false);
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

    // Capture the previous logo so we can delete it after the swap — otherwise
    // every re-upload orphans a file on disk forever.
    const previous = await this.organizationsService
      .getTenantProfile(orgId)
      .catch(() => null);
    const oldLogoUrl = previous?.logoUrl ?? null;

    const url = await this.storage.finalizeUpload('org-logos', file, orgId);
    await this.organizationsService.updateTenantProfile(orgId, { logoUrl: url });

    // Remove the previous logo (across whichever driver stored it) so re-uploads
    // don't orphan files on disk / in the bucket.
    if (oldLogoUrl && oldLogoUrl !== url) {
      await this.storage.removeByPublicUrl(oldLogoUrl);
    }
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
