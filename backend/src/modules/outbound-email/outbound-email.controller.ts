import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CreateOrgEmailDomainDto } from './dto/create-org-email-domain.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { UpdateOrgEmailSettingsDto } from './dto/update-org-email-settings.dto';
import { OrgEmailDomainService } from './services/org-email-domain.service';
import { OrgEmailSettingsService } from './services/org-email-settings.service';
import { OutboundEmailService } from './services/outbound-email.service';

interface AuthedRequest {
  user?: {
    id?: string;
    platformRole?: string;
    membershipRole?: string;
  };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard)
export class OutboundEmailController {
  constructor(
    private readonly settingsService: OrgEmailSettingsService,
    private readonly domainService: OrgEmailDomainService,
    private readonly outboundEmailService: OutboundEmailService,
    private readonly audit: AuditService,
  ) {}

  @Get('email-settings')
  async getSettings(@Param('orgId') orgId: string) {
    return this.settingsService.get(orgId);
  }

  @Put('email-settings')
  async updateSettings(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateOrgEmailSettingsDto,
  ) {
    this.assertCanManageEmail(req);
    const ctx = AuditService.contextFromRequest(req);
    const updated = await this.settingsService.update(orgId, dto);
    void this.audit.record({
      actorUserId: ctx.actorUserId,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ORGANIZATION,
      entityId: orgId,
      description: 'Organization email settings updated',
      route: 'PUT /organizations/:orgId/email-settings',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metaJson: { mode: updated.mode },
    });
    return updated;
  }

  @Get('email-domains')
  async listDomains(@Param('orgId') orgId: string) {
    return this.domainService.list(orgId);
  }

  @Post('email-domains')
  async createDomain(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() dto: CreateOrgEmailDomainDto,
  ) {
    this.assertCanManageEmail(req);
    const ctx = AuditService.contextFromRequest(req);
    return this.domainService.create(orgId, dto, {
      actorUserId: ctx.actorUserId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      route: 'POST /organizations/:orgId/email-domains',
    });
  }

  @Post('email-domains/:domainId/check')
  async checkDomain(
    @Param('orgId') orgId: string,
    @Param('domainId') domainId: string,
    @Req() req: AuthedRequest,
  ) {
    this.assertCanManageEmail(req);
    const ctx = AuditService.contextFromRequest(req);
    return this.domainService.check(orgId, domainId, {
      actorUserId: ctx.actorUserId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      route: 'POST /organizations/:orgId/email-domains/:domainId/check',
    });
  }

  @Post('email-settings/test-email')
  async sendTestEmail(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() dto: SendTestEmailDto,
  ) {
    this.assertCanManageEmail(req);
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('Authentication required');

    return this.outboundEmailService.sendExplicit({
      organizationId: orgId,
      sentByUserId: userId,
      to: dto.to,
      subject: dto.subject ?? 'SynqDrive — Test-E-Mail',
      bodyText:
        dto.bodyText ??
        'Dies ist eine Test-E-Mail aus den SynqDrive E-Mail-Einstellungen.',
    });
  }

  private assertCanManageEmail(req: AuthedRequest): void {
    const user = req.user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.platformRole === 'MASTER_ADMIN') return;
    if (user.membershipRole === 'ORG_ADMIN') return;
    throw new ForbiddenException(
      'Only organization admins can manage email settings and domains',
    );
  }
}
