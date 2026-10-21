/**
 * P2.5 APDS-9.0 — read-only Production preflight for WORKER_APD_SHADOW_COHORT_JSON.
 *
 * Verifies configured (organizationId, vehicleId) pairs against current DB bindings.
 * Does not mutate Production. Provider token IDs are used for verification only.
 *
 * Usage:
 *   DATABASE_URL=... WORKER_APD_SHADOW_COHORT_JSON='...' \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/p25-apd-shadow-cohort-production-preflight.ts
 *
 * Optional (preflight-only expected R9 LTE_R1 token allowlist):
 *   P25_APD_PREFLIGHT_EXPECTED_TOKEN_IDS=186946,187336,187361,187784,192922
 *   P25_APD_PREFLIGHT_EXCLUDED_TOKEN_ID=190497
 */
import { PrismaClient, VehicleRegistryLifecycle } from '@prisma/client';
import { parseApdShadowCohortRuntime } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/adaptive-polling-shadow-cohort.config';

const DEFAULT_EXPECTED_TOKENS = [186946, 187336, 187361, 187784, 192922];
const DEFAULT_EXCLUDED_TOKEN = 190497;

function parseTokenList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw?.trim()) return fallback;
  return raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

async function main(): Promise<void> {
  const env = { ...process.env, WORKER_APD_SHADOW_ENABLED: 'true' };
  const runtime = parseApdShadowCohortRuntime(env);
  if (runtime.state !== 'READY' || !runtime.config) {
    console.error('PREFLIGHT_FAIL: cohort runtime not READY', runtime.state);
    process.exit(1);
  }

  const members = runtime.config.members;
  const orgIds = new Set(members.map((m) => m.organizationId));
  console.log('CONFIGURED_MEMBER_COUNT=%d', members.length);
  console.log('CONFIGURED_ORG_COUNT=%d', orgIds.size);
  console.log('COHORT_CONFIG_FINGERPRINT_SHA256=%s', runtime.configFingerprintSha256 ?? '');

  if (members.length !== 5) {
    console.error('PREFLIGHT_FAIL: expected CONFIGURED_MEMBER_COUNT=5');
    process.exit(1);
  }
  if (orgIds.size !== 1) {
    console.error('PREFLIGHT_FAIL: expected CONFIGURED_ORG_COUNT=1');
    process.exit(1);
  }

  const expectedTokens = new Set(
    parseTokenList(process.env.P25_APD_PREFLIGHT_EXPECTED_TOKEN_IDS, DEFAULT_EXPECTED_TOKENS),
  );
  const excludedToken = Number.parseInt(
    process.env.P25_APD_PREFLIGHT_EXCLUDED_TOKEN_ID ?? String(DEFAULT_EXCLUDED_TOKEN),
    10,
  );

  const prisma = new PrismaClient();
  const seenTokens = new Set<number>();

  try {
    for (const m of members) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: m.vehicleId, organizationId: m.organizationId },
        select: {
          id: true,
          organizationId: true,
          registryLifecycle: true,
          hardwareType: true,
          latestState: { select: { dimoTokenId: true } },
        },
      });

      if (!vehicle) {
        console.error('PREFLIGHT_FAIL: member not found in DB', m);
        process.exit(1);
      }
      if (vehicle.registryLifecycle !== VehicleRegistryLifecycle.ACTIVE) {
        console.error(
          'PREFLIGHT_FAIL: vehicle not ACTIVE registry',
          m.vehicleId,
          vehicle.registryLifecycle,
        );
        process.exit(1);
      }

      const tokenId = vehicle.latestState?.dimoTokenId ?? null;
      if (tokenId == null) {
        console.error('PREFLIGHT_FAIL: missing dimoTokenId for member', m.vehicleId);
        process.exit(1);
      }
      if (!expectedTokens.has(tokenId)) {
        console.error(
          'PREFLIGHT_FAIL: tokenId %s not in expected R9 allowlist for vehicle %s',
          tokenId,
          m.vehicleId,
        );
        process.exit(1);
      }
      if (seenTokens.has(tokenId)) {
        console.error('PREFLIGHT_FAIL: duplicate tokenId in cohort mapping', tokenId);
        process.exit(1);
      }
      seenTokens.add(tokenId);
      console.log(
        'MEMBER_OK org=%s vehicle=%s tokenId=%s hardwareType=%s',
        m.organizationId,
        m.vehicleId,
        tokenId,
        vehicle.hardwareType,
      );
    }

    const excluded = await prisma.vehicleLatestState.findFirst({
      where: { dimoTokenId: excludedToken },
      select: { vehicleId: true, dimoTokenId: true, vehicle: { select: { organizationId: true } } },
    });
    if (excluded?.vehicle) {
      const inCohort = members.some(
        (m) =>
          m.vehicleId === excluded.vehicleId &&
          m.organizationId === excluded.vehicle.organizationId,
      );
      if (inCohort) {
        console.error(
          'PREFLIGHT_FAIL: excluded former-fleet token %s is present in cohort config',
          excludedToken,
        );
        process.exit(1);
      }
      console.log(
        'EXCLUDED_TOKEN_OK tokenId=%s maps to vehicle not in cohort',
        excludedToken,
      );
    } else {
      console.log('EXCLUDED_TOKEN_OK tokenId=%s has no latest-state row (acceptable)', excludedToken);
    }

    if (seenTokens.size !== expectedTokens.size) {
      console.error(
        'PREFLIGHT_FAIL: cohort token set mismatch expected=%s got=%s',
        [...expectedTokens].sort((a, b) => a - b).join(','),
        [...seenTokens].sort((a, b) => a - b).join(','),
      );
      process.exit(1);
    }

    console.log('P25_APD_SHADOW_COHORT_PRODUCTION_PREFLIGHT=PASS');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('PREFLIGHT_FAIL:', err);
  process.exit(1);
});
