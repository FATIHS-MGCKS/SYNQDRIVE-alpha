import {
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import { LongitudinalInputReaderService } from './longitudinal-input.reader';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';

const ORG = '11111111-1111-1111-1111-111111111111';
const VEHICLE = '22222222-2222-2222-2222-222222222222';

function buildSession(restSessionId: string, anchorAt: Date) {
  return {
    id: restSessionId,
    organizationId: ORG,
    vehicleId: VEHICLE,
    anchorAt,
    sessionStatus: BatteryRestSessionStatus.ENDED,
    endReason: null,
    openedAt: anchorAt,
    endedAt: anchorAt,
  };
}

function buildFeatureRow(input: {
  restSessionId: string;
  rowId: string;
  inputSummary: Record<string, unknown>;
  featureModelVersion?: string;
  retentionPolicyVersion?: string;
  chargeOpportunityPolicyVersion?: string;
  numberOfValidRestPoints?: number;
  observationSpanMs?: number | null;
  missingRungCount?: number | null;
  chargeOpportunityClass?: BatteryRestSessionChargeOpportunityClass;
}) {
  return {
    id: input.rowId,
    organizationId: ORG,
    vehicleId: VEHICLE,
    restSessionId: input.restSessionId,
    featureModelVersion: input.featureModelVersion ?? 'persisted-model-v-test',
    retentionPolicyVersion: input.retentionPolicyVersion ?? 'persisted-retention-v-test',
    chargeOpportunityPolicyVersion:
      input.chargeOpportunityPolicyVersion ?? 'persisted-charge-v-test',
    semanticRevision: 1,
    inputDigest: 'digest-test',
    inputSummary: input.inputSummary,
    computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
    sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
    chargeOpportunityClass:
      input.chargeOpportunityClass ?? BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    shutdownToFirstRestDeltaMv: null,
    robustRestSlopeMvPerHour: null,
    minimumRestVoltageMv: 12000,
    maximumRestVoltageMv: 12100,
    medianRestVoltageMv: 12050,
    restVoltageVarianceMv2: null,
    numberOfValidRestPoints: input.numberOfValidRestPoints ?? 1,
    maxActualRestAgeMs: 1000,
    maxInterObservationGapMs: 500,
    observationSpanMs: input.observationSpanMs ?? 100,
    missingRungCount: input.missingRungCount ?? 5,
    computedAt: new Date(),
    createdAt: new Date(),
  };
}

function mockReaderPrisma(input: {
  sessions: ReturnType<typeof buildSession>[];
  features: ReturnType<typeof buildFeatureRow>[];
}) {
  const create = jest.fn();
  const update = jest.fn();
  const deleteFn = jest.fn();
  const upsert = jest.fn();
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        batteryRestSession: {
          findMany: jest.fn().mockResolvedValue(input.sessions),
          create,
          update,
          delete: deleteFn,
          upsert,
        },
        $queryRaw: jest.fn().mockResolvedValue(input.features),
      }),
    ),
    batteryRestSession: { create, update, delete: deleteFn, upsert },
    batteryRestSessionFeature: { create, update, delete: deleteFn, upsert },
  } as unknown as PrismaService;
  return { prisma, writeSpies: { create, update, deleteFn, upsert } };
}

