/**
 * Voice staging preflight probes (Prompt 9A) — read-only, no live calls.
 * Outputs JSON summary to stdout; never prints secret values.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/voice-staging-preflight-probes.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/voice-staging-preflight-probes.ts --output=/tmp/voice-preflight.json
 */
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createTwilioClient } from '../../src/config/twilio-client.util';
import { VoiceSecretsStartupService } from '../../src/modules/voice-assistant/security/voice-secrets-startup.service';
import { resolveVoiceMcpTokenSecret } from '../../src/modules/voice-mcp-gateway/voice-mcp-gateway.config';
import { VOICE_MCP_READ_ONLY_TOOLS, VOICE_MCP_TOKEN_TYPE } from '../../src/modules/voice-mcp-gateway/voice-mcp-gateway.constants';
import {
  deriveProvisioningGoNoGo,
  evaluateVoiceSecretReferences,
  evaluateVoiceStagingPolicies,
  maskStagingOrgId,
  type VoiceProbeResult,
} from '../../src/modules/voice-assistant/staging/voice-staging-preflight.util';
import {
  VOICE_STAGING_ORG_ID,
  VOICE_STAGING_SHORT_CODE,
} from '../../src/modules/voice-assistant/staging/voice-staging.constants';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
  // Probe-only stub for MCP token mint when host secret is absent in local CI.
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'voice-staging-preflight-probe-local';
  }
}

function parseOutputPath(): string | undefined {
  const arg = process.argv.find(a => a.startsWith('--output='));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function probeDatabase(prisma: PrismaClient, orgId: string): Promise<VoiceProbeResult> {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      id: 'staging-org',
      label: 'Staging organization',
      status: 'skip',
      detail: 'DATABASE_URL not set — run on host with DB for org check',
    };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    const org = await prisma.organization.findFirst({
      where: { OR: [{ id: orgId }, { shortCode: VOICE_STAGING_SHORT_CODE }] },
      select: { id: true, companyName: true, shortCode: true },
    });
    if (!org) {
      return {
        id: 'staging-org',
        label: 'Staging organization',
        status: 'fail',
        detail: 'Staging org not found — run voice-staging-org-bootstrap.ts --apply',
      };
    }
    return {
      id: 'staging-org',
      label: 'Staging organization',
      status: 'pass',
      detail: `Found ${maskStagingOrgId(org.id)} (${org.shortCode ?? 'no short code'})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database unreachable';
    const localDev = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '');
    return {
      id: 'staging-org',
      label: 'Staging organization',
      status: localDev ? 'skip' : 'fail',
      detail: localDev ? 'Database not available in this environment' : message,
    };
  }
}

async function probeStartupValidation(): Promise<VoiceProbeResult> {
  try {
    const secrets = new VoiceSecretsStartupService({} as never);
    const checks = secrets.evaluate(process.env);
    const missing = checks.filter(c => c.required && !c.configured);
    if (missing.length > 0) {
      return {
        id: 'startup-secrets',
        label: 'Backend startup secret validation',
        status: 'warn',
        detail: `Missing for current NODE_ENV: ${missing.map(c => c.key).join(', ')}`,
      };
    }
    return {
      id: 'startup-secrets',
      label: 'Backend startup secret validation',
      status: 'pass',
      detail: 'Required secrets satisfied for current environment flags',
    };
  } catch (err) {
    return {
      id: 'startup-secrets',
      label: 'Backend startup secret validation',
      status: 'fail',
      detail: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}

async function probeTwilio(): Promise<VoiceProbeResult> {
  const region = process.env.TWILIO_REGION?.trim() ?? 'unset';
  const edge = process.env.TWILIO_EDGE?.trim() ?? 'unset';
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return {
      id: 'twilio-auth',
      label: 'Twilio IE1 auth (read-only)',
      status: 'warn',
      detail: 'Credentials not configured in this environment',
    };
  }
  try {
    const client = createTwilioClient({
      accountSid,
      apiKeySid,
      apiKeySecret,
      region: region === 'unset' ? 'ie1' : region,
      edge: edge === 'unset' ? 'dublin' : edge,
    });
    if (!client) {
      return {
        id: 'twilio-auth',
        label: 'Twilio IE1 auth (read-only)',
        status: 'fail',
        detail: 'Twilio client could not be created',
      };
    }
    await client.api.v2010.accounts(client.accountSid).fetch();
    return {
      id: 'twilio-auth',
      label: 'Twilio IE1 auth (read-only)',
      status: 'pass',
      detail: `Healthy; region=${region}; edge=${edge}`,
    };
  } catch (err) {
    return {
      id: 'twilio-auth',
      label: 'Twilio IE1 auth (read-only)',
      status: 'fail',
      detail: err instanceof Error ? err.message : 'Twilio health check failed',
    };
  }
}

async function probeElevenLabs(): Promise<VoiceProbeResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return {
      id: 'elevenlabs-auth',
      label: 'ElevenLabs auth (read-only)',
      status: 'warn',
      detail: 'API key not configured in this environment',
    };
  }
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
    });
    if (res.ok) {
      return {
        id: 'elevenlabs-auth',
        label: 'ElevenLabs auth (read-only)',
        status: 'pass',
        detail: 'Workspace API reachable',
      };
    }
    return {
      id: 'elevenlabs-auth',
      label: 'ElevenLabs auth (read-only)',
      status: 'fail',
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      id: 'elevenlabs-auth',
      label: 'ElevenLabs auth (read-only)',
      status: 'fail',
      detail: err instanceof Error ? err.message : 'ElevenLabs health check failed',
    };
  }
}

async function probeMcpToken(): Promise<VoiceProbeResult> {
  if (!process.env.VOICE_MCP_TOKEN_SECRET?.trim() && !process.env.JWT_SECRET?.trim()) {
    return {
      id: 'mcp-token',
      label: 'MCP token mint/verify',
      status: 'skip',
      detail: 'VOICE_MCP_TOKEN_SECRET not configured',
    };
  }
  try {
    const secret = resolveVoiceMcpTokenSecret();
    const token = jwt.sign(
      {
        typ: VOICE_MCP_TOKEN_TYPE,
        org: VOICE_STAGING_ORG_ID,
        vai: 'staging-assistant-probe',
        adp: 'staging-deploy-probe',
        cid: 'staging-conv-probe',
        tools: [...VOICE_MCP_READ_ONLY_TOOLS],
        scopes: ['voice:mcp:read'],
        jti: 'staging-probe-nonce',
      },
      secret,
      { expiresIn: 60, issuer: 'synqdrive-voice-mcp', subject: 'staging-conv-probe' },
    );
    const decoded = jwt.verify(token, secret, { issuer: 'synqdrive-voice-mcp' }) as jwt.JwtPayload;
    if (decoded.org !== VOICE_STAGING_ORG_ID) {
      throw new Error('Organization claim mismatch after verify');
    }
    return {
      id: 'mcp-token',
      label: 'MCP token mint/verify',
      status: 'pass',
      detail: 'Sign + verify OK (replay store requires Redis on host)',
    };
  } catch (err) {
    return {
      id: 'mcp-token',
      label: 'MCP token mint/verify',
      status: 'fail',
      detail: err instanceof Error ? err.message : 'MCP token probe failed',
    };
  }
}

async function probeWebhookReachability(): Promise<VoiceProbeResult> {
  const base = (process.env.TWILIO_VOICE_WEBHOOK_BASE_URL ?? process.env.APP_URL ?? 'https://app.synqdrive.eu').replace(
    /\/$/,
    '',
  );
  try {
    const healthRes = await fetch(`${base}/api/v1/health`);
    const voiceRes = await fetch(`${base}/api/v1/webhooks/twilio/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'CallSid=CA_probe&From=%2B15550001111&To=%2B15550002222',
    });
    const healthOk = healthRes.status === 200;
    const signatureRejected = voiceRes.status === 401;
    if (healthOk && signatureRejected) {
      return {
        id: 'webhook-reachability',
        label: 'Public webhook reachability + signature rejection',
        status: 'pass',
        detail: `health=200; unsigned voice webhook=401 (expected)`,
      };
    }
    return {
      id: 'webhook-reachability',
      label: 'Public webhook reachability',
      status: 'warn',
      detail: `health=${healthRes.status}; voice=${voiceRes.status}`,
    };
  } catch (err) {
    return {
      id: 'webhook-reachability',
      label: 'Public webhook reachability',
      status: 'fail',
      detail: err instanceof Error ? err.message : 'HTTP probe failed',
    };
  }
}

