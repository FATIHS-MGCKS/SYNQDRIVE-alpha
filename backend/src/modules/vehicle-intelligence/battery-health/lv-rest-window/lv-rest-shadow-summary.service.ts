import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  resolveLvRestShadowSummary,
  type LvRestShadowSummary,
} from './lv-rest-shadow-summary.resolver';

@Injectable()
export class LvRestShadowSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummaryForVehicle(vehicleId: string): Promise<LvRestShadowSummary> {
    return resolveLvRestShadowSummary(this.prisma, vehicleId);
  }
}
