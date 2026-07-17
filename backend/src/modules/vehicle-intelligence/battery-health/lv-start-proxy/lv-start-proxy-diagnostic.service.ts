import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import {
  resolveLvStartProxyDiagnostic,
  type LvStartProxyDiagnosticView,
} from './lv-start-proxy-diagnostic.resolver';

@Injectable()
export class LvStartProxyDiagnosticService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  async getForVehicle(
    vehicleId: string,
    now: Date = new Date(),
  ): Promise<LvStartProxyDiagnosticView> {
    return resolveLvStartProxyDiagnostic(
      this.prisma,
      this.policyProfiles,
      vehicleId,
      now,
    );
  }
}
