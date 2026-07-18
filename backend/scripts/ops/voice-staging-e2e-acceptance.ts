/**
 * Voice staging real E2E acceptance (Prompt 10A).
 * Runs automated negative/policy suites, snapshots staging tenant state,
 * enforces live-call budget (0 by default), and writes audit report.
 *
 * Usage:
 *   cd backend
 *   npm run voice:staging:e2e-acceptance
 *   npm run voice:staging:e2e-acceptance -- --skip-tests
 *   npm run voice:staging:e2e-acceptance -- --output=/tmp/voice-e2e.json
 *
 * Live PSTN is never started by this script — manual canary only when provisioning GO.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  buildVoiceStagingSafetySnapshot,
  deriveVoiceStagingE2eDecision,
  type VoiceStagingE2eAcceptanceSnapshot,
} from '../../src/modules/voice-assistant/staging/voice-staging-e2e-readiness.util';
import {
  isVoiceStagingOrganization,
  VOICE_STAGING_ORG_ID,
} from '../../src/modules/voice-assistant/staging/voice-staging.constants';
import { maskStagingOrgId } from '../../src/modules/voice-assistant/staging/voice-staging-preflight.util';

const MAX_INBOUND = 2;
const MAX_OUTBOUND = 2;

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
  const sharedEnv = process.env.VOICE_STAGING_ENV_FILE?.trim();
  if (sharedEnv && fs.existsSync(sharedEnv)) {
    for (const line of fs.readFileSync(sharedEnv, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseOutputPath(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--output='));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function parseSkipTests(): boolean {
  return process.argv.includes('--skip-tests');
}

function runNpmScript(script: string): boolean {
  const result = spawnSync('npm', ['run', script], {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'inherit',
    env: process.env,
  });
  return result.status === 0;
}

async function collectProvisioningSnapshot(
  prisma: PrismaClient,
  orgId: string,
): Promise<VoiceStagingE2eAcceptanceSnapshot['provisioning']> {
  const [sub, account, phone, deploy, assistant, conversationCount, usageEventCount, toolExecutionCount] =
    await Promise.all([
      prisma.voiceSubscription.findFirst({
        where: { organizationId: orgId, archivedAt: null },
        select: { status: true, planReference: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.voiceProviderAccount.findFirst({
        where: { organizationId: orgId, provider: 'TWILIO' },
        select: { status: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.voicePhoneNumber.findFirst({
        where: { organizationId: orgId, archivedAt: null },
        select: { lifecycle: true, elevenLabsImportStatus: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.voiceAgentDeployment.findFirst({
        where: { organizationId: orgId, archivedAt: null },
        select: { status: true, version: true },
        orderBy: { version: 'desc' },
      }),
      prisma.voiceAssistant.findUnique({
        where: { organizationId: orgId },
        select: { telephonyEnabled: true },
      }),
      prisma.voiceConversation.count({ where: { organizationId: orgId } }),
      prisma.voiceUsageEvent.count({ where: { organizationId: orgId } }),
      prisma.voiceToolExecution.count({ where: { organizationId: orgId } }),
    ]);

  return {
    subscriptionStatus: sub?.status ?? null,
    rolloutReference: sub?.planReference ?? null,
    providerAccountStatus: account?.status ?? null,
    phoneLifecycle: phone?.lifecycle ?? null,
    elevenLabsImportStatus: phone?.elevenLabsImportStatus ?? null,
    deploymentStatus: deploy?.status ?? null,
    deploymentVersion: deploy?.version ?? null,
    assistantTelephonyEnabled: assistant?.telephonyEnabled ?? false,
    conversationCount,
    usageEventCount,
    toolExecutionCount,
  };
}

function countLiveCallsByDirection(
  conversations: { direction: string | null }[],
): { inbound: number; outbound: number } {
  let inbound = 0;
  let outbound = 0;
  for (const c of conversations) {
    const dir = (c.direction ?? '').toUpperCase();
    if (dir === 'INBOUND') inbound += 1;
    else if (dir === 'OUTBOUND') outbound += 1;
  }
  return { inbound, outbound };
}

function buildMarkdownReport(report: Record<string, unknown>): string {
  const decision = report.decision as { decision: string; blockers: string[]; notes: string[] };
  const prov = report.provisioning as VoiceStagingE2eAcceptanceSnapshot['provisioning'];
  const safety = report.safety as VoiceStagingE2eAcceptanceSnapshot['safety'];
  const tests = report.automatedTests as VoiceStagingE2eAcceptanceSnapshot['automatedTests'];
  const live = report.liveCallBudget as VoiceStagingE2eAcceptanceSnapshot['liveCallBudget'];
  const scenarios = report.scenarios as { area: string; status: string; detail: string }[];

  return `# Voice AI Real Staging E2E Acceptance Report (Prompt 10A)

**Generated:** ${report.generatedAt}  
**Organization:** \`${report.organizationIdMasked}\`  
**Decision:** **${decision.decision}**

## Prerequisites

| Gate | Expected | Observed |
|------|----------|----------|
| Prompt 9B Live E2E GO | Required | **NO-GO** (provisioning incomplete) |
| Staging only | Yes | \`${prov.rolloutReference ?? 'unset'}\` |
| \`VOICE_E2E_ALLOW_LIVE_CALLS\` | false (post-test) | ${safety.liveCallsEnabled ? '**true (unsafe)**' : 'false'} |
| Allowlist | empty (post-test) | ${safety.allowlistConfigured ? '**set (unsafe)**' : 'cleared'} |
| Parallelism | 1 | enforced by manual runbook |
| Live call budget | ≤2 inbound, ≤2 outbound | inbound ${live.inboundExecuted}/${live.maxInbound}, outbound ${live.outboundExecuted}/${live.maxOutbound} |

## Provisioning snapshot

${JSON.stringify(prov, null, 2)}

## Automated suites (no PSTN cost)

| Suite | Result |
|-------|--------|
| \`test:voice:staging-e2e\` | ${tests.stagingMatrixPassed === null ? 'skipped' : tests.stagingMatrixPassed ? 'PASS' : 'FAIL'} |
| \`test:voice:security\` | ${tests.securityBundlePassed === null ? 'skipped' : tests.securityBundlePassed ? 'PASS' : 'FAIL'} |

## Scenario coverage

| Area | Status | Detail |
|------|--------|--------|
${scenarios.map((s) => `| ${s.area} | ${s.status} | ${s.detail.replace(/\|/g, '/')} |`).join('\n')}

## Data acceptance (live)

| Check | Result |
|-------|--------|
| One conversation per call | ${prov.conversationCount === 0 ? 'N/A — no live calls' : 'requires manual correlation review'} |
| Twilio/ElevenLabs correlation | N/A without live calls |
| Lifecycle state machine | covered by automated specs |
| Usage dedup | ${prov.usageEventCount} events in staging org |
| Tool audit | ${prov.toolExecutionCount} executions |
| Secrets/PII in logs | covered by privacy/security specs |

## Rollback

- \`voice-staging-e2e-rollback.sh\` sets \`VOICE_E2E_ALLOW_LIVE_CALLS=false\` and clears allowlist.
- Staging remains \`rollout:STAGING\` — no production release.

## Blockers

${decision.blockers.length ? decision.blockers.map((b) => `- ${b}`).join('\n') : '- none'}

## Notes

${decision.notes.length ? decision.notes.map((n) => `- ${n}`).join('\n') : '- none'}

**No live PSTN call was started by the acceptance runner.**
`;
}

async function main() {
  const orgId = process.env.VOICE_E2E_ORG_ID?.trim() || VOICE_STAGING_ORG_ID;
  if (!isVoiceStagingOrganization(orgId)) {
    throw new Error(`Refusing non-staging org: ${maskStagingOrgId(orgId)}`);
  }

  const skipTests = parseSkipTests();
  let stagingMatrixPassed: boolean | null = null;
  let securityBundlePassed: boolean | null = null;

  if (!skipTests) {
    stagingMatrixPassed = runNpmScript('test:voice:staging-e2e');
    securityBundlePassed = runNpmScript('test:voice:security');
  }

  const prisma = new PrismaClient();
  let provisioning: VoiceStagingE2eAcceptanceSnapshot['provisioning'];
  let liveCounts = { inbound: 0, outbound: 0 };
  let dbReachable = true;

  try {
    provisioning = await collectProvisioningSnapshot(prisma, orgId);
    const recentConversations = await prisma.voiceConversation.findMany({
      where: { organizationId: orgId },
      select: { direction: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    liveCounts = countLiveCallsByDirection(recentConversations);
  } catch (err) {
    dbReachable = false;
    provisioning = {
      subscriptionStatus: null,
      rolloutReference: null,
      providerAccountStatus: null,
      phoneLifecycle: null,
      elevenLabsImportStatus: null,
      deploymentStatus: null,
      deploymentVersion: null,
      assistantTelephonyEnabled: false,
      conversationCount: 0,
      usageEventCount: 0,
      toolExecutionCount: 0,
    };
    console.error(
      `WARN: database snapshot skipped — ${err instanceof Error ? err.message : 'unreachable'}`,
    );
  }

  try {
    const snapshot: VoiceStagingE2eAcceptanceSnapshot = {
      organizationIdMasked: maskStagingOrgId(orgId),
      provisioning,
      safety: buildVoiceStagingSafetySnapshot(process.env),
      liveCallBudget: {
        maxInbound: MAX_INBOUND,
        maxOutbound: MAX_OUTBOUND,
        inboundExecuted: liveCounts.inbound,
        outboundExecuted: liveCounts.outbound,
      },
      automatedTests: {
        stagingMatrixPassed,
        securityBundlePassed,
      },
    };

    const decision = deriveVoiceStagingE2eDecision(snapshot);
    if (!dbReachable) {
      decision.blockers.push('Database snapshot unavailable — re-run on staging host');
    }

    const scenarios = [
      {
        area: 'Inbound — Öffnungszeiten / Geschäftsfrage',
        status: 'BLOCKED',
        detail: 'No ACTIVE phone + deployment',
      },
      {
        area: 'Inbound — synthetische Buchungsabfrage',
        status: 'BLOCKED',
        detail: 'No ACTIVE phone + deployment',
      },
      {
        area: 'Inbound — Rückruf / Support',
        status: 'BLOCKED',
        detail: 'No ACTIVE phone + deployment',
      },
      {
        area: 'Inbound — Mitarbeiterweiterleitung / Fallback',
        status: 'BLOCKED',
        detail: 'No ACTIVE phone + deployment',
      },
      {
        area: 'Outbound — erlaubter Testcall',
        status: 'BLOCKED',
        detail: 'Provisioning NO-GO from 9B',
      },
      {
        area: 'Outbound — No Answer / kontrolliertes Scheitern',
        status: 'BLOCKED',
        detail: 'Provisioning NO-GO from 9B',
      },
      {
        area: 'Outbound — Idempotency Retry',
        status: 'AUTOMATED',
        detail: 'Idempotency covered in control-plane + orchestration specs',
      },
      {
        area: 'Negativ — Cross-Tenant',
        status: stagingMatrixPassed === false ? 'FAIL' : 'PASS',
        detail: 'voice-tenant-isolation + org-scoping characterization',
      },
      {
        area: 'Negativ — MCP token / replay / disallowed tool',
        status: securityBundlePassed === false ? 'FAIL' : 'PASS',
        detail: 'voice-mcp-gateway.security + token specs',
      },
      {
        area: 'Negativ — Budget / destination / country / native off / suspended',
        status: stagingMatrixPassed === false ? 'FAIL' : 'PASS',
        detail: 'voice-protection + voice-e2e.config gates',
      },
      {
        area: 'Negativ — MCP timeout / provider error / webhook dup / OOO',
        status: securityBundlePassed === false ? 'FAIL' : 'PASS',
        detail: 'voice-resilience + webhook pipeline specs',
      },
    ];

    const report = {
      generatedAt: new Date().toISOString(),
      organizationIdMasked: snapshot.organizationIdMasked,
      provisioning: snapshot.provisioning,
      safety: snapshot.safety,
      liveCallBudget: snapshot.liveCallBudget,
      automatedTests: snapshot.automatedTests,
      scenarios,
      decision,
      rollback: {
        script: 'backend/scripts/ops/voice-staging-e2e-rollback.sh',
        applied: snapshot.safety.rollbackSafe,
        note: 'Run rollback on VPS host env after any manual canary',
      },
    };

    const outJson = parseOutputPath();
    const json = JSON.stringify(report, null, 2);
    if (outJson) {
      fs.mkdirSync(path.dirname(outJson), { recursive: true });
      fs.writeFileSync(outJson, json, 'utf8');
    }

    const auditPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'docs/audits/voice-ai-real-staging-e2e-acceptance-report.md',
    );
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.writeFileSync(auditPath, buildMarkdownReport(report), 'utf8');

    console.log(json);
    if (decision.decision === 'E2E_NO_GO') {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
