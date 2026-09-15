import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionPhysicalAuthorityMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPhysicalStateAuthorityLockKey,
  normalizeConnectivityProvider,
} from './device-connection-physical-state.binding';
import { validateAuthorityTransition } from './physical-state-authority.state-machine';

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

  async readAuthorityModeWithoutMutation(
    scope: PhysicalAuthorityScope,
  ): Promise<DeviceConnectionPhysicalAuthorityMode> {
    const provider = normalizeConnectivityProvider(scope.provider);
    const row = await this.prisma.deviceConnectionPhysicalAuthorityCutover.findFirst({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
      },
      select: { authorityMode: true },
    });
    return row?.authorityMode ?? DeviceConnectionPhysicalAuthorityMode.LEGACY;
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

  /**
   * Transaction-scoped authority read for pre-cutover mutation guards.
   * Acquires an advisory lock on the vehicle/provider authority scope, then
   * locks any existing authority row with SELECT FOR UPDATE.
   * Missing row semantically means LEGACY. Does not insert or mutate authority.
   */
  async lockAuthorityScopeAndReadMode(
    tx: Prisma.TransactionClient,
    scope: PhysicalAuthorityScope,
  ): Promise<DeviceConnectionPhysicalAuthorityMode> {
    const provider = normalizeConnectivityProvider(scope.provider);
    await this.assertVehicleTenantScope(tx, scope.organizationId, scope.vehicleId);

    const lockKey = buildPhysicalStateAuthorityLockKey({
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      provider,
    });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const rows = await tx.$queryRaw<{ authority_mode: DeviceConnectionPhysicalAuthorityMode }[]>`
      SELECT authority_mode
      FROM device_connection_physical_authority_cutover
      WHERE organization_id = ${scope.organizationId}
        AND vehicle_id = ${scope.vehicleId}
        AND provider = ${provider}
      FOR UPDATE
    `;

    return rows[0]?.authority_mode ?? DeviceConnectionPhysicalAuthorityMode.LEGACY;
  }

  /**
   * P2.5 forward-only authority latch mutation.
   * Caller must evaluate cutover eligibility before invoking.
   */
  async latchLegacyToPhysicalInTransaction(
    tx: Prisma.TransactionClient,
    scope: PhysicalAuthorityScope,
    metadata?: {
      latchedBy?: string | null;
      evidenceSnapshot?: Prisma.InputJsonValue;
    },
  ): Promise<{
    outcome: 'LATCHED' | 'ALREADY_PHYSICAL';
    row: {
      id: string;
      authorityMode: DeviceConnectionPhysicalAuthorityMode;
      latchedAt: Date | null;
    };
  }> {
    const provider = normalizeConnectivityProvider(scope.provider);
    await this.assertVehicleTenantScope(tx, scope.organizationId, scope.vehicleId);

    const currentMode = await this.lockAuthorityScopeAndReadMode(tx, scope);
    if (currentMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
      const existing = await tx.deviceConnectionPhysicalAuthorityCutover.findFirstOrThrow({
        where: {
          organizationId: scope.organizationId,
          vehicleId: scope.vehicleId,
          provider,
        },
        select: { id: true, authorityMode: true, latchedAt: true },
      });
      return { outcome: 'ALREADY_PHYSICAL', row: existing };
    }

    const transition = validateAuthorityTransition(
      currentMode,
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    );
    if (!transition.allowed) {
      throw new Error(`physical_authority_cutover_forbidden:${transition.reason}`);
    }

    await this.ensureAuthorityRow(tx, scope);
    await this.lockAuthorityScopeAndReadMode(tx, scope);

    const latchedAt = new Date();
    const updated = await tx.deviceConnectionPhysicalAuthorityCutover.updateMany({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
        authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      },
      data: {
        authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
        latchedAt,
        latchedBy: metadata?.latchedBy ?? null,
        evidenceSnapshot: metadata?.evidenceSnapshot ?? Prisma.JsonNull,
        updatedAt: latchedAt,
      },
    });

    if (updated.count !== 1) {
      const row = await tx.deviceConnectionPhysicalAuthorityCutover.findFirstOrThrow({
        where: {
          organizationId: scope.organizationId,
          vehicleId: scope.vehicleId,
          provider,
        },
        select: { id: true, authorityMode: true, latchedAt: true },
      });
      if (row.authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
        return { outcome: 'ALREADY_PHYSICAL', row };
      }
      throw new Error('physical_authority_cutover_latch_update_failed');
    }

    const row = await tx.deviceConnectionPhysicalAuthorityCutover.findFirstOrThrow({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
      },
      select: { id: true, authorityMode: true, latchedAt: true },
    });

    return { outcome: 'LATCHED', row };
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