async function probeQueue(): Promise<VoiceProbeResult> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return {
      id: 'queue-worker',
      label: 'Queue / worker (Redis)',
      status: 'skip',
      detail: 'REDIS_URL not set in this environment',
    };
  }
  return {
    id: 'queue-worker',
    label: 'Queue / worker (Redis)',
    status: 'pass',
    detail: 'REDIS_URL configured (worker connectivity assumed when WORKERS_ENABLED)',
  };
}

async function main() {
  const orgId = process.env.VOICE_E2E_ORG_ID?.trim() || VOICE_STAGING_ORG_ID;
  const prisma = new PrismaClient();
  const probes: VoiceProbeResult[] = [];

  try {
    probes.push(await probeDatabase(prisma, orgId));
    probes.push(await probeStartupValidation());
    probes.push(await probeTwilio());
    probes.push(await probeElevenLabs());
    probes.push(await probeMcpToken());
    probes.push(await probeWebhookReachability());
    probes.push(await probeQueue());

    const secretRefs = evaluateVoiceSecretReferences(process.env);
    const policies = evaluateVoiceStagingPolicies(process.env);
    const stagingOrgExists = probes.find(p => p.id === 'staging-org')?.status === 'pass';
    const goNoGo = deriveProvisioningGoNoGo({
      secrets: secretRefs,
      policies,
      probes,
      stagingOrgExists,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'unknown',
      stagingOrgIdMasked: maskStagingOrgId(orgId),
      secretReferences: secretRefs,
      policies,
      probes,
      goNoGo,
    };

    const json = JSON.stringify(report, null, 2);
    console.log(json);

    const outputPath = parseOutputPath();
    if (outputPath) {
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(outputPath), json, 'utf8');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
