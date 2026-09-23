#!/usr/bin/env ts-node
/**
 * Read-only M3.3C C5A shadow rest-session feature inspection (stdout JSON).
 *
 * Usage:
 *   cd backend
 *   npm run battery:rest-feature:inspect -- \
 *     --organization-id=<uuid> --vehicle-id=<uuid> --rest-session-id=<uuid> [--include-raw]
 */
import { PrismaClient } from '@prisma/client';
import { RestSessionFeatureShadowInspectionService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/rest-session-feature-shadow-inspection.service';
import { assertRestFeatureInspectDatabaseAllowed } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/rest-session-feature-inspect.env';

function parseArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

async function main(): Promise<void> {
  try {
    assertRestFeatureInspectDatabaseAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  const restSessionId = parseArg('--rest-session-id');
  const includeRaw = process.argv.includes('--include-raw');

  if (!organizationId || !vehicleId || !restSessionId) {
    console.error(
      'Usage: battery-rest-session-feature-shadow-inspect.ts --organization-id=... --vehicle-id=... --rest-session-id=... [--include-raw]',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const inspector = new RestSessionFeatureShadowInspectionService(prisma as never);

  try {
    const result = await inspector.inspectSession({
      organizationId,
      vehicleId,
      restSessionId,
      includeRaw,
    });

    if (result.status === 'SESSION_NOT_FOUND') {
      console.log(JSON.stringify({ status: 'SESSION_NOT_FOUND' }, null, 2));
      process.exit(2);
    }

    console.log(JSON.stringify(result.inspection, null, 2));
    if (result.inspection.integrity.overallStatus === 'INTEGRITY_WARNING') {
      process.exit(3);
    }
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main();
