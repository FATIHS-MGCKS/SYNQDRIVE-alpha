import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CustomerVerificationService } from './customer-verification.service';
import { ListCustomerVerificationQueryDto } from './dto/list-customer-verification-query.dto';
import { ManualPickupCheckDto } from './dto/manual-pickup-check.dto';
import { StartDiditSessionDto } from './dto/start-didit-session.dto';
import { OperatorRateLimitService } from '@modules/operator-security/operator-rate-limit.service';
import { assertNoForbiddenOperatorBodyFields } from '@modules/operator-security/operator-client-field-guard.util';

type AuthedRequest = {
  user?: {
    id: string;
    organizationId?: string | null;
    platformRole?: string | null;
  };
};

@Controller('customer-verification')
@UseGuards(RolesGuard)
export class CustomerVerificationController {
  constructor(
    private readonly customerVerificationService: CustomerVerificationService,
    private readonly operatorRateLimit: OperatorRateLimitService,
  ) {}

  @Get('eligibility')
  getEligibility(
    @Req() req: AuthedRequest,
    @Query() query: ListCustomerVerificationQueryDto,
  ) {
    return this.customerVerificationService.getEligibilityForUser(
      req.user!,
      query.customerId,
      query.bookingId,
    );
  }

  @Get('checks')
  listChecks(
    @Req() req: AuthedRequest,
    @Query() query: ListCustomerVerificationQueryDto,
  ) {
    return this.customerVerificationService.listChecksForUser(
      req.user!,
      query.customerId,
      query.bookingId,
    );
  }

  @Post('didit/session')
  startDiditSession(
    @Req() req: AuthedRequest,
    @Body() body: StartDiditSessionDto,
  ) {
    return this.customerVerificationService.startDiditSession(req.user!, body);
  }

  @Post('manual-pickup-check')
  async createManualPickupCheck(
    @Req() req: AuthedRequest,
    @Body() body: ManualPickupCheckDto,
  ) {
    assertNoForbiddenOperatorBodyFields(body);
    const orgId = req.user?.organizationId;
    if (orgId) {
      await this.operatorRateLimit.assertAllowed({
        organizationId: orgId,
        userId: req.user?.id,
        action: 'verification',
      });
    }
    return this.customerVerificationService.createManualPickupCheck(
      req.user!,
      body,
    );
  }
}
