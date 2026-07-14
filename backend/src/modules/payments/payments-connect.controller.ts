import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import type { PermissionActor } from '@shared/auth/permission.util';
import { RequirePaymentPermission } from './decorators/require-payment-permission.decorator';
import { ConnectOnboardingLinkDto } from './dto/payments-connect.dto';
import {
  mapAccountToConnectStatusResponse,
  type ConnectOnboardingLinkResponse,
  type ConnectStatusResponse,
} from './dto/payments-connect.response';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { StripeConnectAccountService } from './stripe-connect-account.service';

interface AuthedRequest {
  user?: PermissionActor;
}

@Controller('organizations/:orgId/payments/connect')
@UseGuards(OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard)
export class PaymentsConnectController {
  constructor(private readonly stripeConnectAccountService: StripeConnectAccountService) {}

  @Post('account')
  @RequirePaymentPermission('payments.connect.manage')
  async createAccount(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
  ): Promise<ConnectStatusResponse> {
    const result = await this.stripeConnectAccountService.createConnectedAccount(
      orgId,
      req.user ?? {},
    );
    return mapAccountToConnectStatusResponse(result.account);
  }

  @Post('onboarding-link')
  @RequirePaymentPermission('payments.connect.manage')
  async createOnboardingLink(
    @Param('orgId') orgId: string,
    @Body() body: ConnectOnboardingLinkDto,
    @Req() req: AuthedRequest,
  ): Promise<ConnectOnboardingLinkResponse> {
    const session = await this.stripeConnectAccountService.createOnboardingSession(
      orgId,
      req.user ?? {},
      {
        returnUrl: body.returnUrl,
        refreshUrl: body.refreshUrl,
      },
    );

    return {
      url: session.url,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  @Get('status')
  @RequirePaymentPermission('payments.connect.read')
  async getStatus(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
  ): Promise<ConnectStatusResponse> {
    const result = await this.stripeConnectAccountService.getStoredConnectStatus(
      orgId,
      req.user ?? {},
    );
    return mapAccountToConnectStatusResponse(result.account);
  }

  @Post('refresh')
  @RequirePaymentPermission('payments.connect.manage')
  async refreshStatus(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
  ): Promise<ConnectStatusResponse> {
    const result = await this.stripeConnectAccountService.refreshConnectedAccount(
      orgId,
      req.user ?? {},
    );
    return mapAccountToConnectStatusResponse(result.account);
  }
}
