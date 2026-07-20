import type { VoiceSubscriptionStatus } from '@prisma/client';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { isCapabilityAllowed, VOICE_ENTITLEMENT_POLICY } from './voice-entitlement.policy';
import {
  VOICE_ENTITLEMENT_REASON_CODES,
  VoiceEntitlementDeniedError,
} from './voice-entitlement-reason-codes';
import { VoiceEntitlementService } from './voice-entitlement.service';
import type { VoiceEntitlementCapability, VoiceEntitlementStatus } from './voice-entitlement.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function subscription(status: VoiceSubscriptionStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    organizationId: ORG_A,
    planCode: 'START',
    planCatalogVersion: '2026-07-17',
    status,
    cancelledAt: null,
    ...overrides,
  };
}

describe('VoiceEntitlementPolicy matrix', () => {
  it('allows plan onboarding without subscription', () => {
    expect(isCapabilityAllowed('NO_SUBSCRIPTION', 'billing.plans.read')).toBe(true);
    expect(isCapabilityAllowed('NO_SUBSCRIPTION', 'billing.subscription.onboard')).toBe(true);
    expect(isCapabilityAllowed('NO_SUBSCRIPTION', 'calls.outbound')).toBe(false);
    expect(isCapabilityAllowed('NO_SUBSCRIPTION', 'mcp.tools')).toBe(false);
    expect(isCapabilityAllowed('NO_SUBSCRIPTION', 'provisioning.execute')).toBe(false);
  });

  it('allows trial runtime capabilities', () => {
    expect(isCapabilityAllowed('TRIAL', 'test.center')).toBe(true);
    expect(isCapabilityAllowed('TRIAL', 'calls.outbound')).toBe(true);
    expect(isCapabilityAllowed('TRIAL', 'mcp.tools')).toBe(true);
    expect(isCapabilityAllowed('TRIAL', 'agent.deployment.deploy')).toBe(true);
  });

  it('blocks outbound and provisioning for past due while allowing inbound', () => {
    expect(isCapabilityAllowed('PAST_DUE', 'calls.outbound')).toBe(false);
    expect(isCapabilityAllowed('PAST_DUE', 'agent.deployment.deploy')).toBe(false);
    expect(isCapabilityAllowed('PAST_DUE', 'calls.inbound')).toBe(true);
    expect(isCapabilityAllowed('PAST_DUE', 'assistant.config.write')).toBe(true);
    expect(isCapabilityAllowed('PAST_DUE', 'billing.usage.read')).toBe(true);
  });

  it('limits suspended orgs to read-only diagnostics and history', () => {
    expect(isCapabilityAllowed('SUSPENDED', 'history.read')).toBe(true);
    expect(isCapabilityAllowed('SUSPENDED', 'diagnostics.read')).toBe(true);
    expect(isCapabilityAllowed('SUSPENDED', 'calls.outbound')).toBe(false);
    expect(isCapabilityAllowed('SUSPENDED', 'agent.deployment.deploy')).toBe(false);
    expect(isCapabilityAllowed('SUSPENDED', 'protection.write')).toBe(false);
  });

  it('limits cancelled orgs to history read only', () => {
    expect(isCapabilityAllowed('CANCELLED', 'history.read')).toBe(true);
    expect(isCapabilityAllowed('CANCELLED', 'assistant.config.read')).toBe(false);
    expect(isCapabilityAllowed('CANCELLED', 'billing.usage.read')).toBe(false);
  });

  it('covers every status with a non-empty policy set', () => {
    const statuses: VoiceEntitlementStatus[] = [
      'NO_SUBSCRIPTION',
      'TRIAL',
      'ACTIVE',
      'PAST_DUE',
      'SUSPENDED',
      'CANCELLED',
    ];
    for (const status of statuses) {
      expect(VOICE_ENTITLEMENT_POLICY[status].size).toBeGreaterThan(0);
    }
  });
});

