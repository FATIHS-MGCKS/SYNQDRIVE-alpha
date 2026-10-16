/**
 * Operator-invoked P5B.1 offline VSI↔APDS correlation replay (read-only default).
 * No APDS worker, no DIMO HTTP, no VSI rematerialization, no polling mutations.
 */
import { PrismaClient } from '@prisma/client';
import { VsiApdsP5b1OfflineReplayService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-offline-replay.service';
import { VsiApdsP5b1DecisionRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1EvidenceWriter } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-evidence.writer';
import { VsiApdsP5ReadonlyService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-capability-resolver.repository';

async function main() {
  const organizationId = process.env.VSI_P5B1_ORG_ID;
  const vehicleId = process.env.VSI_P5B1_VEHICLE_ID;
  const limit = Number(process.env.VSI_P5B1_BATCH_LIMIT ?? '50');

  const prisma = new PrismaClient();
  const profiles = new VsiCapabilityResolverRepository(prisma as never);
  const service = new VsiApdsP5b1OfflineReplayService(
    new VsiApdsP5b1DecisionRepository(prisma as never),
    profiles,
    new VsiApdsP5ReadonlyService(profiles),
    new VsiApdsP5b1EvidenceWriter(prisma as never),
  );

  const result = await service.runOfflineReplayBatch({
    filter: {
      ...(organizationId ? { organizationId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
    },
    pagination: { limit },
    dryRun: true,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
