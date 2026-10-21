#!/usr/bin/env ts-node
/**
 * Read-only M3.3F D4 longitudinal profile revision inspection (stdout JSON).
 *
 * Usage:
 *   cd backend
 *   npm run battery:longitudinal-profile:inspect -- --revision-id=<uuid>
 */
import { PrismaClient } from '@prisma/client';
import { LongitudinalProfileMaterializationRepository } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-materialization.repository';
import { LongitudinalSourceEvidenceAckRepository } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-source-evidence-ack.repository';
import { LongitudinalProfileRevisionInspectionService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-revision-inspection.service';
import { assertLongitudinalProfileRevisionInspectDatabaseAllowed } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-revision-inspect.env';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  try {
    assertLongitudinalProfileRevisionInspectDatabaseAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const revisionId = parseArg('--revision-id');
  if (!revisionId) {
    console.error(
      'Usage: battery-longitudinal-profile-revision-inspect.ts --revision-id=<uuid>',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const repo = new LongitudinalProfileMaterializationRepository(prisma as never);
  const ackRepo = new LongitudinalSourceEvidenceAckRepository(prisma as never);
  const inspector = new LongitudinalProfileRevisionInspectionService(repo, ackRepo);

  try {
    const result = await inspector.inspectRevision({ revisionId });
    if (result.status === 'NOT_FOUND') {
      console.log(JSON.stringify({ status: 'NOT_FOUND' }, null, 2));
      process.exit(2);
    }
    const view = result.view!;
    console.log(
      JSON.stringify(
        {
          status: 'OK',
          revisionId: view.revision.id,
          organizationId: view.revision.organizationId,
          vehicleId: view.revision.vehicleId,
          canonicalProfileFingerprint: view.revision.canonicalProfileFingerprint,
          longitudinalProfileContractVersion: view.revision.longitudinalProfileContractVersion,
          profilePolicyVersion: view.revision.profilePolicyVersion,
          materializedAt: view.revision.materializedAt.toISOString(),
          creationSourceEvidenceFingerprint: view.creationSourceEvidenceFingerprint,
          creationSourceEvidenceFingerprintAuthority:
            view.creationSourceEvidenceFingerprintAuthority,
          sourceEvidenceAcknowledgements: view.sourceEvidenceAcknowledgements,
          ackCount: view.ackCount,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main();
