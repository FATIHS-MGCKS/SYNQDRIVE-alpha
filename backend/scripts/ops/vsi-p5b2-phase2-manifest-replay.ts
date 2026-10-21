/**
 * P5B.2 Phase 2 manifest offline research replay (read-only, dry-run only).
 *
 * Example:
 *   VSI_P5B2_REPLAY_PROFILE_MODE=HISTORY_AS_OF \
 *   VSI_P5B2_MANIFEST_PATH=/path/to/p5b2-phase2-proposed-manifest.json \
 *   npx ts-node scripts/ops/vsi-p5b2-phase2-manifest-replay.ts
 */
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { VsiApdsP5b1DecisionRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1OfflineReplayService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-offline-replay.service';
import { VsiApdsP5b1EvidenceWriter } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-evidence.writer';
import { VsiApdsP5ReadonlyService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-capability-resolver.repository';
import { VsiProfileRevisionHistoryRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-revision-history.repository';
import { parseVsiP5b2ReplayProfileMode } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b2-replay-profile-mode';
import { loadAndValidateVsiApdsP5b2Phase2ManifestFromFile } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b2-phase2-manifest';
import { VsiApdsP5b2Phase2ManifestReplayService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b2-phase2-manifest-replay.service';
import { VsiApdsP5b2Phase2ManifestError } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b2-phase2-manifest.errors';
async function main() {
  const replayProfileMode = parseVsiP5b2ReplayProfileMode(
    process.env.VSI_P5B2_REPLAY_PROFILE_MODE,
  );
  const manifestPath =
    process.env.VSI_P5B2_MANIFEST_PATH?.trim() ||
    resolve(__dirname, '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/fixtures/p5b2-phase2-proposed-manifest.json');

  const expectedSha = process.env.VSI_P5B2_MANIFEST_SHA256?.trim();
  const manifest = expectedSha
    ? loadAndValidateVsiApdsP5b2Phase2ManifestFromFile(manifestPath, { expectedSha256: expectedSha })
    : loadAndValidateVsiApdsP5b2Phase2ManifestFromFile(manifestPath);

  const prisma = new PrismaClient();
  const profiles = new VsiCapabilityResolverRepository(prisma as never);
  const offlineReplay = new VsiApdsP5b1OfflineReplayService(
    new VsiApdsP5b1DecisionRepository(prisma as never),
    profiles,
    new VsiApdsP5ReadonlyService(profiles),
    new VsiApdsP5b1EvidenceWriter(prisma as never),
    new VsiProfileRevisionHistoryRepository(prisma as never),
  );
  const manifestReplay = new VsiApdsP5b2Phase2ManifestReplayService(
    new VsiApdsP5b1DecisionRepository(prisma as never),
    offlineReplay,
  );

  const result = await manifestReplay.runManifestReplay({
    manifest,
    replayProfileMode,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  if (err instanceof VsiApdsP5b2Phase2ManifestError) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
