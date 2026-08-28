/**
 * E3A capability-source audit (read-only, no writes).
 *
 * Answers "which source claimed a capability, and did canonical applicability
 * accept or suppress it?" per DIMO-linked vehicle. Output is keyed by anonymous
 * inventory index — no plates, tokenIds, vehicle UUIDs or coordinates — so it is
 * safe to paste into a review while the underlying run stays on secured infra.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register \
 *     scripts/ops/energy-events-capability-source-audit.ts
 *
 * Requires: DATABASE_URL, DIMO_CLIENT_ID, DIMO_PRIVATE_KEY
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  buildCapabilityEvidenceAggregate,
  buildRecoveryVehicleInput,
  resolveEnergyMechanismApplicability,
  toRecoveryPowertrain,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import {
  createDimoRequestAccounting,
  type DimoRequestAccounting,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import {
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
} from './energy-events-standalone-dimo-fetch';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const SOC_SIGNALS = [
  'powertrainTractionBatteryStateOfChargeCurrent',
  'powertrainTractionBatteryStateOfChargeCurrentEnergy',
];
const FUEL_SIGNALS = [
  'powertrainFuelSystemRelativeLevel',
  'powertrainFuelSystemAbsoluteLevel',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const accounting: DimoRequestAccounting = createDimoRequestAccounting();
  const prisma = createMutationGuardedPrismaClient(new PrismaClient());
  const repository = createPrismaRecoveryReadRepository(prisma);

  const rows = await repository.loadRecoveryVehicleDbRows({
    outageStart: new Date(ENERGY_EVENTS_OUTAGE_START_ISO),
    recoveryCutoff: new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO),
  });

  const tokenIds = rows.map((row) => row.tokenId);
  const dimoAccessByTokenId = await probeDimoAccessForTokenIds(tokenIds, accounting);
  const accessibleTokenIds = tokenIds.filter((id) => dimoAccessByTokenId[id]);
  const availableSignalsByTokenId = await probeAvailableSignalsForTokenIds(
    accessibleTokenIds,
    accounting,
  );

  const vehicles = rows.map((row) =>
    buildRecoveryVehicleInput(
      { ...row, dimoAccessAvailable: dimoAccessByTokenId[row.tokenId] ?? false },
      availableSignalsByTokenId[row.tokenId] ?? null,
      'full',
    ),
  );

  const detail = rows.map((row, index) => {
    const signals = availableSignalsByTokenId[row.tokenId] ?? null;
    const powertrain = toRecoveryPowertrain(row.fuelType);
    const applicability = resolveEnergyMechanismApplicability(powertrain);
    return {
      inventoryIndex: index,
      rawFuelType: row.fuelType,
      resolvedPowertrain: powertrain,
      applicability,
      dimoAccessAvailable: dimoAccessByTokenId[row.tokenId] ?? false,
      availableSignalsProbe: signals == null ? 'failed_or_skipped' : 'ok',
      availableSignalsCount: signals?.length ?? null,
      availableSignalsListsSoc:
        signals != null ? signals.some((s) => SOC_SIGNALS.includes(s)) : null,
      availableSignalsListsFuel:
        signals != null ? signals.some((s) => FUEL_SIGNALS.includes(s)) : null,
      socSignalsListed:
        signals != null ? signals.filter((s) => SOC_SIGNALS.includes(s)) : null,
      batteryCapabilityRows: row.batteryCapabilities.map((capability) => ({
        signalKey: capability.signalKey,
        status: capability.status,
      })),
      windowEventKinds: [
        ...new Set(row.existingEvents.map((event) => event.kind)),
      ],
      windowEventsWithSocDelta: row.existingEvents.filter(
        (event) => event.socDeltaPercent != null || event.energyDeltaKwh != null,
      ).length,
      windowEventsWithFuelDelta: row.existingEvents.filter(
        (event) => event.fuelDeltaLiters != null || event.fuelDeltaPercent != null,
      ).length,
      resolved: {
        relativeFuelAvailable: vehicles[index].relativeFuelAvailable,
        absoluteFuelAvailable: vehicles[index].absoluteFuelAvailable,
        rechargeSocAvailable: vehicles[index].rechargeSocAvailable,
        capabilityLookupStatus: vehicles[index].capabilityLookupStatus,
      },
      evidence: vehicles[index].capabilityEvidence,
    };
  });

  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        auditKind: 'capability_source_audit',
        note: 'Anonymous inventory indices only. Never commit raw output containing operational identifiers.',
        outageStart: ENERGY_EVENTS_OUTAGE_START_ISO,
        recoveryCutoff: ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
        vehicleCount: rows.length,
        aggregate: buildCapabilityEvidenceAggregate(vehicles),
        requestAccounting: accounting,
        detail,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
