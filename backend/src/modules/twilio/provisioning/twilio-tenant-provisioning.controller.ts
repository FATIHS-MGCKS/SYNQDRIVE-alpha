import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  TwilioCredentialRegisterDto,
  TwilioPhoneNumberPurchaseDto,
  TwilioPhoneNumberSearchDto,
  TwilioProvisioningPreviewDto,
  TwilioSubaccountProvisionDto,
} from './dto/twilio-provisioning.dto';
import { TwilioTenantProvisioningService } from './twilio-tenant-provisioning.service';
import type { TwilioCredentialRegistrationResult } from './twilio-provisioning.types';
import {
  deriveVoiceProvisioningJobOutcome,
  MasterVoiceProvisioningAdminAuditService,
  type VoiceProvisioningAuditRequest,
} from '@modules/activity-log/master-voice-provisioning-admin-audit.service';

type AuthedRequest = VoiceProvisioningAuditRequest & { user?: { id?: string } };

@Controller('admin/voice-assistant/organizations/:orgId/twilio')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
@Roles('MASTER_ADMIN')
export class TwilioTenantProvisioningController {
  constructor(
    private readonly provisioning: TwilioTenantProvisioningService,
    private readonly voiceAudit: MasterVoiceProvisioningAdminAuditService,
  ) {}

  @Post('provisioning/preview')
  async preview(
    @Param('orgId') orgId: string,
    @Body() body: TwilioProvisioningPreviewDto,
  ) {
    return this.provisioning.previewProvisioning(orgId, {
      numberType: body.numberType,
    });
  }

  @Post('subaccount/provision')
  async provisionSubaccount(
    @Param('orgId') orgId: string,
    @Body() body: TwilioSubaccountProvisionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.provisioning.provisionSubaccount({
      organizationId: orgId,
      friendlyName: body.friendlyName,
      actor: {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      },
    });
    this.voiceAudit.recordProvisioningMutation({
      req,
      domain: 'TWILIO',
      operation: 'SUBACCOUNT_PROVISION',
      targetOrganizationId: orgId,
      entityId: result.job?.id ?? orgId,
      outcome: deriveVoiceProvisioningJobOutcome(result),
      extraMetadata: {
        jobStatus: result.job?.status ?? null,
        dryRun: result.dryRun ?? false,
        mutating: result.mutating ?? null,
      },
    });
    return result;
  }

  @Post('credentials/register')
  async registerCredentials(
    @Param('orgId') orgId: string,
    @Body() body: TwilioCredentialRegisterDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result: TwilioCredentialRegistrationResult =
      await this.provisioning.registerRuntimeCredentials(orgId, {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      });
    this.voiceAudit.recordProvisioningMutation({
      req,
      domain: 'TWILIO',
      operation: 'CREDENTIALS_REGISTER',
      targetOrganizationId: orgId,
      entityId: orgId,
      outcome: deriveVoiceProvisioningJobOutcome(result),
      extraMetadata: {
        dryRun: result.dryRun ?? false,
        mutating: result.mutating ?? null,
        rotationPrepared: result.rotationPrepared ?? null,
        secretRefRegistered: result.secretRef != null,
      },
    });
    return result;
  }

  @Post('phone-numbers/search')
  async searchPhoneNumbers(
    @Param('orgId') orgId: string,
    @Body() body: TwilioPhoneNumberSearchDto,
  ) {
    return this.provisioning.searchPhoneNumbers({
      organizationId: orgId,
      numberType: body.numberType,
      areaCode: body.areaCode,
      contains: body.contains,
      limit: body.limit,
    });
  }

  @Post('phone-numbers/purchase')
  async purchasePhoneNumber(
    @Param('orgId') orgId: string,
    @Body() body: TwilioPhoneNumberPurchaseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.provisioning.purchasePhoneNumber({
      organizationId: orgId,
      phoneNumber: body.phoneNumber,
      actor: {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      },
    });
    this.voiceAudit.recordProvisioningMutation({
      req,
      domain: 'TWILIO',
      operation: 'PHONE_NUMBER_PURCHASE',
      targetOrganizationId: orgId,
      entityId: result.job?.id ?? result.phoneNumberId ?? orgId,
      outcome: deriveVoiceProvisioningJobOutcome(result),
      extraMetadata: {
        jobStatus: result.job?.status ?? null,
        phoneNumberId: result.phoneNumberId ?? null,
        dryRun: result.dryRun ?? false,
      },
    });
    return result;
  }

  @Get('regulatory-status')
  async regulatoryStatus(@Param('orgId') orgId: string) {
    return this.provisioning.getRegulatoryStatus(orgId);
  }
}