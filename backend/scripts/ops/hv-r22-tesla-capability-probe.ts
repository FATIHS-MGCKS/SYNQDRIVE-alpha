/**
 * HV R22 Tesla capability probe — owner-gated live DIMO query OR offline fixture evaluation.
 *
 * Fixture (no network):
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/hv-r22-tesla-capability-probe.ts --mode=fixture
 *
 * Live (requires owner ack — exactly one GraphQL query, no retries):
 *   HV_R22_CAPABILITY_PROBE_OWNER_AUTHORIZED=1 \
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/hv-r22-tesla-capability-probe.ts \
 *     --mode=live --from=2026-10-12T13:06:55Z --to=2026-10-12T13:20:00Z
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DimoChargingAddedEnergyIntervalClient } from '../../src/modules/vehicle-intelligence/battery-health/hv-charging-counter-evidence/dimo-charging-added-energy-interval.client';
import { evaluateHvChargingCounterCapabilityV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-charging-counter-evidence/hv-charging-counter-evidence.capability-eval.v1';
import type { HvChargingCounterDimoIntervalRowV1 } from '../../src/modules/vehicle-intelligence/battery-health/hv-charging-counter-evidence/hv-charging-counter-evidence.types.v1';

const TESLA_TOKEN_ID = 186946;
const TESLA_VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const TESLA_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    args[key] = value ?? 'true';
  }
  return args;
}

function loadFixtureEpisode(episodeId: string): HvChargingCounterDimoIntervalRowV1[] {
  const fixturePath = resolve(
    __dirname,
    '../../src/modules/vehicle-intelligence/battery-health/hv-h4/fixtures/r15-dimo-added-energy-interval.v1.fixture.json',
  );
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    episodes: Array<{
      id: string;
      queryWindow: { from: string; to: string };
      buckets: HvChargingCounterDimoIntervalRowV1[];
    }>;
  };
  const episode = fixture.episodes.find((row) => row.id === episodeId);
  if (!episode) {
    throw new Error(`fixture episode not found: ${episodeId}`);
  }
  return episode.buckets;
}

function estimateProviderCost(from: Date, to: Date) {
  const durationMs = Math.max(0, to.getTime() - from.getTime());
  const minuteBuckets = Math.ceil(durationMs / 60_000) + 1;
  return {
    graphqlQueries: 1,
    interval: '1m',
    signal: 'powertrainTractionBatteryChargingAddedEnergy',
    aggregations: ['LAST', 'MIN', 'MAX'],
    estimatedMinuteBucketsReturned: minuteBuckets,
    retries: 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? 'fixture';

  if (mode === 'fixture') {
    const episodeId = args.episode ?? 'oct12_session_3e5fe028';
    const rows = loadFixtureEpisode(episodeId);
    const windowFrom = rows[0]?.timestamp ?? 'unknown';
    const windowTo = rows[rows.length - 1]?.timestamp ?? 'unknown';
    const evalResult = evaluateHvChargingCounterCapabilityV1(rows);
    console.log(
      JSON.stringify(
        {
          mode: 'fixture',
          providerCallExecuted: false,
          tokenId: TESLA_TOKEN_ID,
          vehicleId: TESLA_VEHICLE_ID,
          window: { from: windowFrom, to: windowTo, bucketCount: rows.length },
          costEstimate: { graphqlQueries: 0 },
          capability: evalResult,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (mode !== 'live') {
    throw new Error(`unsupported mode: ${mode}`);
  }

  if (process.env.HV_R22_CAPABILITY_PROBE_OWNER_AUTHORIZED !== '1') {
    throw new Error(
      'Refusing live probe: set HV_R22_CAPABILITY_PROBE_OWNER_AUTHORIZED=1 after owner approval',
    );
  }

  const fromIso = args.from;
  const toIso = args.to;
  if (!fromIso || !toIso) {
    throw new Error('live mode requires --from=ISO --to=ISO (small bounded window)');
  }
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
    throw new Error('invalid --from/--to window');
  }
  const maxWindowMs = 4 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxWindowMs) {
    throw new Error('live window exceeds 4h safety cap — choose a smaller pilot window');
  }

  const costEstimate = estimateProviderCost(from, to);
  console.log(
    JSON.stringify(
      {
        mode: 'live',
        preflight: {
          tokenId: TESLA_TOKEN_ID,
          vehicleId: TESLA_VEHICLE_ID,
          organizationId: TESLA_ORG_ID,
          window: { from: from.toISOString(), to: to.toISOString() },
          costEstimate,
        },
      },
      null,
      2,
    ),
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const client = app.get(DimoChargingAddedEnergyIntervalClient);
    const fetchResult = await client.fetchIntervalBuckets({
      tokenId: TESLA_TOKEN_ID,
      from,
      to,
      organizationId: TESLA_ORG_ID,
      vehicleId: TESLA_VEHICLE_ID,
    });
    const evalResult = evaluateHvChargingCounterCapabilityV1(fetchResult.rows);
    console.log(
      JSON.stringify(
        {
          mode: 'live',
          providerCallExecuted: true,
          fetchStatus: fetchResult.status,
          rowCount: fetchResult.rows.length,
          capability: evalResult,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
