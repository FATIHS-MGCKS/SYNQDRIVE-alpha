/**
 * Backfill canonical DIMO VehicleDataSourceLink rows for legacy registrations.
 *
 * Default mode is DRY RUN — writes require explicit --apply.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/backfill-dimo-vehicle-data-source-links.ts --org=<uuid>
 *   ... --apply   # mutate (default is dry-run)
 *   ... --shadow  # include P0.1→P0.2 post-backfill projection delta (read-only)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { DataAuthorizationSourceType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { DimoVehicleDataSourceLinkService } from '../../src/modules/dimo/dimo-vehicle-data-source-link.service';
import { assembleVehicleConnectivityRuntimeBundle } from '../../src/modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import { VehicleOperationalProjectionService } from '../../src/modules/vehicles/operational/projection/vehicle-operational-projection.service';
import { buildVehicleOperationalProjection } from '../../src/modules/vehicles/operational/projection/vehicle-operational-projection.builder';
import { businessStateFromFleetContext } from '../../src/modules/vehicles/operational/projection/business-state.adapter';
import { healthEvidenceFromVehicleHealth } from '../../src/modules/vehicles/operational/projection/health-evidence.adapter';
import { RentalHealthSummaryService } from '../../src/modules/rental-health/rental-health-summary.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { ProviderLinkStateBuilder } from '../../src/modules/vehicles/connectivity/domain/provider-link-state.builder';
import { assembleProviderLinkEvidence } from '../../src/modules/vehicles/connectivity/domain/provider-link-evidence.assembler';
import {
  DIMO_DATA_SOURCE_PROVIDER,
  DIMO_DATA_SOURCE_SUBTYPE,
  DIMO_DATA_SOURCE_TYPE,
} from '../../src/modules/dimo/dimo-vehicle-data-source-link.contract';

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
  const orgId =
    process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ||
    process.env.ORG_ID;
  const apply = process.argv.includes('--apply');
  const shadow = process.argv.includes('--shadow');
  return { orgId, apply, shadow };
}

async function main(): Promise<void> {
  const { orgId, apply, shadow } = parseArgs();

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const linkService = app.get(DimoVehicleDataSourceLinkService);
    const prisma = app.get(PrismaService);
    const projectionService = app.get(VehicleOperationalProjectionService);
    const vehiclesService = app.get(VehiclesService);
    const rentalHealthSummary = app.get(RentalHealthSummaryService);
    const now = new Date();

    const summary = await linkService.runBackfill({
      organizationId: orgId,
      apply,
    });

    const enriched = await Promise.all(
      summary.vehicles.map(async (vehicle) => {
        const row = await prisma.vehicle.findFirst({
          where: { id: vehicle.vehicleId, organizationId: vehicle.organizationId },
          select: {
            id: true,
            organizationId: true,
            licensePlate: true,
            dimoVehicleId: true,
            dimoVehicle: {
              select: { connectionStatus: true, tokenId: true, lastSignal: true },
            },
            latestState: {
              select: {
                lastSeenAt: true,
                providerFetchedAt: true,
                sourceTimestamp: true,
                providerSource: true,
                providerBindingId: true,
                rawPayloadJson: true,
                latitude: true,
                longitude: true,
                speedKmh: true,
                odometerKm: true,
                fuelLevelRelative: true,
                fuelLevelAbsolute: true,
                evSoc: true,
                obdDtcList: true,
                lastDtcPollAt: true,
              },
            },
            dataSourceLinks: {
              where: { provider: DIMO_DATA_SOURCE_PROVIDER },
              select: {
                id: true,
                sourceType: true,
                sourceSubtype: true,
                isActive: true,
                provider: true,
              },
            },
            providerConsents: {
              where: { provider: DIMO_DATA_SOURCE_PROVIDER },
              orderBy: { grantedAt: 'desc' },
              select: {
                organizationId: true,
                provider: true,
                status: true,
                grantedAt: true,
                expiresAt: true,
                revokedAt: true,
              },
            },
            deviceConnectionEpisodes: {
              orderBy: { openedAt: 'desc' },
              take: 3,
              select: {
                id: true,
                deviceBindingId: true,
                openedAt: true,
                status: true,
                resolutionMethod: true,
                resolutionEvidenceAt: true,
                resolvedAt: true,
              },
            },
            hardwareType: true,
            fuelType: true,
          },
        });

        if (!row) {
          return {
            ...vehicle,
            consentState: vehicle.consentProvenance.consentStatus,
            authState: 'UNKNOWN',
            telemetryState: null,
            currentProviderLinkState: null,
            currentOperationalAvailability: null,
            expectedProviderLinkStateAfterLink: null,
            expectedOperationalAvailabilityAfterLink: null,
          };
        }

        const orgAuth = await prisma.orgDataAuthorization.findFirst({
          where: {
            organizationId: row.organizationId,
            sourceType: DataAuthorizationSourceType.DIMO,
          },
          orderBy: { grantedAt: 'desc' },
          select: { status: true, expiresAt: true, revokedAt: true },
        });

        const currentBundle = assembleVehicleConnectivityRuntimeBundle(row as any, orgAuth);
        const currentProjection = await projectionService.getVehicleProjection({
          organizationId: row.organizationId,
          vehicleId: row.id,
          now,
        });

        let expectedProviderLinkStateAfterLink: string | null = null;
        let expectedOperationalAvailabilityAfterLink: string | null = null;

        if (shadow && vehicle.plannedAction !== 'CONFLICT' && vehicle.plannedAction !== 'SKIP') {
          const simulatedLinks =
            vehicle.plannedAction === 'NOOP'
              ? row.dataSourceLinks
              : [
                  {
                    id: 'shadow-link',
                    sourceType: DIMO_DATA_SOURCE_TYPE,
                    sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
                    isActive: true,
                    provider: DIMO_DATA_SOURCE_PROVIDER,
                  },
                ];

          const evidence = assembleProviderLinkEvidence({
            organizationId: row.organizationId,
            vehicleId: row.id,
            dimoVehicleId: row.dimoVehicleId,
            dimoVehicle: row.dimoVehicle,
            dataSourceLinks: simulatedLinks.map((l) => ({
              ...l,
              organizationId: row.organizationId,
            })),
            providerConsents: row.providerConsents,
            orgAuthorization: orgAuth,
            lastSuccessfulTelemetryAt: row.latestState?.lastSeenAt ?? null,
          });
          expectedProviderLinkStateAfterLink = ProviderLinkStateBuilder.build(evidence).state;

          const shadowBundle = assembleVehicleConnectivityRuntimeBundle(
            { ...row, dataSourceLinks: simulatedLinks } as any,
            orgAuth,
          );

          const [businessContextMap, healthRows] = await Promise.all([
            vehiclesService.deriveFleetBusinessContextBatch(row.organizationId, [
              {
                id: row.id,
                organizationId: row.organizationId,
                status: 'AVAILABLE',
                licensePlate: row.licensePlate,
                tankCapacityLiters: null,
                latestState: row.latestState,
              } as any,
            ]),
            rentalHealthSummary.getFleetRowsBatch(row.organizationId, [row.id]),
          ]);
          const businessContext = businessContextMap.get(row.id);
          const healthRow = healthRows[0];

          const shadowProjection = buildVehicleOperationalProjection({
            vehicleId: row.id,
            organizationId: row.organizationId,
            generatedAt: now.toISOString(),
            businessState: businessStateFromFleetContext({
              vehicleStatus: 'AVAILABLE',
              operationalState: businessContext!,
            }),
            connectivity: shadowBundle.runtime,
            health: healthRow ? healthEvidenceFromVehicleHealth(healthRow) : undefined,
            episodeEvidenceReliable: false,
          });
          expectedOperationalAvailabilityAfterLink = shadowProjection.operationalAvailability;
        }

        return {
          vehicleRef: vehicle.vehicleRef,
          plannedAction: vehicle.plannedAction,
          reason: vehicle.reason,
          consentState: vehicle.consentProvenance.consentStatus,
          authState: orgAuth?.status ?? 'MISSING',
          existingActiveDimoLink: vehicle.existingActiveDimoLink,
          telemetryState: currentBundle.runtime.telemetryState,
          currentProviderLinkState: currentBundle.runtime.providerLinkState,
          currentOperationalAvailability: currentProjection?.operationalAvailability ?? null,
          expectedProviderLinkStateAfterLink,
          expectedOperationalAvailabilityAfterLink,
        };
      }),
    );

    console.log(
      JSON.stringify(
        {
          ...summary,
          apply,
          shadow,
          vehicles: enriched,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(2);
});
