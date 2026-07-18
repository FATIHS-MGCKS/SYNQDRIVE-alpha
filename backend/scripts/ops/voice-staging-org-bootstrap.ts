/**
 * Bootstrap dedicated internal Voice staging organization (Prompt 9A).
 * Idempotent — safe to re-run. Does NOT purchase numbers, deploy agents, or place calls.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/voice-staging-org-bootstrap.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/voice-staging-org-bootstrap.ts --apply
 *
 * Environment:
 *   VOICE_E2E_ORG_ID              defaults to org-voice-staging-e2e
 *   VOICE_STAGING_BOOTSTRAP_ALLOW_PROD=1  required to run against production DATABASE_URL patterns
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  BookingStatus,
  BusinessType,
  CustomerStatus,
  FuelType,
  PrismaClient,
  VehicleStatus,
  VoiceAssistantStatus,
  VoiceBudgetOverflowBehavior,
  VoiceDestinationRegionPolicy,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import {
  VOICE_STAGING_COMPANY_NAME,
  VOICE_STAGING_ORG_ID,
  VOICE_STAGING_ROLLOUT_REFERENCE,
  VOICE_STAGING_SHORT_CODE,
  VOICE_STAGING_SYNTHETIC_PREFIX,
} from '../../src/modules/voice-assistant/staging/voice-staging.constants';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const prisma = new PrismaClient();

function parseApply(): boolean {
  return process.argv.includes('--apply');
}

function assertSafeDatabaseTarget(): void {
  const url = process.env.DATABASE_URL ?? '';
  const looksProd =
    /synqdrive\.eu|prod|production|srv1374778|hstgr\.cloud/i.test(url) &&
    process.env.VOICE_STAGING_BOOTSTRAP_ALLOW_PROD !== '1';
  if (looksProd) {
    throw new Error(
      'Refusing to bootstrap on production-looking DATABASE_URL without VOICE_STAGING_BOOTSTRAP_ALLOW_PROD=1',
    );
  }
}

async function main() {
  const apply = parseApply();
  assertSafeDatabaseTarget();

  const orgId = process.env.VOICE_E2E_ORG_ID?.trim() || VOICE_STAGING_ORG_ID;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const plan = {
    orgId,
    shortCode: VOICE_STAGING_SHORT_CODE,
    companyName: VOICE_STAGING_COMPANY_NAME,
    budget: {
      monthlyBudgetCents: 500,
      dailyLimitCents: 100,
      maxConversationDurationSeconds: 300,
      maxConcurrentCalls: 1,
      allowedCountries: ['DE'],
    },
  };

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.organization.upsert({
      where: { id: orgId },
      create: {
        id: orgId,
        companyName: VOICE_STAGING_COMPANY_NAME,
        shortCode: VOICE_STAGING_SHORT_CODE,
        businessType: BusinessType.RENTAL,
        country: 'DE',
        timezone: 'Europe/Berlin',
        language: 'de',
        email: 'voice-staging-internal@synqdrive.invalid',
        phone: '+49 *** **00',
      },
      update: {
        companyName: VOICE_STAGING_COMPANY_NAME,
        shortCode: VOICE_STAGING_SHORT_CODE,
      },
    });

    await tx.voiceAssistant.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        name: 'Staging Voice Assistant',
        language: 'de',
        status: VoiceAssistantStatus.DRAFT,
        pstnProvider: 'TWILIO',
        telephonyEnabled: false,
        outboundEnabled: false,
        systemPrompt: 'Internal staging assistant — synthetic data only.',
        greetingMessage: 'Dies ist ein interner Staging-Assistent.',
      },
      update: {
        status: VoiceAssistantStatus.DRAFT,
        telephonyEnabled: false,
        outboundEnabled: false,
      },
    });

    const existingSub = await tx.voiceSubscription.findFirst({
      where: { organizationId: orgId, archivedAt: null },
    });
    if (!existingSub) {
      await tx.voiceSubscription.create({
        data: {
          organizationId: orgId,
          planCode: 'START',
          planCatalogVersion: '2026-07-17',
          planReference: VOICE_STAGING_ROLLOUT_REFERENCE,
          status: VoiceSubscriptionStatus.TRIAL,
          trialEndsAt: periodEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    await tx.voiceBudgetPolicy.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        monthlyBudgetCents: plan.budget.monthlyBudgetCents,
        dailyLimitCents: plan.budget.dailyLimitCents,
        maxConversationDurationSeconds: plan.budget.maxConversationDurationSeconds,
        maxConcurrentCalls: plan.budget.maxConcurrentCalls,
        allowedCountries: plan.budget.allowedCountries,
        destinationRegionPolicy: VoiceDestinationRegionPolicy.DE_EEA,
        overflowBehavior: VoiceBudgetOverflowBehavior.HARD_STOP,
        warnThresholdPct: 70,
        hardLimitThresholdPct: 100,
      },
      update: {
        monthlyBudgetCents: plan.budget.monthlyBudgetCents,
        dailyLimitCents: plan.budget.dailyLimitCents,
        maxConversationDurationSeconds: plan.budget.maxConversationDurationSeconds,
        maxConcurrentCalls: plan.budget.maxConcurrentCalls,
        allowedCountries: plan.budget.allowedCountries,
      },
    });

    const customerId = `${VOICE_STAGING_SYNTHETIC_PREFIX}customer`;
    await tx.customer.upsert({
      where: { id: customerId },
      create: {
        id: customerId,
        organizationId: orgId,
        firstName: 'Staging',
        lastName: 'Kunde',
        email: 'staging.customer@synqdrive.invalid',
        phone: '+49 *** **01',
        emailNormalized: 'staging.customer@synqdrive.invalid',
        phoneNormalized: '+49000000001',
        fullNameNormalized: 'staging kunde',
        status: CustomerStatus.ACTIVE,
      },
      update: { organizationId: orgId },
    });

    const vehicleId = `${VOICE_STAGING_SYNTHETIC_PREFIX}vehicle`;
    await tx.vehicle.upsert({
      where: { id: vehicleId },
      create: {
        id: vehicleId,
        organizationId: orgId,
        vin: 'STAGING00000000001',
        make: 'Synq',
        model: 'Staging',
        year: 2026,
        vehicleName: 'Staging Fahrzeug 01',
        fuelType: FuelType.ELECTRIC,
        licensePlate: 'STG-E2E1',
        status: VehicleStatus.AVAILABLE,
      },
      update: { organizationId: orgId },
    });

    const bookingId = `${VOICE_STAGING_SYNTHETIC_PREFIX}booking`;
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
    await tx.booking.upsert({
      where: { id: bookingId },
      create: {
        id: bookingId,
        organizationId: orgId,
        customerId,
        vehicleId,
        startDate: start,
        endDate: end,
        status: BookingStatus.CONFIRMED,
        totalPriceCents: 9900,
      },
      update: {
        organizationId: orgId,
        customerId,
        vehicleId,
      },
    });

    const voiceWorkflows = await tx.orgWorkflow.findMany({
      where: { organizationId: orgId, enabled: true },
      select: { id: true, scope: true },
    });
    for (const wf of voiceWorkflows) {
      const scope = wf.scope as { voiceAutomation?: unknown } | null;
      if (scope?.voiceAutomation) {
        await tx.orgWorkflow.update({
          where: { id: wf.id },
          data: { enabled: false, status: 'DISABLED' },
        });
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        applied: true,
        organizationId: orgId,
        shortCode: VOICE_STAGING_SHORT_CODE,
        rolloutReference: VOICE_STAGING_ROLLOUT_REFERENCE,
        note: 'No numbers purchased, no agent deployed, no calls started.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