describe('VoiceEntitlementService', () => {
  let repo: jest.Mocked<Pick<VoiceSubscriptionRepository, 'listByOrganization'>>;
  let service: VoiceEntitlementService;

  beforeEach(() => {
    repo = {
      listByOrganization: jest.fn(),
    };
    service = new VoiceEntitlementService(repo as unknown as VoiceSubscriptionRepository);
  });

  it('derives NO_SUBSCRIPTION when no rows exist', async () => {
    repo.listByOrganization.mockResolvedValue([]);
    const ctx = await service.resolveContext(ORG_A);
    expect(ctx.status).toBe('NO_SUBSCRIPTION');
  });

  it('maps PENDING to NO_SUBSCRIPTION (fail-closed)', async () => {
    repo.listByOrganization.mockResolvedValue([subscription('PENDING')] as never);
    const ctx = await service.resolveContext(ORG_A);
    expect(ctx.status).toBe('NO_SUBSCRIPTION');
  });

  it('scopes subscription lookup per organization (cross-tenant)', async () => {
    repo.listByOrganization.mockImplementation(((orgId: string) => {
      if (orgId === ORG_A) {
        return Promise.resolve([subscription('ACTIVE')]);
      }
      return Promise.resolve([]);
    }) as VoiceSubscriptionRepository['listByOrganization']);

    await expect(service.assertCapability(ORG_A, 'calls.outbound')).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    await expect(service.assertCapability(ORG_B, 'billing.plans.read')).resolves.toMatchObject({
      status: 'NO_SUBSCRIPTION',
    });
    await expect(service.assertCapability(ORG_B, 'calls.outbound')).rejects.toBeInstanceOf(
      VoiceEntitlementDeniedError,
    );
  });

  it('denies MCP without entitlement at service layer', async () => {
    repo.listByOrganization.mockResolvedValue([]);
    await expect(service.assertCapability(ORG_A, 'mcp.tools')).rejects.toMatchObject({
      reasonCode: VOICE_ENTITLEMENT_REASON_CODES.NO_SUBSCRIPTION,
      capability: 'mcp.tools',
    });
  });

  it('denies automation/runtime capabilities when suspended', async () => {
    repo.listByOrganization.mockResolvedValue([subscription('SUSPENDED')] as never);
    await expect(service.assertCapability(ORG_A, 'calls.outbound')).rejects.toMatchObject({
      reasonCode: VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_SUSPENDED,
    });
    await expect(service.assertCapability(ORG_A, 'agent.deployment.deploy')).rejects.toMatchObject({
      reasonCode: VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_SUSPENDED,
    });
  });

  it('allows trial test center and blocks when cancelled', async () => {
    repo.listByOrganization.mockResolvedValue([subscription('TRIAL')] as never);
    await expect(service.assertCapability(ORG_A, 'test.center')).resolves.toBeTruthy();

    repo.listByOrganization.mockResolvedValue([subscription('CANCELLED')] as never);
    await expect(service.assertCapability(ORG_A, 'test.center')).rejects.toMatchObject({
      reasonCode: VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_CANCELLED,
    });
  });

  it('allows past-due inbound but blocks outbound', async () => {
    repo.listByOrganization.mockResolvedValue([subscription('PAST_DUE')] as never);
    await expect(service.assertCapability(ORG_A, 'calls.inbound')).resolves.toBeTruthy();
    await expect(service.assertCapability(ORG_A, 'calls.outbound')).rejects.toMatchObject({
      reasonCode: VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_PAST_DUE,
    });
  });

  it('blocks cancelled history outside retention window', async () => {
    const oldCancelled = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    repo.listByOrganization.mockResolvedValue([
      subscription('CANCELLED', { cancelledAt: oldCancelled }),
    ] as never);

    await expect(service.assertCapability(ORG_A, 'history.read')).rejects.toMatchObject({
      reasonCode: VOICE_ENTITLEMENT_REASON_CODES.RETENTION_EXPIRED,
    });
  });

  it('allows cancelled history within retention window', async () => {
    repo.listByOrganization.mockResolvedValue([
      subscription('CANCELLED', { cancelledAt: new Date() }),
    ] as never);
    await expect(service.assertCapability(ORG_A, 'history.read')).resolves.toMatchObject({
      status: 'CANCELLED',
    });
  });

  it('keeps plan onboarding reachable without subscription', async () => {
    repo.listByOrganization.mockResolvedValue([]);
    const capabilities: VoiceEntitlementCapability[] = [
      'billing.plans.read',
      'billing.subscription.onboard',
      'assistant.config.read',
    ];
    for (const capability of capabilities) {
      await expect(service.assertCapability(ORG_A, capability)).resolves.toMatchObject({
        status: 'NO_SUBSCRIPTION',
      });
    }
  });

  it('exposes operational and runtime helpers', () => {
    expect(service.isOperationalStatus('PAST_DUE')).toBe(true);
    expect(service.isOperationalStatus('SUSPENDED')).toBe(false);
    expect(service.isRuntimeStatus('TRIAL')).toBe(true);
    expect(service.isRuntimeStatus('PAST_DUE')).toBe(false);
  });
});

describe('VoiceEntitlementGuard integration shape', () => {
  it('exports guard and decorator metadata key', () => {
    const { VOICE_ENTITLEMENT_KEY } = require('./require-voice-entitlement.decorator');
    const { VoiceEntitlementGuard } = require('./voice-entitlement.guard');
    expect(VOICE_ENTITLEMENT_KEY).toBe('voice_entitlement_capabilities');
    expect(VoiceEntitlementGuard).toBeDefined();
  });
});
