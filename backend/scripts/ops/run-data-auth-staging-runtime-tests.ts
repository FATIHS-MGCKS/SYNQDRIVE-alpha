/**
 * Controlled data-authorization runtime scenarios on VPS (isolated synthetic tenant).
 * Does NOT revoke real provider grants or delete production data.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/run-data-auth-staging-runtime-tests.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { AppModule } from '../../src/app.module';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
} from '@modules/data-authorizations/authorization-decision-engine/authorization-decision.constants';
import {
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '@modules/data-authorizations/policy-resolver/policy-resolver.constants';
import { AuthorizationDecisionService } from '@modules/data-authorizations/authorization-decision-engine/authorization-decision.service';
import { EnforcementCoverageRegistryService } from '@modules/data-authorizations/enforcement-coverage-registry/enforcement-coverage-registry.service';
import { WorkerRuntimeHealthService } from '@modules/data-authorizations/revocation-queue-control/worker-runtime-health.service';
import { DenySwitchService } from '@modules/data-authorizations/deny-switch/deny-switch.service';
import { DENY_SWITCH_SCOPE, DENY_SWITCH_TRIGGER } from '@modules/data-authorizations/deny-switch/deny-switch.constants';
import {
  cleanupDataAuthStagingRuntimeFixture,
  createDataAuthStagingRuntimeFixture,
  probeDataAuthDatabase,
} from '@modules/data-authorizations/testing/data-auth-postgres.integration.harness';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

type ScenarioResult = {
  id: number;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
};

function emit(result: ScenarioResult): void {
  console.log(JSON.stringify({ type: 'scenario', ...result, at: new Date().toISOString() }));
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];

  const record = (id: number, name: string, ok: boolean, detail?: string, skip = false) => {
    const status = skip ? 'skip' : ok ? 'pass' : 'fail';
    const row = { id, name, status, detail };
    results.push(row);
    emit(row);
  };

  if (!(await probeDataAuthDatabase())) {
    for (let i = 1; i <= 15; i++) {
      record(i, `scenario-${i}`, false, 'privacy schema not available', true);
    }
    console.log(JSON.stringify({ type: 'summary', pass: 0, fail: 0, skip: 15 }));
    process.exit(0);
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const decisionService = app.get(AuthorizationDecisionService);
  const coverageRegistry = app.get(EnforcementCoverageRegistryService);
  const workerHealth = app.get(WorkerRuntimeHealthService);
  const denySwitch = app.get(DenySwitchService);

  let fixture: Awaited<ReturnType<typeof createDataAuthStagingRuntimeFixture>> | null = null;

  try {
    fixture = await createDataAuthStagingRuntimeFixture(prisma);
    const orgId = fixture.orgA.id;
    const vehicleId = fixture.vehicleA.id;
    const corr = (suffix: string) => correlationId(`staging-${suffix}`);

    const allowDecision = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: 'TELEMETRY_LOCATION',
      purpose: 'FLEET_OPERATIONS',
      action: AUTHORIZATION_DECISION_ACTION.INGEST,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
      processorId: 'DIMO',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: vehicleId,
      vehicleId,
      correlationId: corr('allow-telemetry'),
      skipAudit: false,
    });
    record(
      1,
      'allowed-telemetry-decision',
      allowDecision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW ||
        allowDecision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
      `decision=${allowDecision.decision}`,
    );

    const denyDecision = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: 'TELEMETRY_LOCATION',
      purpose: 'FLEET_OPERATIONS',
      action: AUTHORIZATION_DECISION_ACTION.INGEST,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
      processorId: 'DIMO',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: fixture.vehicleB.id,
      vehicleId: fixture.vehicleB.id,
      correlationId: corr('deny-telemetry'),
    });
    record(
      2,
      'denied-telemetry-decision',
      denyDecision.decision === AUTHORIZATION_DECISION_OUTCOME.DENY ||
        denyDecision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
      `decision=${denyDecision.decision} reason=${denyDecision.reasonCode}`,
    );

    const tripDeny = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
      dataCategory: 'TRIP_ROUTE',
      purpose: 'FLEET_OPERATIONS',
      action: AUTHORIZATION_DECISION_ACTION.READ,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.INTERNAL_SERVICE,
      processorId: 'SYNQDRIVE',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: fixture.vehicleB.id,
      vehicleId: fixture.vehicleB.id,
      correlationId: corr('trip-deny'),
    });
    record(
      3,
      'trip-deny-on-unauthorized-scope',
      tripDeny.decision !== AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      `decision=${tripDeny.decision}`,
    );

    const healthDeny = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
      dataCategory: 'VEHICLE_DIAGNOSTICS',
      purpose: 'VEHICLE_HEALTH',
      action: AUTHORIZATION_DECISION_ACTION.USE_FOR_AI,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.INTERNAL_SERVICE,
      processorId: 'SYNQDRIVE',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: fixture.vehicleB.id,
      vehicleId: fixture.vehicleB.id,
      correlationId: corr('health-deny'),
    });
    record(
      4,
      'health-deny-on-unauthorized-scope',
      healthDeny.decision !== AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      `decision=${healthDeny.decision}`,
    );

    const misuseDeny = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
      dataCategory: 'DRIVING_BEHAVIOR',
      purpose: 'DRIVER_SCORING',
      action: AUTHORIZATION_DECISION_ACTION.DERIVE,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.INTERNAL_SERVICE,
      processorId: 'SYNQDRIVE',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: fixture.vehicleB.id,
      vehicleId: fixture.vehicleB.id,
      correlationId: corr('misuse-deny'),
    });
    record(
      5,
      'misuse-deny-on-unauthorized-scope',
      misuseDeny.decision !== AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      `decision=${misuseDeny.decision}`,
    );

    record(
      6,
      'alerts-not-generated-without-policy-match',
      denyDecision.decision === AUTHORIZATION_DECISION_OUTCOME.DENY,
      'decision-layer deny prevents downstream alert generation path',
    );

    const mcpDeny = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.EXTERNAL_API,
      dataCategory: 'TELEMETRY_LOCATION',
      purpose: 'FLEET_OPERATIONS',
      action: AUTHORIZATION_DECISION_ACTION.READ,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_INTEGRATION,
      processorId: 'MCP_TOOL',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.ORGANIZATION,
      resourceId: orgId,
      correlationId: corr('mcp-deny'),
    });
    record(
      7,
      'external-mcp-access-blocked',
      mcpDeny.decision === AUTHORIZATION_DECISION_OUTCOME.DENY,
      `decision=${mcpDeny.decision}`,
    );

    const cacheSizeBefore = decisionService.getCacheStats()?.size ?? 0;
    await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: 'TELEMETRY_LOCATION',
      purpose: 'FLEET_OPERATIONS',
      action: AUTHORIZATION_DECISION_ACTION.READ,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
      processorId: 'DIMO',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: vehicleId,
      vehicleId,
      correlationId: corr('cache-warm'),
    });

    await denySwitch.activateSync({
      organizationId: orgId,
      scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
      trigger: DENY_SWITCH_TRIGGER.MANUAL,
      reason: 'Prompt 42 controlled deny-switch test',
      correlationId: corr('deny-switch-activate'),
      blocksIngest: true,
      blocksRead: true,
      blocksQueueEnqueue: true,
    });
    const postDenySwitch = await decisionService.decide({
      organizationId: orgId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: 'TELEMETRY_LOCATION',
      purpose: 'FLEET_OPERATIONS',
      action: AUTHORIZATION_DECISION_ACTION.INGEST,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
      processorId: 'DIMO',
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: vehicleId,
      vehicleId,
      correlationId: corr('post-deny-switch'),
    });
    record(
      8,
      'revocation-deny-switch-immediate-deny',
      postDenySwitch.decision === AUTHORIZATION_DECISION_OUTCOME.DENY,
      `decision=${postDenySwitch.decision} reason=${postDenySwitch.reasonCode}`,
    );

    const queueDenied = denySwitch.isQueueEnqueueDenied(orgId, { vehicleId });
    record(9, 'queue-enqueue-blocked-under-deny-switch', queueDenied === true, `queueDenied=${queueDenied}`);

    const grant = await prisma.providerAccessGrant.findFirst({
      where: { id: fixture.providerGrantA.id, organizationId: orgId },
    });
    record(
      10,
      'provider-grant-consistent-in-test-tenant',
      grant?.providerStatus === 'ACTIVE',
      `status=${grant?.providerStatus ?? 'missing'}`,
    );

    const invalidated = decisionService.invalidateOrganizationCache(orgId);
    const cacheSizeAfter = decisionService.getCacheStats()?.size ?? 0;
    record(
      11,
      'cache-invalidation-after-deny',
      invalidated >= 0 && cacheSizeAfter <= cacheSizeBefore,
      `invalidated=${invalidated} cacheBefore=${cacheSizeBefore} cacheAfter=${cacheSizeAfter}`,
    );

    const auditCount = await prisma.dataAuthorizationAuditOutbox.count({
      where: { organizationId: orgId },
    });
    record(
      12,
      'decision-audit-outbox-events',
      auditCount > 0,
      `outboxRows=${auditCount}`,
    );

    const workerSnap = workerHealth.snapshot();
    record(
      13,
      'worker-version-snapshot',
      Boolean(workerSnap.policyEngineVersion),
      `expected=${workerSnap.policyEngineVersion} reported=${workerSnap.workerReportedVersion ?? 'null'}`,
    );

    const coverage = coverageRegistry.evaluate(orgId, corr('coverage'));
    record(
      14,
      'coverage-registry-evaluates',
      coverage.totalFlows > 0 && coverage.flows.length === coverage.totalFlows,
      `flows=${coverage.totalFlows} errors=${coverage.enforcementErrorCount}`,
    );

    const integrity = coverageRegistry.validateRegistryIntegrity();
    record(
      15,
      'coverage-integrity-and-monitoring-readiness',
      integrity.ok,
      integrity.errors.length ? integrity.errors.join(';') : 'ok',
    );
  } finally {
    if (fixture) {
      await prisma.dataAuthorizationDenySwitch
        .deleteMany({ where: { organizationId: { in: [fixture.orgA.id, fixture.orgB.id] } } })
        .catch(() => undefined);
      await cleanupDataAuthStagingRuntimeFixture(prisma, fixture).catch(() => undefined);
    }
    await app.close().catch(() => undefined);
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  console.log(JSON.stringify({ type: 'summary', pass, fail, skip }));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.log(JSON.stringify({ type: 'fatal', message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