describe('LongitudinalInputReaderService contract (D1.1)', () => {
  it('NO_CANONICAL_ROW excludes without INPUT_CONTRACT_VERSION_UNRESOLVED', async () => {
    const session = buildSession('33333333-3333-3333-3333-333333333333', new Date());
    const { prisma } = mockReaderPrisma({ sessions: [session], features: [] });
    const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: ORG,
      vehicleId: VEHICLE,
      sessionLimit: 10,
    });
    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      const item = outcome.result.sessions[0];
      expect(item.quality.inclusionMode).toBe('EXCLUDED');
      expect(item.quality.exclusionReasons).toEqual(['NO_CANONICAL_ROW']);
    }
  });

  it('preserves persisted column versions when input contract is UNRESOLVED', async () => {
    const sessionId = '44444444-4444-4444-4444-444444444444';
    const session = buildSession(sessionId, new Date());
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: ORG,
      vehicleId: VEHICLE,
      restSessionId: sessionId,
      inputContractVersion: 'WRONG_CONTRACT',
    });
    const feature = buildFeatureRow({
      restSessionId: sessionId,
      rowId: 'feat-1',
      inputSummary: summary,
    });
    const { prisma } = mockReaderPrisma({ sessions: [session], features: [feature] });
    const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: ORG,
      vehicleId: VEHICLE,
      sessionLimit: 10,
    });
    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      const item = outcome.result.sessions[0];
      expect(item.version).toEqual({
        featureModelVersion: 'persisted-model-v-test',
        retentionPolicyVersion: 'persisted-retention-v-test',
        chargeOpportunityPolicyVersion: 'persisted-charge-v-test',
        inputContractVersion: null,
        inputContractResolution: 'UNRESOLVED',
      });
      expect(item.quality.exclusionReasons).toEqual([
        'INPUT_CONTRACT_VERSION_UNRESOLVED',
      ]);
      expect(item.features?.chargeOpportunityClass).toBe(
        BatteryRestSessionChargeOpportunityClass.UNKNOWN,
      );
    }
  });

  it('resolves inputContractVersion from persisted inputSummary when valid', async () => {
    const sessionId = '55555555-5555-5555-5555-555555555555';
    const session = buildSession(sessionId, new Date());
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: ORG,
      vehicleId: VEHICLE,
      restSessionId: sessionId,
    });
    const feature = buildFeatureRow({
      restSessionId: sessionId,
      rowId: 'feat-2',
      inputSummary: summary,
      featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
      retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
      chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    });
    const { prisma } = mockReaderPrisma({ sessions: [session], features: [feature] });
    const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: ORG,
      vehicleId: VEHICLE,
      sessionLimit: 10,
    });
    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      const item = outcome.result.sessions[0];
      expect(item.version?.inputContractResolution).toBe('RESOLVED');
      expect(item.version?.inputContractVersion).toBe('M3_3C_FEATURE_INPUT_V1');
      expect(item.quality.inclusionMode).toBe('DEFAULT');
    }
  });

  it.each([
    [BatteryRestSessionChargeOpportunityClass.SUFFICIENT, 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'],
    [BatteryRestSessionChargeOpportunityClass.PARTIAL, 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002'],
    [BatteryRestSessionChargeOpportunityClass.INSUFFICIENT, 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003'],
    [BatteryRestSessionChargeOpportunityClass.UNKNOWN, 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004'],
  ] as const)('preserves chargeOpportunityClass=%s without D1 exclusion', async (chargeClass, sessionId) => {
    const session = buildSession(sessionId, new Date());
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: ORG,
      vehicleId: VEHICLE,
      restSessionId: sessionId,
    });
    const feature = buildFeatureRow({
      restSessionId: sessionId,
      rowId: `feat-${chargeClass}`,
      inputSummary: summary,
      chargeOpportunityClass: chargeClass,
      featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
      retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
      chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    });
    const { prisma } = mockReaderPrisma({ sessions: [session], features: [feature] });
    const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: ORG,
      vehicleId: VEHICLE,
      sessionLimit: 10,
    });
    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      expect(outcome.result.sessions[0].features?.chargeOpportunityClass).toBe(chargeClass);
      expect(outcome.result.sessions[0].quality.inclusionMode).toBe('DEFAULT');
    }
  });

  it('does not exclude low scientific quality scalars in D1', async () => {
    const sessionId = '77777777-7777-7777-7777-777777777777';
    const session = buildSession(sessionId, new Date());
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: ORG,
      vehicleId: VEHICLE,
      restSessionId: sessionId,
    });
    const feature = buildFeatureRow({
      restSessionId: sessionId,
      rowId: 'feat-low-quality',
      inputSummary: summary,
      numberOfValidRestPoints: 1,
      observationSpanMs: 10,
      missingRungCount: 99,
      featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
      retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
      chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    });
    const { prisma } = mockReaderPrisma({ sessions: [session], features: [feature] });
    const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: ORG,
      vehicleId: VEHICLE,
      sessionLimit: 10,
    });
    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      const item = outcome.result.sessions[0];
      expect(item.features?.numberOfValidRestPoints).toBe(1);
      expect(item.features?.observationSpanMs).toBe(10);
      expect(item.features?.missingRungCount).toBe(99);
      expect(item.quality.inclusionMode).toBe('DEFAULT');
    }
  });

  it.each([
    ['SELECTED', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001'],
    ['UNAVAILABLE', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002'],
    ['AMBIGUOUS', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000003'],
  ] as const)(
    'preserves anchorResolution %s without whole-session exclusion',
    async (anchorStatus, sessionId) => {
      const session = buildSession(sessionId, new Date());
      const summary = buildMinimalLongitudinalInputSummary({
        organizationId: ORG,
        vehicleId: VEHICLE,
        restSessionId: sessionId,
        anchorResolutionStatus: anchorStatus,
      });
      const feature = buildFeatureRow({
        restSessionId: sessionId,
        rowId: `feat-${anchorStatus}`,
        inputSummary: summary,
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
        chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
      });
      const { prisma } = mockReaderPrisma({ sessions: [session], features: [feature] });
      const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
        organizationId: ORG,
        vehicleId: VEHICLE,
        sessionLimit: 10,
      });
      expect(outcome.status).toBe('OK');
      if (outcome.status === 'OK') {
        const item = outcome.result.sessions[0];
        expect(item.snapshot?.anchorResolutionStatus).toBe(anchorStatus);
        expect(item.quality.inclusionMode).toBe('DEFAULT');
      }
    },
  );

  it('readInventory performs no create/update/delete/upsert', async () => {
    const sessionId = '99999999-9999-9999-9999-999999999999';
    const session = buildSession(sessionId, new Date());
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: ORG,
      vehicleId: VEHICLE,
      restSessionId: sessionId,
    });
    const feature = buildFeatureRow({
      restSessionId: sessionId,
      rowId: 'feat-ro',
      inputSummary: summary,
      featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
      retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
      chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    });
    const { prisma, writeSpies } = mockReaderPrisma({ sessions: [session], features: [feature] });
    await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: ORG,
      vehicleId: VEHICLE,
      sessionLimit: 5,
    });
    expect(writeSpies.create).not.toHaveBeenCalled();
    expect(writeSpies.update).not.toHaveBeenCalled();
    expect(writeSpies.deleteFn).not.toHaveBeenCalled();
    expect(writeSpies.upsert).not.toHaveBeenCalled();
  });
});
