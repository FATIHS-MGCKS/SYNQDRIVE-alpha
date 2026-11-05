import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { OneAutoProviderService } from './oneauto-provider.service';

type AuthedRequest = {
  user?: { id?: string; platformRole?: string };
};

@Controller('admin/organizations/:orgId/oneauto')
@UseGuards(RolesGuard, OrgScopingGuard, MasterAdminMfaGuard)
@Roles('MASTER_ADMIN')
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class OneAutoProviderController {
  constructor(private readonly oneAuto: OneAutoProviderService) {}

  @Get('catalog')
  getCatalog() {
    return this.oneAuto.getCatalog();
  }

  @Get('services/:serviceSku/availability')
  getAvailability(@Param('serviceSku') serviceSku: string) {
    return this.oneAuto.getServiceAvailability(serviceSku);
  }

  @Post('vehicles/:vehicleId/quote')
  quote(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { serviceSku: string },
  ) {
    return this.oneAuto.quote(orgId, vehicleId, body.serviceSku);
  }

  @Post('vehicles/:vehicleId/execute')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ONEAUTO_PROVIDER_EXECUTE)
  execute(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      serviceSku: string;
      idempotencyKey: string;
      confirmedPriceMinor: number;
      pricingSourceVersion: string;
      quoteIssuedAt: string;
      acknowledgeIndicativeNotGuaranteed: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const masterAdminUserId = req.user?.id;
    if (!masterAdminUserId) {
      throw new UnauthorizedException('Authenticated master admin required');
    }
    return this.oneAuto.executeConfirmed({
      orgId,
      vehicleId,
      serviceSku: body.serviceSku,
      idempotencyKey: body.idempotencyKey,
      confirmedPriceMinor: body.confirmedPriceMinor,
      pricingSourceVersion: body.pricingSourceVersion,
      quoteIssuedAt: body.quoteIssuedAt,
      acknowledgeIndicativeNotGuaranteed: body.acknowledgeIndicativeNotGuaranteed === true,
      masterAdminUserId,
    });
  }

  @Get('attestation-canary/status')
  getAttestationCanaryStatus() {
    return this.oneAuto.getAttestationCanaryStatus();
  }

  @Post('vehicles/:vehicleId/attestation-canary/quote')
  quoteAttestationCanary(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.oneAuto.quoteAttestationCanary(orgId, vehicleId);
  }

  @Post('vehicles/:vehicleId/attestation-canary/arm')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ARM)
  armAttestationCanary(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      configuredPriceMinor: number;
      maxAuthorizedSpendMinor: number;
      pricingSourceVersion: string;
      ownerSpendAcknowledged: boolean;
      accountPricingAcknowledged: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const masterAdminUserId = req.user?.id;
    if (!masterAdminUserId) {
      throw new UnauthorizedException('Authenticated master admin required');
    }
    return this.oneAuto.armAttestationCanaryPermit({
      orgId,
      vehicleId,
      masterAdminUserId,
      configuredPriceMinor: body.configuredPriceMinor,
      maxAuthorizedSpendMinor: body.maxAuthorizedSpendMinor,
      pricingSourceVersion: body.pricingSourceVersion,
      ownerSpendAcknowledged: body.ownerSpendAcknowledged === true,
      accountPricingAcknowledged: body.accountPricingAcknowledged === true,
    });
  }

  @Post('vehicles/:vehicleId/attestation-canary/execute')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ONEAUTO_PROVIDER_EXECUTE)
  executeAttestationCanary(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      serviceSku: string;
      idempotencyKey: string;
      confirmedPriceMinor: number;
      pricingSourceVersion: string;
      quoteIssuedAt: string;
      acknowledgeIndicativeNotGuaranteed: boolean;
      ownerSpendAcknowledged: boolean;
    },
    @Req() req: AuthedRequest,
  ) {
    const masterAdminUserId = req.user?.id;
    if (!masterAdminUserId) {
      throw new UnauthorizedException('Authenticated master admin required');
    }
    return this.oneAuto.executeAttestationCanary({
      orgId,
      vehicleId,
      serviceSku: body.serviceSku,
      idempotencyKey: body.idempotencyKey,
      confirmedPriceMinor: body.confirmedPriceMinor,
      pricingSourceVersion: body.pricingSourceVersion,
      quoteIssuedAt: body.quoteIssuedAt,
      acknowledgeIndicativeNotGuaranteed: body.acknowledgeIndicativeNotGuaranteed === true,
      ownerSpendAcknowledged: body.ownerSpendAcknowledged === true,
      masterAdminUserId,
    });
  }

  @Get('jobs/:jobId')
  getJob(@Param('orgId') orgId: string, @Param('jobId') jobId: string) {
    return this.oneAuto.getJob(orgId, jobId);
  }

  @Get('jobs/:jobId/result')
  getResult(@Param('orgId') orgId: string, @Param('jobId') jobId: string) {
    return this.oneAuto.getJobResult(orgId, jobId);
  }
}
