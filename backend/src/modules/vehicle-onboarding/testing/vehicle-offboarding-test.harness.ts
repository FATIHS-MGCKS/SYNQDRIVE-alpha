import type { PrismaClient } from '@prisma/client';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { VehicleOffboardingService } from '../services/vehicle-offboarding.service';

export function createVehicleOffboardingServiceForTests(
  prisma: PrismaClient,
): VehicleOffboardingService {
  return new VehicleOffboardingService(
    prisma as never,
    new BusinessAuditOutboxRepository(prisma as never),
  );
}
