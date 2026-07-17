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
import { Roles } from '@shared/decorators/roles.decorator';
import {
  TwilioCredentialRegisterDto,
  TwilioPhoneNumberPurchaseDto,
  TwilioPhoneNumberSearchDto,
  TwilioProvisioningPreviewDto,
  TwilioSubaccountProvisionDto,
} from './dto/twilio-provisioning.dto';
import { TwilioTenantProvisioningService } from './twilio-tenant-provisioning.service';

@Controller('admin/voice-assistant/organizations/:orgId/twilio')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class TwilioTenantProvisioningController {
  constructor(private readonly provisioning: TwilioTenantProvisioningService) {}

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
    @Req() req: { user?: { id?: string } },
  ) {
    return this.provisioning.provisionSubaccount({
      organizationId: orgId,
      friendlyName: body.friendlyName,
      actor: {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      },
    });
  }

  @Post('credentials/register')
  async registerCredentials(
    @Param('orgId') orgId: string,
    @Body() body: TwilioCredentialRegisterDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.provisioning.registerRuntimeCredentials(orgId, {
      userId: req.user?.id,
      idempotencyKey: idempotencyKey ?? '',
      confirm: body.confirm,
      dryRun: body.dryRun,
    });
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
    @Req() req: { user?: { id?: string } },
  ) {
    return this.provisioning.purchasePhoneNumber({
      organizationId: orgId,
      phoneNumber: body.phoneNumber,
      actor: {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      },
    });
  }

  @Get('regulatory-status')
  async regulatoryStatus(@Param('orgId') orgId: string) {
    return this.provisioning.getRegulatoryStatus(orgId);
  }
}
