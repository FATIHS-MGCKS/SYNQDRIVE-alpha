/**
 * Backfill missing per-vehicle DIMO VehicleProviderConsent rows and wire link.consentId.
 *
 * Default mode is DRY RUN — writes require explicit --apply.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/backfill-dimo-vehicle-provider-consents.ts \
 *     --org=<uuid> \
 *     --vehicle-id=<uuid> --vehicle-id=<uuid> --vehicle-id=<uuid>
 *
 *   ... --shadow   # include P0.1/P0.2 counterfactual after proposed consent
 *   ... --apply    # mutate (requires explicit approval)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { DataAuthorizationSourceType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { DimoProviderConsentBackfillService } from '../../src/modules/vehicles/dimo-provider-consent-backfill.service';
import { assembleVehicleConnectivityRuntimeBundle } from '../../src/modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import { VehicleOperationalProjectionService } from '../../src/modules/vehicles/operational/projection/vehicle-operational-projection.service';
import { assembleProviderLinkEvidence } from '../../src/modules/vehicles/connectivity/domain/provider-link-evidence.assembler';
import { ProviderLinkStateBuilder } from '../../src/modules/vehicles/connectivity/domain/provider-link-state.builder';
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
  const orgId =
    process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ||
    process.env.ORG_ID;
  const vehicleIds = process.argv
    .filter((a) => a.startsWith('--vehicle-id='))
    .map((a) => a.slice('--vehicle-id='.length));
  const runId = process.argv.find((a) => a.startsWith('--run-id='))?.slice('--run-id='.length);
  const apply = process.argv.includes('--apply');
  const shadow = process.argv.includes('--shadow');
  return { orgId, vehicleIds, runId, apply, shadow };
}

async function main(): Promise<void> {
  const { orgId, vehicleIds, runId, apply, shadow } = parseArgs();

  if (!orgId) {
    console.error('Missing required --org=<uuid>');
    process.exit(1);
  }
  if (vehicleIds.length === 0) {
    console.error('Missing required --vehicle-id=<uuid> (repeat per target vehicle)');
    process.exit(1);
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const backfillService = new DimoProviderConsentBackfillService(prisma);
    const projectionService = app.get(VehicleOperationalProjectionService);
    const now = new Date();
    const effectiveRunId =
      runId ?? `dimo-consent-backfill-prod-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;

    const summary = await backfillService.run({
      organizationId: orgId,
      vehicleIds,
      apply,
      runId: effectiveRunId,
    });

    const enriched = await Promise.all(
      summary.vehicles.map(async (plan) => {
        const row = await prisma.vehicle.findFirst({
          where: { id: plan.vehicleId, organizationId: plan.organizationId },
          select: {
            id: true,
            organizationId: true,
            licensePlate: true,
            status: true,
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
                dimoVehicleId: true,
                consentId: true,
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
          return { ...plan, shadow: null };
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

        let counterfactual: Record<string, unknown> | null = null;

        if (shadow && plan.plannedAction === 'CREATE' && plan.proposedConsent) {
          const simulatedConsent = {
            organizationId: plan.proposedConsent.organizationId,
            provider: DIMO_DATA_SOURCE_PROVIDER,
            status: 'ACTIVE' as const,
            grantedAt: new Date(plan.proposedConsent.grantedAt),
            expiresAt: null,
            revokedAt: null,
          };

          const shadowRow = {
            ...row,
            providerConsents: [simulatedConsent],
            dataSourceLinks: row.dataSourceLinks.map((link) => ({
              ...link,
              consentId:
                link.id === plan.activeDimoLinkId ? 'shadow-consent-id' : link.consentId,
            })),
          };

          const evidence = assembleProviderLinkEvidence({
            organizationId: shadowRow.organizationId,
            vehicleId: shadowRow.id,
            dimoVehicleId: shadowRow.dimoVehicleId,
            dimoVehicle: shadowRow.dimoVehicle,
            dataSourceLinks: shadowRow.dataSourceLinks.map((link) => ({
              id: link.id,
              provider: link.provider,
              isActive: link.isActive,
              dimoVehicleId: link.dimoVehicleId ?? null,
              organizationId: shadowRow.organizationId,
            })),
            providerConsents: shadowRow.providerConsents,
            orgAuthorization: orgAuth,
            lastSuccessfulTelemetryAt: shadowRow.latestState?.lastSeenAt ?? null,
          });

          const shadowProviderLink = ProviderLinkStateBuilder.build(evidence);
          const shadowBundle = assembleVehicleConnectivityRuntimeBundle(
            shadowRow as any,
            orgAuth,
          );
          const shadowProjection = await projectionService.projectWithConnectivityOverride({
            organizationId: row.organizationId,
            vehicleId: row.id,
            connectivityOverride: shadowBundle.runtime,
            now,
          });

          counterfactual = {
            providerLinkState: shadowProviderLink.state,
            telemetryState: shadowBundle.runtime.telemetryState,
            physicalDeviceState: shadowBundle.runtime.physicalDeviceState,
            overallState: shadowBundle.runtime.overallState,
            reasonCodes: shadowBundle.runtime.reasonCodes,
            operationalAvailability: shadowProjection.operationalAvailability,
            primaryReason: shadowProjection.operatorSummary?.primaryReason ?? null,
            recommendedAction: shadowProjection.operatorSummary?.recommendedAction ?? null,
            attention: shadowProjection.attention ?? null,
          };
        }

        return {
          vehicleRef: plan.vehicleRef,
          plannedAction: plan.plannedAction,
          plannedLinkAction: plan.plannedLinkAction,
          reason: plan.reason,
          proposedConsent: plan.proposedConsent,
          proposedLinkUpdate: plan.proposedLinkUpdate,
          identityChecks: plan.identityChecks,
          current: {
            providerLinkState: currentBundle.runtime.providerLinkState,
            telemetryState: currentBundle.runtime.telemetryState,
            physicalDeviceState: currentBundle.runtime.physicalDeviceState,
            overallState: currentBundle.runtime.overallState,
            reasonCodes: currentBundle.runtime.reasonCodes,
            operationalAvailability: currentProjection?.operationalAvailability ?? null,
            primaryReason: currentProjection?.operatorSummary?.primaryReason ?? null,
            recommendedAction: currentProjection?.operatorSummary?.recommendedAction ?? null,
            attention: currentProjection?.attention ?? null,
            businessState: currentProjection?.businessState ?? null,
          },
          counterfactual,
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
