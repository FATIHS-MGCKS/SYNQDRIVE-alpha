/**
 * Phase 2 DIMO consent backfill forensic capture (read-only).
 * Usage:
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/dimo-consent-phase2-forensic-readonly.ts \
 *     --org=<uuid> --vehicle-id=<uuid> ... --label=pre-apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { DataAuthorizationSourceType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { assembleVehicleConnectivityRuntimeBundle } from '../../src/modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import { VehicleOperationalProjectionService } from '../../src/modules/vehicles/operational/projection/vehicle-operational-projection.service';
import { DIMO_DATA_SOURCE_PROVIDER } from '../../src/modules/dimo/dimo-vehicle-data-source-link.contract';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ?? path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
}

function parseArgs() {
  const orgId = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);
  const vehicleIds = process.argv
    .filter((a) => a.startsWith('--vehicle-id='))
    .map((a) => a.slice('--vehicle-id='.length));
  const label = process.argv.find((a) => a.startsWith('--label='))?.slice('--label='.length) ?? 'capture';
  return { orgId, vehicleIds, label };
}

async function main(): Promise<void> {
  const { orgId, vehicleIds, label } = parseArgs();
  if (!orgId || vehicleIds.length === 0) {
    console.error('Usage: --org=<uuid> --vehicle-id=<uuid> [--label=pre-apply]');
    process.exit(1);
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });
  const now = new Date();

  try {
    const prisma = app.get(PrismaService);
    const projectionService = app.get(VehicleOperationalProjectionService);

    const orgAuth = await prisma.orgDataAuthorization.findFirst({
      where: { organizationId: orgId, sourceType: DataAuthorizationSourceType.DIMO },
      orderBy: { grantedAt: 'desc' },
      select: { id: true, status: true, grantedAt: true, expiresAt: true, revokedAt: true },
    });

    const vehicles = await Promise.all(
      vehicleIds.map(async (vehicleId) => {
        const row = await prisma.vehicle.findFirst({
          where: { id: vehicleId, organizationId: orgId },
          select: {
            id: true,
            organizationId: true,
            licensePlate: true,
            status: true,
            dimoVehicleId: true,
            dimoVehicle: { select: { tokenId: true, externalId: true, connectionStatus: true } },
            latestState: {
              select: {
                sourceTimestamp: true,
                providerFetchedAt: true,
                lastSeenAt: true,
              },
            },
            dataSourceLinks: {
              where: { provider: DIMO_DATA_SOURCE_PROVIDER },
              select: {
                id: true,
                isActive: true,
                provider: true,
                dimoVehicleId: true,
                consentId: true,
              },
            },
            providerConsents: {
              where: { provider: DIMO_DATA_SOURCE_PROVIDER },
              select: {
                id: true,
                status: true,
                grantType: true,
                provider: true,
                organizationId: true,
                vehicleId: true,
                scopes: true,
                providerVehicleRef: true,
                metadataJson: true,
                grantedAt: true,
                expiresAt: true,
                revokedAt: true,
              },
            },
            deviceConnectionEpisodes: {
              where: { status: 'OPEN' },
              select: { id: true },
            },
          },
        });

        if (!row) return { vehicleId, error: 'not_found' };

        const activeDimoLinks = row.dataSourceLinks.filter((l) => l.isActive && l.dimoVehicleId);
        const activeDimoConsents = row.providerConsents.filter((c) => c.status === 'ACTIVE');
        const bundle = assembleVehicleConnectivityRuntimeBundle(row as any, orgAuth);
        const projection = await projectionService.getVehicleProjection({
          organizationId: orgId,
          vehicleId: row.id,
          now,
        });

        return {
          vehicleId: row.id,
          organizationId: row.organizationId,
          plate: row.licensePlate,
          businessState: row.status,
          dimoVehicleId: row.dimoVehicleId,
          tokenId: row.dimoVehicle?.tokenId ?? null,
          dimoExternalId: row.dimoVehicle?.externalId ?? null,
          activeDimoLinkId: activeDimoLinks.length === 1 ? activeDimoLinks[0]!.id : null,
          linkConsentId: activeDimoLinks.length === 1 ? activeDimoLinks[0]!.consentId : null,
          dimoProviderConsentCount: row.providerConsents.length,
          activeDimoProviderConsentCount: activeDimoConsents.length,
          activeDimoConsents: activeDimoConsents.map((c) => ({
            id: c.id,
            grantType: c.grantType,
            status: c.status,
            scopes: c.scopes,
            providerVehicleRef: c.providerVehicleRef,
            metadataJson: c.metadataJson,
            expiresAt: c.expiresAt,
            revokedAt: c.revokedAt,
          })),
          activeDimoLinkCount: activeDimoLinks.length,
          providerLinkState: bundle.runtime.providerLinkState,
          telemetryState: bundle.runtime.telemetryState,
          physicalDeviceState: bundle.runtime.physicalDeviceState,
          overallState: bundle.runtime.overallState,
          reasonCodes: bundle.runtime.reasonCodes,
          p02OperationalAvailability: projection?.operationalAvailability ?? null,
          p02PrimaryReason: projection?.operatorSummary?.primaryReason ?? null,
          p02RecommendedAction: projection?.operatorSummary?.recommendedAction ?? null,
          p03State: projection?.businessState ?? null,
          latestSourceTimestamp: row.latestState?.sourceTimestamp?.toISOString() ?? null,
          latestProviderFetchedAt: row.latestState?.providerFetchedAt?.toISOString() ?? null,
          openConnectivityEpisodeCount: row.deviceConnectionEpisodes.length,
        };
      }),
    );

    console.log(JSON.stringify({ label, capturedAt: now.toISOString(), orgId, orgAuth, vehicles }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(2);
});
