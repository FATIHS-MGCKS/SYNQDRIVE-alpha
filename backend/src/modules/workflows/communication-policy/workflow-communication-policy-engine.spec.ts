import { Test } from '@nestjs/testing';
import { WorkflowCommunicationPolicyEngineService } from './workflow-communication-policy-engine.service';
import { buildCommunicationPolicySnapshot } from './workflow-communication-policy.snapshot';
import type { WorkflowCommunicationPolicyEvaluateInput } from './workflow-communication-policy.types';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function baseInput(
  overrides: Partial<WorkflowCommunicationPolicyEvaluateInput> = {},
): WorkflowCommunicationPolicyEvaluateInput {
  return {
    organizationId: ORG,
    phase: 'plan',
    channel: 'sms',
    processingPurpose: 'transactional',
    recipientType: 'booking_customer',
    recipientPhoneNormalized: '+491701234567',
    recipientValidated: true,
    bookingId: 'booking-1',
    legalBasisRef: 'gdpr.art6.1.b.contract',
    channelEnabled: true,
    channelPermissionGranted: true,
    enforceQuietHours: false,
    inQuietHours: true,
    ...overrides,
  };
}

describe('WorkflowCommunicationPolicyEngineService', () => {
  let engine: WorkflowCommunicationPolicyEngineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorkflowCommunicationPolicyEngineService],
    }).compile();
    engine = module.get(WorkflowCommunicationPolicyEngineService);
  });

  it('allows compliant transactional SMS', () => {
    const result = engine.evaluate(baseInput());
    expect(result.decision).toBe('ALLOW');
    expect(result.reasonCode).toBe('ALLOWED');
    expect(result.allowed).toBe(true);
    expect(result.snapshot.organizationId).toBe(ORG);
    expect(result.snapshot.checksApplied.length).toBeGreaterThan(0);
  });

  it('suppresses on opt-out', () => {
    const result = engine.evaluate(baseInput({ optedOut: true }));
    expect(result.decision).toBe('SUPPRESS');
    expect(result.reasonCode).toBe('OPT_OUT');
    expect(result.allowed).toBe(false);
  });

  it('denies when channel is not allowed', () => {
    const result = engine.evaluate(baseInput({ channelEnabled: false }));
    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('CHANNEL_DISABLED');
  });

  it('delays outside quiet hours', () => {
    const result = engine.evaluate(
      baseInput({
        enforceQuietHours: true,
        inQuietHours: false,
        quietHoursDelayUntil: new Date('2026-07-25T08:00:00.000Z'),
      }),
    );
    expect(result.decision).toBe('DELAY_UNTIL');
    expect(result.reasonCode).toBe('QUIET_HOURS');
    expect(result.delayUntil).toBeDefined();
  });

  it('delays on contact frequency limit', () => {
    const result = engine.evaluate(
      baseInput({
        contactFrequencyExceeded: true,
        contactFrequencyDelayUntil: new Date('2026-07-26T08:00:00.000Z'),
      }),
    );
    expect(result.decision).toBe('DELAY_UNTIL');
    expect(result.reasonCode).toBe('CONTACT_FREQUENCY');
  });

  it('denies when booking reference is missing for transactional purpose', () => {
    const result = engine.evaluate(
      baseInput({
        bookingId: null,
        contractId: null,
        requireBookingOrContractRef: true,
      }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('BOOKING_REF_MISSING');
  });

  it('requires approval when configured', () => {
    const result = engine.evaluate(
      baseInput({ requiresApproval: true, runApproved: false }),
    );
    expect(result.decision).toBe('ALLOW_WITH_APPROVAL');
    expect(result.reasonCode).toBe('APPROVAL_REQUIRED');
    expect(result.allowed).toBe(true);
  });

  it('denies when policy changes before send', () => {
    const planInput = baseInput({ phase: 'plan', processingPurpose: 'transactional' });
    const frozen = buildCommunicationPolicySnapshot(planInput, ['plan']);

    const result = engine.evaluate(
      baseInput({
        phase: 'pre_send',
        frozenSnapshot: frozen,
        processingPurpose: 'support',
        legalBasisRef: 'gdpr.art6.1.f.legitimate_interest',
      }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('POLICY_CHANGED_PRE_SEND');
  });

  it('denies foreign tenant resource access', () => {
    const result = engine.evaluate(
      baseInput({ resourceOrganizationId: OTHER_ORG }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('TENANT_VIOLATION');
  });

  it('suggests fallback channel when WhatsApp preference mismatches', () => {
    const result = engine.evaluate(
      baseInput({
        channel: 'whatsapp',
        communicationPreference: 'sms',
        fallbackChannel: 'sms',
      }),
    );
    expect(result.decision).toBe('FALLBACK_CHANNEL');
    expect(result.reasonCode).toBe('FALLBACK_AVAILABLE');
    expect(result.fallbackChannel).toBe('sms');
  });

  it('blocks marketing via workflow automation', () => {
    const result = engine.evaluate(
      baseInput({ processingPurpose: 'marketing' }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('MARKETING_BLOCKED');
  });

  it('assertSendPermitted throws for suppress decision', () => {
    const result = engine.evaluate(baseInput({ optedOut: true }));
    expect(() => engine.assertSendPermitted(result)).toThrow();
  });

  it('assertSendPermitted allows approved communication', () => {
    const result = engine.evaluate(
      baseInput({ requiresApproval: true, runApproved: true }),
    );
    expect(() =>
      engine.assertSendPermitted(result, { allowWithApproval: true }),
    ).not.toThrow();
  });
});
