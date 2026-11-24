import { ConflictException, Logger } from '@nestjs/common';
import type { Prisma, Vehicle } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import type { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';

const logger = new Logger('VehicleRowIntegrationHarness');

/**
 * Test/E2E fixture only — not a registration channel.
 * Creates a bare Vehicle row; does not run DIMO/HM onboarding or registry activation.
 */
export async function createVehicleRowForIntegrationHarness(
  prisma: PrismaClient,
  organizationId: string,
  data: Omit<Prisma.VehicleCreateInput, 'organization'>,
  createdByUserId?: string,
  options?: {
    invokeLegacyBillingHook?: boolean;
    billingQuantity?: BillingQuantityVehicleIntegration;
  },
): Promise<Vehicle> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS !== '1') {
    throw new ConflictException({
      code: 'VEHICLE_ROW_INTEGRATION_HARNESS_FORBIDDEN',
      message: 'Integration vehicle row harness is not available in production runtime',
    });
  }

  let vehicle: Vehicle;
  try {
    vehicle = await prisma.vehicle.create({
      data: {
        ...data,
        organization: { connect: { id: organizationId } },
        createdByUserId: createdByUserId ?? null,
      },
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error, ['vin', 'organizationId'])) {
      throw new ConflictException({
        code: 'VEHICLE_VIN_ALREADY_EXISTS',
        message: 'A vehicle with this VIN already exists in the organization',
      });
    }
    throw error;
  }

  if (options?.invokeLegacyBillingHook !== false && options?.billingQuantity) {
    void options.billingQuantity
      .onVehicleProvisioned({
        organizationId,
        vehicleId: vehicle.id,
        actorUserId: createdByUserId ?? null,
      })
      .catch((error) => {
        logger.warn({
          msg: 'billing.quantity.vehicle_provision_hook_failed',
          organizationId,
          vehicleId: vehicle.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  return vehicle;
}