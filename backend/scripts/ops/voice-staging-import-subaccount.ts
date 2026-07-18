/**
 * Import Twilio subaccount credentials for voice staging (IE1 workaround).
 *
 * Usage:
 *   cd backend
 *   VOICE_STAGING_PROVISION_ALLOW_PROD=1 \
 *   VOICE_STAGING_TWILIO_USE_PARENT_ACCOUNT=true \
 *   npm run voice:staging:import-subaccount -- --apply
 *
 * Or with Console-created subaccount:
 *   VOICE_STAGING_TWILIO_SUBACCOUNT_SID=AC... \
 *   VOICE_STAGING_TWILIO_AUTH_TOKEN=... \
 *   npm run voice:staging:import-subaccount -- --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import {
  isVoiceStagingOrganization,
  VOICE_STAGING_ORG_ID,
} from '../../src/modules/voice-assistant/staging/voice-staging.constants';
import { maskStagingOrgId } from '../../src/modules/voice-assistant/staging/voice-staging-preflight.util';
import { persistSubaccountCredentialsToEnvFile } from '../../src/modules/voice-assistant/staging/voice-staging-subaccount-env.util';
import { resolveVoiceStagingTwilioImportCredentials } from '../../src/modules/voice-assistant/staging/voice-staging-twilio-import.util';
import { TwilioTenantProvisioningService } from '../../src/modules/twilio/provisioning/twilio-tenant-provisioning.service';
import { SecretRefResolver } from '../../src/modules/twilio/secrets/secret-ref.resolver';
import { PrismaService } from '../../src/shared/database/prisma.service';

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

async function main() {
  const apply = parseApply();
  const orgId = process.env.VOICE_E2E_ORG_ID?.trim() || VOICE_STAGING_ORG_ID;
  if (!isVoiceStagingOrganization(orgId)) {
    throw new Error(`Refusing non-staging org: ${maskStagingOrgId(orgId)}`);
  }

  const importCreds = resolveVoiceStagingTwilioImportCredentials(process.env);
  if (!importCreds) {
    console.log(
      JSON.stringify(
        {
          dryRun: !apply,
          error: 'missing_import_credentials',
          hint:
            'Set VOICE_STAGING_TWILIO_SUBACCOUNT_SID + VOICE_STAGING_TWILIO_AUTH_TOKEN (Console subaccount) or VOICE_STAGING_TWILIO_USE_PARENT_ACCOUNT=true with parent TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          organizationId: maskStagingOrgId(orgId),
          source: importCreds.source,
          maskedAccountSid: `${importCreds.accountSid.slice(0, 4)}***${importCreds.accountSid.slice(-2)}`,
          note: 'Re-run with --apply to import credentials and persist env-json ref.',
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
    const twilio = app.get(TwilioTenantProvisioningService);
    const secretResolver = app.get(SecretRefResolver);
    const prisma = app.get(PrismaService);
    const config = app.get(ConfigService);

    const result = await twilio.importSubaccountCredentials({
      organizationId: orgId,
      accountSid: importCreds.accountSid,
      authToken: importCreds.authToken,
      source: importCreds.source,
      actor: {
        idempotencyKey: `voice-staging-import-${new Date().toISOString().slice(0, 10)}`,
        confirm: true,
        dryRun: false,
      },
    });

    const envFile =
      process.env.VOICE_STAGING_ENV_FILE?.trim() || '/opt/synqdrive/shared/backend.env';
    const account = await prisma.voiceProviderAccount.findFirst({
      where: { organizationId: orgId, archivedAt: null },
    });
    if (account?.secretRef && fs.existsSync(path.dirname(envFile))) {
      const creds = await secretResolver.resolveJson<Record<string, string>>(account.secretRef);
      persistSubaccountCredentialsToEnvFile(envFile, orgId, {
        accountSid: creds.accountSid,
        apiKeySid: creds.apiKeySid,
        apiKeySecret: creds.apiKeySecret,
        authToken: creds.authToken ?? importCreds.authToken,
      });
    }

    console.log(
      JSON.stringify(
        {
          organizationId: maskStagingOrgId(orgId),
          source: importCreds.source,
          maskedSubaccountRef: result.maskedSubaccountRef,
          secretRefRegistered: result.secretRefRegistered,
          parentAccountSid: maskStagingOrgId(config.get<string>('twilio.accountSid') ?? ''),
          warning:
            importCreds.source === 'parent_staging_fallback'
              ? 'Staging uses parent Twilio account — acceptable only for org-voice-staging-e2e until Console subaccount exists.'
              : undefined,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
