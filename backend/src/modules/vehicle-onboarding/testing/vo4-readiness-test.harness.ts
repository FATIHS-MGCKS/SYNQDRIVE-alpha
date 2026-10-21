import type { PrismaClient } from '@prisma/client';
import { createVehicleOnboardingTestHarness } from './vehicle-onboarding-test.harness';
import { ProductionFailClosedReadinessAuthority } from '../readiness/vehicle-onboarding-readiness-authority';
import { VehicleOnboardingReadinessService } from '../services/vehicle-onboarding-readiness.service';

export function createVo4ReadinessTestHarness(prisma: PrismaClient) {
  const readinessService = new VehicleOnboardingReadinessService(prisma as any);
  const productionReadiness = new ProductionFailClosedReadinessAuthority(readinessService);
  const harness = createVehicleOnboardingTestHarness(prisma, productionReadiness);
  return { ...harness, readinessService, productionReadiness };
}
