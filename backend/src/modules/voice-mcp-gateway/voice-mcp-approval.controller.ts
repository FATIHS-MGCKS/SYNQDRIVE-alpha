import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { VoiceMcpApprovalService } from './voice-mcp-approval.service';

class DecideVoiceMcpApprovalDto {
  reason?: string;
}

@Controller('organizations/:orgId/voice-assistant/mcp-approvals')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class VoiceMcpApprovalController {
  constructor(private readonly approvalService: VoiceMcpApprovalService) {}

  @Post(':approvalId/approve')
  @RequireCommunicationPermission('write', { voiceOperationalLegacy: true })
  approve(
    @Param('orgId') orgId: string,
    @Param('approvalId') approvalId: string,
    @Req() request: { user?: { id?: string } },
  ) {
    return this.approvalService.approve(orgId, approvalId, String(request.user?.id ?? ''));
  }

  @Post(':approvalId/reject')
  @RequireCommunicationPermission('write', { voiceOperationalLegacy: true })
  reject(
    @Param('orgId') orgId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: DecideVoiceMcpApprovalDto,
    @Req() request: { user?: { id?: string } },
  ) {
    return this.approvalService.reject(orgId, approvalId, String(request.user?.id ?? ''), body.reason);
  }
}
