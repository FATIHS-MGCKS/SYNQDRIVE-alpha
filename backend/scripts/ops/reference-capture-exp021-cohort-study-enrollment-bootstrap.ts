#!/usr/bin/env ts-node
/**
 * EXP-021 multi-vehicle cohort study enrollment bootstrap (exp021_study_enrollments).
 * Manual ops only. No RC sessions, study runs, PDI, or maturation families.
 *
 * Usage:
 *   npm run exp021:cohort:study-enrollment:bootstrap           # dry run
 *   npm run exp021:cohort:study-enrollment:bootstrap -- --execute
 */
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildExp021CanaryCohortAuthority,
  EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
  resolveExp021CanaryCohortFromEnv,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import {
  bootstrapExp021CohortStudyEnrollments,
  resolveExp021FleetStudyKeyFromEnv,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-cohort-study-enrollment-bootstrap.lib';
import { ReferenceCaptureExp021FleetRepository } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet.repository';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const execute = hasFlag('--execute');
  const cohort =
    resolveExp021CanaryCohortFromEnv() ??
    buildExp021CanaryCohortAuthority([...EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE]);
  if (!cohort) {
    throw new Error(
      'Cohort authority missing — set EXP021_CANARY_LIVE_WINDOW_COHORT_JSON or use reference cohort',
    );
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  const fleetRepository = new ReferenceCaptureExp021FleetRepository(prisma);
  const studyKey = resolveExp021FleetStudyKeyFromEnv();

  const result = await bootstrapExp021CohortStudyEnrollments({
    prisma,
    fleetRepository,
    cohort,
    studyKey,
    execute,
    enrolledBy: execute ? 'ops:cohort-study-enrollment-bootstrap' : undefined,
  });

  console.log(
    JSON.stringify(
      {
        execute,
        studyKey: result.studyKey,
        studyId: result.studyId,
        members: result.members,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
