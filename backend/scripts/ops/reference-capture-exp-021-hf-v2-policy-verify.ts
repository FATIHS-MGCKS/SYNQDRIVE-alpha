/**
 * EXP-021 — Verify effective HF Recovery V2 policy for canary tokens (read-only).
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { ReferenceCaptureConfig } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.config';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  resolveHfRecoveryPolicyForToken,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-recovery-v2.policy';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const audiToken = Number.parseInt(process.env.AUDI_TOKEN_ID ?? '187361', 10);
  const nonCanaryToken = Number.parseInt(process.env.NON_CANARY_TOKEN_ID ?? '999999', 10);

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });
  try {
    const rcConfig = app.get(ReferenceCaptureConfig);
    const base = rcConfig.getHfRecoveryPolicyConfig();
    const audiPolicy = rcConfig.resolveHfRecoveryPolicyForToken(audiToken);
    const nonCanaryPolicy = rcConfig.resolveHfRecoveryPolicyForToken(nonCanaryToken);

    const envBase = parseHfRecoveryPolicyV2ConfigFromEnv(process.env);

    console.log(
      JSON.stringify(
        {
          HF_RECOVERY_POLICY_V2_ENABLED_EFFECTIVE: base.mode === 'V2',
          HF_RECOVERY_POLICY_V2_CANARY_ONLY_EFFECTIVE: base.canaryOnly,
          HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS_EFFECTIVE: base.canaryTokenIds,
          EFFECTIVE_HF_POLICY_TOKEN_187361: audiPolicy.mode,
          NON_CANARY_TOKEN_ID: nonCanaryToken,
          NON_CANARY_EFFECTIVE_MODE: nonCanaryPolicy.mode,
          NON_CANARY_FAIL_CLOSED: nonCanaryPolicy.mode === 'LEGACY',
          ENV_PARSED_CANARY_TOKEN_IDS: envBase.canaryTokenIds,
        },
        null,
        2,
      ),
    );

    if (audiPolicy.mode !== 'V2') {
      throw new Error(`Audi token ${audiToken} effective policy is ${audiPolicy.mode}, expected V2`);
    }
    if (nonCanaryPolicy.mode !== 'LEGACY') {
      throw new Error(`Non-canary token ${nonCanaryToken} effective policy is ${nonCanaryPolicy.mode}, expected LEGACY`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('HF_V2_POLICY_VERIFY_FAILED', error);
  process.exit(1);
});
