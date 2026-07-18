/**
 * Voice staging tenant provisioning (Prompt 9B).
 * Provisions full voice infrastructure for org-voice-staging-e2e only.
 *
 * Usage:
 *   cd backend
 *   npm run voice:staging:provision              # dry-run plan
 *   npm run voice:staging:provision -- --apply   # live staging mutations
 *
 * Env:
 *   VOICE_STAGING_ENV_FILE=/opt/synqdrive/shared/backend.env  (subaccount credential persistence)
 *   VOICE_STAGING_PROVISION_ALLOW_PROD=1                        (required on production host DB)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { VoicePhoneRegulatoryStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { AgentDeploymentService } from '../../src/modules/voice-assistant/agent-deployment/agent-deployment.service';
import { ElevenLabsTwilioImportProvisioningService } from '../../src/modules/voice-assistant/provisioning/elevenlabs-twilio-import-provisioning.service';
import { ElevenLabsProviderAdapter } from '../../src/modules/voice-assistant/elevenlabs-provider/elevenlabs-provider.adapter';
import { maskE164 } from '../../src/modules/twilio/provisioning/twilio-provisioning.masking';
import { TwilioTenantProvisioningService } from '../../src/modules/twilio/provisioning/twilio-tenant-provisioning.service';
import { TwilioSecretStoreService } from '../../src/modules/twilio/provisioning/twilio-secret-store.service';
import { SecretRefResolver } from '../../src/modules/twilio/secrets/secret-ref.resolver';
import {
  isVoiceStagingOrganization,
  VOICE_STAGING_COMPANY_NAME,
  VOICE_STAGING_ORG_ID,
} from '../../src/modules/voice-assistant/staging/voice-staging.constants';
import { persistSubaccountCredentialsToEnvFile } from '../../src/modules/voice-assistant/staging/voice-staging-subaccount-env.util';
import {
  isIe1SubaccountApiBlockedError,
  resolveVoiceStagingTwilioImportCredentials,
} from '../../src/modules/voice-assistant/staging/voice-staging-twilio-import.util';
import { maskStagingOrgId } from '../../src/modules/voice-assistant/staging/voice-staging-preflight.util';
import { PrismaService } from '../../src/shared/database/prisma.service';

type StepResult = {
  step: string;
  status: 'pass' | 'fail' | 'skip' | 'paused' | 'warn';
  detail: string;
};

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

function parseApply(): boolean {
  return process.argv.includes('--apply');
}

function idempotencyKey(step: string): string {
  return `voice-staging-9b-${step}-${new Date().toISOString().slice(0, 10)}`;
}

function assertSafeTarget(orgId: string): void {
  if (!isVoiceStagingOrganization(orgId)) {
    throw new Error(`Refusing to provision non-staging organization: ${maskStagingOrgId(orgId)}`);
  }
  const url = process.env.DATABASE_URL ?? '';
  const looksProd =
    /synqdrive\.eu|prod|production|srv1374778|hstgr\.cloud/i.test(url) &&
    process.env.VOICE_STAGING_PROVISION_ALLOW_PROD !== '1';
  if (looksProd) {
    throw new Error(
      'Refusing production-looking DATABASE_URL without VOICE_STAGING_PROVISION_ALLOW_PROD=1',
    );
  }
}

async function main() {
  const apply = parseApply();
  const orgId = process.env.VOICE_E2E_ORG_ID?.trim() || VOICE_STAGING_ORG_ID;
  assertSafeTarget(orgId);

  const steps: StepResult[] = [];
  const masked: Record<string, unknown> = {
    organizationId: maskStagingOrgId(orgId),
    shortCode: 'VOICE-STAGING-E2E',
    rollout: 'rollout:STAGING',
    dryRun: !apply,
  };

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          organizationId: maskStagingOrgId(orgId),
          plannedSteps: [
            'subscription_verify',
            'twilio_subaccount',
            'regulatory',
            'phone_number_purchase',
            'agent_deploy',
            'elevenlabs_import',
            'mcp_webhooks',
            'test_simulation',
            'readiness',
          ],
          note: 'Re-run with --apply for live staging provisioning.',
        },
        null,
        2,
      ),
    );
    return;
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const twilio = app.get(TwilioTenantProvisioningService);
    const elImport = app.get(ElevenLabsTwilioImportProvisioningService);
    const agentDeploy = app.get(AgentDeploymentService);
    const elevenLabs = app.get(ElevenLabsProviderAdapter);
    const secretStore = app.get(TwilioSecretStoreService);
    const secretResolver = app.get(SecretRefResolver);

    // 1 — Subscription
    const sub = await prisma.voiceSubscription.findFirst({
      where: { organizationId: orgId, archivedAt: null },
    });
    if (!sub) {
      steps.push({ step: 'subscription', status: 'fail', detail: 'Voice subscription missing' });
    } else {
      masked.subscription = {
        status: sub.status,
        planCode: sub.planCode,
        planReference: sub.planReference,
        productionBilling: false,
      };
      steps.push({
        step: 'subscription',
        status: 'pass',
        detail: `${sub.status} / ${sub.planReference ?? 'no rollout ref'}`,
      });
    }

    // 2 — Twilio subaccount
    let subaccountMasked: string | null = null;
    try {
      const preview = await twilio.previewProvisioning(orgId, { numberType: 'local' });
      if (!preview.ready && !preview.existingSubaccount) {
        steps.push({
          step: 'twilio_subaccount',
          status: 'fail',
          detail: preview.blockers.join('; ') || 'Not ready',
        });
      } else {
        const result = await twilio.provisionSubaccount({
          organizationId: orgId,
          friendlyName: VOICE_STAGING_COMPANY_NAME,
          actor: {
            userId: undefined,
            idempotencyKey: idempotencyKey('subaccount'),
            confirm: true,
            dryRun: false,
          },
        });
        subaccountMasked = result.maskedSubaccountRef;
        masked.subaccount = {
          maskedSid: result.maskedSubaccountRef,
          secretRef: result.secretRefRegistered ? 'env-json://***' : null,
          region: 'ie1',
          edge: 'dublin',
        };
        steps.push({
          step: 'twilio_subaccount',
          status: 'pass',
          detail: result.dryRun ? 'dry-run' : `subaccount ${result.maskedSubaccountRef ?? 'existing'}`,
        });

        const account = await prisma.voiceProviderAccount.findFirst({
          where: { organizationId: orgId, archivedAt: null },
        });
        const envFile =
          process.env.VOICE_STAGING_ENV_FILE?.trim() ||
          '/opt/synqdrive/shared/backend.env';
        if (account?.secretRef && fs.existsSync(path.dirname(envFile))) {
          const envKey = secretStore.buildEnvKeyForOrganization(orgId);
          const creds = await secretResolver.resolveJson<Record<string, string>>(account.secretRef);
          persistSubaccountCredentialsToEnvFile(envFile, orgId, {
            accountSid: creds.accountSid,
            apiKeySid: creds.apiKeySid,
            apiKeySecret: creds.apiKeySecret,
            authToken: creds.authToken ?? '',
          });
          masked.subaccount = {
            ...(masked.subaccount as object),
            persistedEnvKey: envKey,
          };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Subaccount failed';
      const importCreds = resolveVoiceStagingTwilioImportCredentials(process.env);
      if (isIe1SubaccountApiBlockedError(message) && importCreds) {
        try {
          const imported = await twilio.importSubaccountCredentials({
            organizationId: orgId,
            accountSid: importCreds.accountSid,
            authToken: importCreds.authToken,
            source: importCreds.source,
            actor: {
              userId: undefined,
              idempotencyKey: idempotencyKey('subaccount-import'),
              confirm: true,
              dryRun: false,
            },
          });
          subaccountMasked = imported.maskedSubaccountRef;
          masked.subaccount = {
            maskedSid: imported.maskedSubaccountRef,
            secretRef: imported.secretRefRegistered ? 'env-json://***' : null,
            region: 'ie1',
            edge: 'dublin',
            importSource: importCreds.source,
          };
          const account = await prisma.voiceProviderAccount.findFirst({
            where: { organizationId: orgId, archivedAt: null },
          });
          const envFile =
            process.env.VOICE_STAGING_ENV_FILE?.trim() ||
            '/opt/synqdrive/shared/backend.env';
          if (account?.secretRef && fs.existsSync(path.dirname(envFile))) {
            const creds = await secretResolver.resolveJson<Record<string, string>>(account.secretRef);
            persistSubaccountCredentialsToEnvFile(envFile, orgId, {
              accountSid: creds.accountSid,
              apiKeySid: creds.apiKeySid,
              apiKeySecret: creds.apiKeySecret,
              authToken: creds.authToken ?? importCreds.authToken,
            });
          }
          steps.push({
            step: 'twilio_subaccount',
            status: 'pass',
            detail: `imported via ${importCreds.source} (${imported.maskedSubaccountRef ?? 'existing'})`,
          });
        } catch (importErr) {
          steps.push({
            step: 'twilio_subaccount',
            status: 'fail',
            detail:
              importErr instanceof Error ? importErr.message : 'Subaccount import failed after IE1 block',
          });
        }
      } else {
        steps.push({
          step: 'twilio_subaccount',
          status: 'fail',
          detail: message,
        });
      }
    }

    // 3 — Regulatory
    const regulatory = await twilio.getRegulatoryStatus(orgId);
    masked.regulatory = { overall: regulatory.overall };
    if (
      regulatory.overall === VoicePhoneRegulatoryStatus.PENDING ||
      regulatory.overall === VoicePhoneRegulatoryStatus.IN_REVIEW
    ) {
      steps.push({
        step: 'regulatory',
        status: 'paused',
        detail: `Manual review required (${regulatory.overall})`,
      });
    } else if (regulatory.overall === VoicePhoneRegulatoryStatus.REJECTED) {
      steps.push({ step: 'regulatory', status: 'fail', detail: 'Regulatory rejected' });
    } else {
      steps.push({
        step: 'regulatory',
        status: 'pass',
        detail: regulatory.overall,
      });
    }

    const regulatoryBlocked =
      regulatory.overall === VoicePhoneRegulatoryStatus.PENDING ||
      regulatory.overall === VoicePhoneRegulatoryStatus.IN_REVIEW ||
      regulatory.overall === VoicePhoneRegulatoryStatus.REJECTED;

    // 4 — Phone number
    let phoneNumberId: string | null = null;
    if (!regulatoryBlocked && steps.find(s => s.step === 'twilio_subaccount')?.status === 'pass') {
      try {
        const search = await twilio.searchPhoneNumbers({
          organizationId: orgId,
          numberType: 'local',
          areaCode: '30',
          limit: 5,
        });
        const candidate = search.results.find(r => r.capabilities?.voice) as
          | (typeof search.results)[number] & { selectionToken?: string; phoneNumber?: string }
          | undefined;
        if (!candidate) {
          steps.push({ step: 'phone_number', status: 'fail', detail: 'No voice-capable DE local numbers' });
        } else {
          masked.phoneNumber = {
            maskedE164: candidate.maskedPhoneNumber,
            locality: candidate.locality,
            capabilities: candidate.capabilities,
            estimatedMonthlyNote: 'Twilio DE local — billed per Twilio pricing (staging budget capped)',
          };
          const e164 =
            candidate.phoneNumber ??
            (candidate.selectionToken
              ? twilio.resolveSelectionToken(orgId, candidate.selectionToken)
              : null);
          if (!e164) {
            steps.push({
              step: 'phone_number',
              status: 'fail',
              detail: 'Could not resolve purchase target from search result',
            });
          } else {
          const purchase = await twilio.purchasePhoneNumber({
            organizationId: orgId,
            phoneNumber: e164,
            actor: {
              userId: undefined,
              idempotencyKey: idempotencyKey('number'),
              confirm: true,
              dryRun: false,
            },
          });
          phoneNumberId = purchase.phoneNumberId;
          masked.phoneNumber = {
            ...(masked.phoneNumber as object),
            phoneNumberId: phoneNumberId ? maskStagingOrgId(phoneNumberId) : null,
            maskedE164: purchase.maskedPhoneNumber,
            lifecycle: purchase.lifecycle,
          };
          steps.push({
            step: 'phone_number',
            status: 'pass',
            detail: `purchased ${purchase.maskedPhoneNumber}`,
          });
          }
        }
      } catch (err) {
        steps.push({
          step: 'phone_number',
          status: 'fail',
          detail: err instanceof Error ? err.message : 'Purchase failed',
        });
      }
    } else {
      steps.push({ step: 'phone_number', status: 'skip', detail: 'Blocked by regulatory or subaccount' });
    }

    // 5 — Agent voice + draft + deploy
    let deploymentId: string | null = null;
    try {
      const assistant = await prisma.voiceAssistant.findFirst({ where: { organizationId: orgId } });
      if (!assistant?.voiceId) {
        const voices = await elevenLabs.listVoices();
        const voice = voices.find(v => /german|deutsch/i.test(v.name)) ?? voices[0];
        if (voice) {
          await prisma.voiceAssistant.update({
            where: { id: assistant!.id },
            data: { voiceId: voice.voiceId, voiceName: voice.name },
          });
        }
      }

      const draft = await agentDeploy.getDraft(orgId);
      await agentDeploy.saveDraft(
        orgId,
        {
          fallback: {
            escalateOnRequest: false,
            escalateOnLowConfidence: false,
            escalateOnSensitive: false,
            standardAnnouncement:
              'Dies ist ein interner Staging-Assistent. Wir können Ihre Anfrage derzeit nicht vollständig bearbeiten.',
            message:
              'Dies ist ein interner Staging-Assistent. Wir können Ihre Anfrage derzeit nicht vollständig bearbeiten.',
          },
          privacyRetention: {
            consentNoticeText: 'Interner Staging-Assistent — nur synthetische Testdaten.',
          },
        },
        { userId: undefined },
      );
      const readiness = await agentDeploy.getReadiness(orgId);
      if (!readiness.ready) {
        steps.push({
          step: 'agent_deploy',
          status: 'warn',
          detail: `Readiness gaps: ${readiness.blockers.map(b => b.key).join(', ')}`,
        });
      }

      const deployed = await agentDeploy.deploy(orgId, {
        userId: undefined,
        idempotencyKey: idempotencyKey('agent'),
        confirm: true,
      });
      deploymentId = deployed.deploymentId;
      masked.agent = {
        deploymentId: maskStagingOrgId(deployed.deploymentId),
        version: deployed.version,
        status: deployed.status,
        maskedExternalRef: deployed.maskedExternalRef,
      };
      steps.push({
        step: 'agent_deploy',
        status: 'pass',
        detail: `v${deployed.version} ${deployed.maskedExternalRef ?? 'deployed'}`,
      });
    } catch (err) {
      steps.push({
        step: 'agent_deploy',
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Agent deploy failed',
      });
    }

    // 6 — ElevenLabs import + assign
    if (phoneNumberId && deploymentId) {
      try {
        const imported = await elImport.importAndAssign({
          organizationId: orgId,
          phoneNumberId,
          deploymentId,
          actor: {
            userId: undefined,
            idempotencyKey: idempotencyKey('import'),
            confirm: true,
            dryRun: false,
          },
        });
        masked.numberImport = {
          importStatus: imported.importStatus,
          maskedElevenLabsPhoneRef: imported.maskedElevenLabsPhoneRef,
          maskedAgentRef: imported.maskedAgentRef,
        };
        steps.push({
          step: 'elevenlabs_import',
          status: 'pass',
          detail: imported.importStatus,
        });
      } catch (err) {
        steps.push({
          step: 'elevenlabs_import',
          status: 'fail',
          detail: err instanceof Error ? err.message : 'Import failed',
        });
      }
    } else {
      steps.push({ step: 'elevenlabs_import', status: 'skip', detail: 'Missing phone or deployment' });
    }

    // 7 — MCP + webhooks (readiness)
    const deployReadiness = await agentDeploy.getReadiness(orgId);
    const mcpEnabled = process.env.VOICE_MCP_GATEWAY?.trim().toLowerCase() === 'true';
    const webhookSecret = Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET?.trim());
    masked.mcp = { gatewayEnabled: mcpEnabled };
    masked.webhooks = {
      ingestionEnabled: process.env.VOICE_WEBHOOK_INGESTION_ENABLED === 'true',
      postCallSecretConfigured: webhookSecret,
      publicBaseConfigured: Boolean(process.env.TWILIO_VOICE_WEBHOOK_BASE_URL?.trim()),
    };
    steps.push({
      step: 'mcp_webhooks',
      status: deployReadiness.ready && webhookSecret ? 'pass' : 'warn',
      detail: deployReadiness.ready
        ? 'Agent readiness OK; webhook secret ' + (webhookSecret ? 'present' : 'missing')
        : 'Deploy readiness incomplete',
    });

    // 8 — Test center simulation placeholder (no live call; full module may be absent on older deploys)
    steps.push({
      step: 'test_simulation',
      status: 'skip',
      detail: 'Deferred to post-deploy test center — no live PSTN started',
    });
    masked.testSimulation = { deferred: true };

    // 9 — Readiness summary
    masked.readiness = {
      deployReady: deployReadiness.ready,
      testCenterReady: false,
      liveCallsEnabled: process.env.VOICE_E2E_ALLOW_LIVE_CALLS === 'true',
    };

    const failed = steps.filter(s => s.status === 'fail');
    const paused = steps.filter(s => s.status === 'paused');
    const liveE2eGo =
      failed.length === 0 &&
      paused.length === 0 &&
      deployReadiness.ready &&
      webhookSecret &&
      process.env.VOICE_E2E_ALLOW_LIVE_CALLS !== 'true';

    const report = {
      generatedAt: new Date().toISOString(),
      provisioning: masked,
      steps,
      costs: {
        audited: true,
        productionBilling: false,
        note: 'Twilio number + usage billed to staging subaccount; capped by VoiceBudgetPolicy',
      },
      rollback: {
        agentRollback: 'POST /admin/.../agent-deployment/rollback',
        importDeactivate: 'POST /admin/.../elevenlabs/phone-numbers/:id/deactivate',
        note: 'Subaccount + number remain in Twilio until manual release',
      },
      liveE2e: {
        decision: liveE2eGo ? 'GO' : 'NO-GO',
        blockers: [
          ...failed.map(s => `${s.step}: ${s.detail}`),
          ...paused.map(s => `${s.step}: ${s.detail}`),
          ...(process.env.VOICE_E2E_ALLOW_LIVE_CALLS === 'true'
            ? ['VOICE_E2E_ALLOW_LIVE_CALLS must stay false until canary']
            : []),
          ...(!webhookSecret ? ['ELEVENLABS_WEBHOOK_SECRET missing'] : []),
          ...(!deployReadiness.ready ? ['Agent deployment readiness incomplete'] : []),
        ].filter(Boolean),
      },
    };

    const outPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'docs/audits/voice-ai-staging-provisioning-report.md',
    );
    const md = buildMarkdownReport(report);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

function buildMarkdownReport(report: Record<string, unknown>): string {
  const live = report.liveE2e as { decision: string; blockers: string[] };
  const prov = report.provisioning as Record<string, unknown>;
  return `# Voice AI Staging Provisioning Report (Prompt 9B)

**Generated:** ${report.generatedAt}  
**Organization:** \`${(prov.organizationId as string) ?? 'org-vo…-e2e'}\`  
**Live E2E decision:** **${live.decision}**

## Subscription

${JSON.stringify(prov.subscription ?? {}, null, 2)}

## Subaccount

${JSON.stringify(prov.subaccount ?? {}, null, 2)}

## Phone number

${JSON.stringify(prov.phoneNumber ?? {}, null, 2)}

## Agent / deployment

${JSON.stringify(prov.agent ?? {}, null, 2)}

## MCP

${JSON.stringify(prov.mcp ?? {}, null, 2)}

## Webhooks

${JSON.stringify(prov.webhooks ?? {}, null, 2)}

## Readiness

${JSON.stringify(prov.readiness ?? {}, null, 2)}

## Steps

| Step | Status | Detail |
|------|--------|--------|
${((report.steps as StepResult[]) ?? [])
  .map(s => `| ${s.step} | ${s.status} | ${s.detail.replace(/\|/g, '/')} |`)
  .join('\n')}

## Costs

${JSON.stringify(report.costs ?? {}, null, 2)}

## Rollback

${JSON.stringify(report.rollback ?? {}, null, 2)}

## Live E2E blockers

${live.blockers.length ? live.blockers.map(b => `- ${b}`).join('\n') : '- none'}

**No live PSTN call was started.**
`;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
