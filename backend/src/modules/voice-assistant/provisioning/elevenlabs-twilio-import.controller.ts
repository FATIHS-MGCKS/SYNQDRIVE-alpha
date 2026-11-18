import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  ElevenLabsTwilioDeactivateDto,
  ElevenLabsTwilioImportAndAssignDto,
  ElevenLabsTwilioImportReadinessDto,
} from './dto/elevenlabs-twilio-import.dto';
import { ElevenLabsTwilioImportProvisioningService } from './elevenlabs-twilio-import-provisioning.service';
import {
  deriveVoiceProvisioningJobOutcome,
  MasterVoiceProvisioningAdminAuditService,
  type VoiceProvisioningAuditRequest,
} from '@modules/activity-log/master-voice-provisioning-admin-audit.service';

type AuthedRequest = VoiceProvisioningAuditRequest & { user?: { id?: string } };

@Controller('admin/voice-assistant/organizations/:orgId/elevenlabs')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
@Roles('MASTER_ADMIN')
export class ElevenLabsTwilioImportController {
  constructor(
    private readonly provisioning: ElevenLabsTwilioImportProvisioningService,
    private readonly voiceAudit: MasterVoiceProvisioningAdminAuditService,
  ) {}

  @Get('phone-numbers/:phoneNumberId/import-readiness')
  async readiness(
    @Param('orgId') orgId: string,
    @Param('phoneNumberId') phoneNumberId: string,
    @Query() query: ElevenLabsTwilioImportReadinessDto,
  ) {
    return this.provisioning.evaluateReadiness(orgId, phoneNumberId, query.deploymentId);
  }

  @Post('phone-numbers/:phoneNumberId/import-and-assign')
  async importAndAssign(
    @Param('orgId') orgId: string,
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() body: ElevenLabsTwilioImportAndAssignDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.provisioning.importAndAssign({
      organizationId: orgId,
      phoneNumberId,
      deploymentId: body.deploymentId,
      actor: {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      },
    });
    this.voiceAudit.recordProvisioningMutation({
      req,
      domain: 'ELEVENLABS',
      operation: 'IMPORT_AND_ASSIGN',
      targetOrganizationId: orgId,
      entityId: phoneNumberId,
      outcome: deriveVoiceProvisioningJobOutcome(result),
      extraMetadata: {
        jobStatus: result.job?.status ?? null,
        importStatus: result.importStatus ?? null,
        deploymentId: result.deploymentId ?? null,
        dryRun: result.dryRun ?? false,
      },
    });
    return result;
  }

  @Post('phone-numbers/:phoneNumberId/deactivate')
  async deactivate(
    @Param('orgId') orgId: string,
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() body: ElevenLabsTwilioDeactivateDto,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.provisioning.deactivateAssignment(orgId, phoneNumberId, {
      userId: req.user?.id,
      confirm: body.confirm,
    });
    this.voiceAudit.recordProvisioningMutation({
      req,
      domain: 'ELEVENLABS',
      operation: 'DEACTIVATE_ASSIGNMENT',
      targetOrganizationId: orgId,
      entityId: phoneNumberId,
      outcome: deriveVoiceProvisioningJobOutcome(result),
      extraMetadata: {
        importStatus: result.importStatus ?? null,
        deactivated: result.deactivated,
      },
    });
    return result;
  }
}