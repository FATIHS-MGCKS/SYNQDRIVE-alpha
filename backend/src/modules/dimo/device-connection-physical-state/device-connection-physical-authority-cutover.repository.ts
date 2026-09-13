import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionPhysicalAuthorityMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeConnectivityProvider } from './device-connection-physical-state.binding';

export type PhysicalAuthorityScope = {
  organizationId: string;
  vehicleId: string;
  provider: string;
};

@Injectable()
export class DeviceConnectionPhysicalAuthorityCutoverRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAuthorityRow(
    tx: Prisma.TransactionClient,
    scope: PhysicalAuthorityScope,
  ) {
    const provider = normalizeConnectivityProvider(scope.provider);
    await this.assertVehicleTenantScope(tx, scope.organizationId, scope.vehicleId);

    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO device_connection_physical_authority_cutover (
        id,
        organization_id,
        vehicle_id,
        provider,
        authority_mode,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        ${scope.organizationId},
        ${scope.vehicleId},
        ${provider},
        ${DeviceConnectionPhysicalAuthorityMode.LEGACY}::"DeviceConnectionPhysicalAuthorityMode",
        NOW(),
        NOW()
      )
      ON CONFLICT (organization_id, vehicle_id, provider) DO NOTHING
      RETURNING id
    `;

    if (inserted[0]) {
      return tx.deviceConnectionPhysicalAuthorityCutover.findUniqueOrThrow({
        where: { id: inserted[0].id },
      });
    }

    return tx.deviceConnectionPhysicalAuthorityCutover.findFirstOrThrow({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
      },
    });
  }

  async findAuthorityMode(
    tx: Prisma.TransactionClient,
    scope: PhysicalAuthorityScope,
  ): Promise<DeviceConnectionPhysicalAuthorityMode | null> {
    const provider = normalizeConnectivityProvider(scope.provider);
    const row = await tx.deviceConnectionPhysicalAuthorityCutover.findFirst({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
      },
      select: { authorityMode: true },
    });
    return row?.authorityMode ?? null;
  }

  private async assertVehicleTenantScope(
    tx: Prisma.TransactionClient,
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle || vehicle.organizationId !== organizationId) {
      throw new Error(
        `physical_authority_vehicle_tenant_mismatch vehicle=${vehicleId} org=${organizationId}`,
      );
    }
  }
}
