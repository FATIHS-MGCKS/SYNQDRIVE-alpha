/**
 * G5C-N16 shadow estimated battery health evaluation (read-only).
 * Uses extended GE window (no 500-row N14 harness cap). Production: forensic RO wrapper + backend.env.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { buildLvEstimatedBatteryHealthInputV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-input.builder';
import {
  evaluateLvEstimatedBatteryHealthV1,
  evaluateLvEstimatedBatteryHealthV1WithResearchPolicy,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.evaluator';
import { computeResearchEvidenceCompleteness } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.research-policy';
import { hasValidatedStartabilityCrankEvidenceV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-startability.policy';
import { isEligibleRestObservationForConditionV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-observation.policy';
import { evaluateLvOperationalConditionV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-v1.evaluator';
import { LV_ESTIMATED_HEALTH_DEFAULT_RESTORE_CUTOFF_ISO } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.constants';
import { LvMeasuredIntelligenceReadService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence-read.service';
import type { LongitudinalProfileRevisionInspectionService } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-profile-revision-inspection.service';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ??
    path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'lv-estimated-battery-health-readonly-harness';
  }
  if (!process.env.NODE_ENV?.trim()) {
    process.env.NODE_ENV = 'development';
  }
}

function parseArgs(prefix: string): string[] {
  return process.argv
    .filter((a) => a.startsWith(`${prefix}=`))
    .map((a) => a.split('=').slice(1).join('=').trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const organizationId =
    parseArgs('--organization-id')[0] ?? process.env.ORG_ID?.trim();
  const vehicleIds = parseArgs('--vehicle-id');
  const historyDays = Number.parseInt(
    parseArgs('--history-days')[0] ?? process.env.N16_HISTORY_DAYS ?? '120',
    10,
  );
  const observationLimit = Number.parseInt(
    parseArgs('--observation-limit')[0] ?? process.env.N16_OBSERVATION_LIMIT ?? '10000',
    10,
  );
  const restoreCutoffIso =
    parseArgs('--restore-cutoff')[0] ??
    process.env.N16_RESTORE_CUTOFF_ISO ??
    LV_ESTIMATED_HEALTH_DEFAULT_RESTORE_CUTOFF_ISO;
  const policyComparison =
    parseArgs('--policy-comparison')[0] === 'true' ||
    process.env.N16_POLICY_COMPARISON === '1';

  if (!organizationId || vehicleIds.length === 0) {
    console.error(
      'Usage: lv-estimated-battery-health-evaluation-readonly.ts --organization-id=<uuid> --vehicle-id=<uuid>+ [--policy-comparison=true]',
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const prismaDatasourceUrl =
    databaseUrl.includes('connection_limit=') || !databaseUrl
      ? databaseUrl
      : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=1`;
  const prisma = new PrismaClient(
    prismaDatasourceUrl
      ? { datasources: { db: { url: prismaDatasourceUrl } } }
      : undefined,
  );
  const d4InspectionStub = {
    inspectRevision: async () => ({ status: 'NOT_FOUND' as const }),
  } satisfies Pick<LongitudinalProfileRevisionInspectionService, 'inspectRevision'>;
  const readModel = new LvMeasuredIntelligenceReadService(
    prisma as unknown as PrismaService,
    d4InspectionStub as unknown as LongitudinalProfileRevisionInspectionService,
  );

  try {
    await prisma.$connect();
    const to = new Date();
    const from = new Date(to.getTime() - historyDays * 24 * 60 * 60 * 1000);

    const report: Record<string, unknown> = {
      model: 'LV_ESTIMATED_BATTERY_HEALTH_V1',
      evaluatedAt: new Date().toISOString(),
      organizationId,
      restoreCutoffIso,
      historyDays,
      observationLimit,
      vehicles: [],
    };

    for (const vehicleId of vehicleIds) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { id: true, licensePlate: true },
      });
      if (!vehicle) {
        console.error(`Vehicle not found in org: ${vehicleId}`);
        continue;
      }

      const prismaService = prisma as unknown as PrismaService;
      const healthInput = await buildLvEstimatedBatteryHealthInputV1(
        { prisma: prismaService, readModel },
        {
          organizationId,
          vehicleId,
          measuredFrom: from,
          measuredTo: to,
          observationLimit,
          sessionLimit: 500,
          restoreCutoffIso,
        },
      );

      const n14 = evaluateLvOperationalConditionV1(healthInput.conditionInput);
      const n16 = evaluateLvEstimatedBatteryHealthV1(healthInput);

      const row: Record<string, unknown> = {
        vehicleId,
        licensePlate: vehicle.licensePlate,
        geDataSelection: healthInput.conditionInput.geDataSelection,
        eligibleRestObservations: healthInput.conditionInput.eligibleRestObservations.length,
        postRestoreGeCount: healthInput.postRestoreObservationCount,
        n14: {
          operationalRiskStatus: n14.operationalRiskStatus,
          startabilityStatus: n14.startabilityStatus,
          assessmentConfidence: n14.assessmentConfidence,
          dataQuality: n14.dataQuality,
        },
        n16,
      };

      if (policyComparison) {
        const n16b = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
          healthInput,
          'P2_LOAD_REQUIRED_GREEN',
        );
        const n16c = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
          healthInput,
          'P3_CONSERVATIVE_GREEN',
        );
        const eligible = healthInput.conditionInput.eligibleRestObservations.filter(
          isEligibleRestObservationForConditionV1,
        );
        const eligibleWithTemp = eligible.filter((o) => o.temperatureC != null);
        const tempProvenance = eligible.filter(
          (o) => o.temperatureC != null && o.providerObservationAt != null,
        );
        const dt = n16.decisionTrace;
        const researchCtx = {
          bandCounts: dt.bandCounts,
          episodeCount: dt.qualifiedEpisodeCount,
          trend: dt.longitudinalTrend,
          loadSignal: dt.loadSignal,
          crankStale: dt.crankStale,
          loadAuthorizedForHealth: n16.supportingSignalFamilies.includes('LOAD_START_PERFORMANCE'),
          loadProvenanceValidated: hasValidatedStartabilityCrankEvidenceV1(
            healthInput.conditionInput.crankEvidence,
          ),
          observationSpanDays:
            dt.observationTimeRange.earliestIso && dt.observationTimeRange.latestIso
              ? (Date.parse(dt.observationTimeRange.latestIso) -
                  Date.parse(dt.observationTimeRange.earliestIso)) /
                (24 * 60 * 60 * 1000)
              : 0,
          openProviderGaps: healthInput.conditionInput.openProviderObservabilityGapCount,
          inputCoverageIncomplete: healthInput.conditionInput.inputCoverageIncomplete,
          historicalObservationsTruncated:
            healthInput.conditionInput.historicalObservationsTruncated,
          temperatureObservationCount: eligibleWithTemp.length,
          temperatureProvenanceValid: tempProvenance.length > 0,
        };
        row.policyComparison = {
          disclaimer:
            'Historical production replay — not empirical accuracy vs ground truth.',
          policyA: {
            status: n16.estimatedHealthStatus,
            ruleId: dt.finalRuleId,
            reasonCodes: n16.reasonCodes,
          },
          policyB: {
            status: n16b.estimatedHealthStatus,
            ruleId: n16b.decisionTrace.finalRuleId,
            researchRuleId: n16b.decisionTrace.researchRuleId,
            reasonCodes: n16b.reasonCodes,
          },
          policyC: {
            status: n16c.estimatedHealthStatus,
            ruleId: n16c.decisionTrace.finalRuleId,
            researchRuleId: n16c.decisionTrace.researchRuleId,
            reasonCodes: n16c.reasonCodes,
          },
          evidenceCompleteness: computeResearchEvidenceCompleteness(
            researchCtx,
            'P3_CONSERVATIVE_GREEN',
          ),
          missingLoadEvidence: researchCtx.loadSignal !== 'GREEN' || researchCtx.crankStale,
          missingTemperatureEvidence: researchCtx.temperatureObservationCount === 0,
          p3GreenBlockers: computeResearchEvidenceCompleteness(
            researchCtx,
            'P3_CONSERVATIVE_GREEN',
          ).greenBlockers,
        };
      }

      (report.vehicles as unknown[]).push(row);
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
