import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { buildMfaClaims } from '@shared/auth/auth-session-claims.types';
import {
  recordPrivilegedMutationSuccess,
} from './master-admin-privileged-audit.recorder';
import { MasterAdminAuditService } from './master-admin-audit.service';
import { resolveMfaAuditFields } from './master-admin-audit.util';

describe('resolveMfaAuditFields — delegate billing step-up metadata', () => {
  it('sets mfaStepUpUsed when masterBillingDelegateMfaStepUpUsed is true', () => {
    const fields = resolveMfaAuditFields({
      user: { id: 'delegate-1', platformRole: 'USER' },
      masterBillingDelegateMfaStepUpUsed: true,
      masterBillingDelegateMfaStepUpAction: STEP_UP_ACTION.MASTER_SUBSCRIPTION,
    } as never);

    expect(fields.mfaStepUpUsed).toBe(true);
    expect(fields.mfaStepUpAction).toBe(STEP_UP_ACTION.MASTER_SUBSCRIPTION);
  });

  it('prefers master admin step-up action when both markers present', () => {
    const fields = resolveMfaAuditFields({
      user: { id: 'master-1', platformRole: 'MASTER_ADMIN' },
      masterAdminMfaStepUpUsed: true,
      masterAdminMfaStepUpAction: STEP_UP_ACTION.MASTER_BILLING,
      masterBillingDelegateMfaStepUpUsed: true,
      masterBillingDelegateMfaStepUpAction: STEP_UP_ACTION.MASTER_SUBSCRIPTION,
    } as never);

    expect(fields.mfaStepUpUsed).toBe(true);
    expect(fields.mfaStepUpAction).toBe(STEP_UP_ACTION.MASTER_BILLING);
  });

  it('fresh MFA session claims still set mfaStepUpUsed without request flags', () => {
    const fields = resolveMfaAuditFields({
      user: {
        id: 'delegate-1',
        platformRole: 'USER',
        sessionClaims: buildMfaClaims(),
      },
    } as never);

    expect(fields.mfaStepUpUsed).toBe(true);
  });
});

describe('recordPrivilegedMutationSuccess — billing delegate MFA audit', () => {
  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as MasterAdminAuditService;

  beforeEach(() => jest.clearAllMocks());

  it('includes mfaStepUpUsed on billing mutation success after delegate step-up', () => {
    const req = {
      method: 'POST',
      originalUrl: `/api/v1/admin/billing/organizations/org-1/subscription/draft`,
      url: `/api/v1/admin/billing/organizations/org-1/subscription/draft`,
      user: {
        id: 'delegate-1',
        platformRole: 'USER',
        platformPermissions: ['master-billing'],
      },
      body: { currency: 'EUR' },
      headers: {},
      masterBillingDelegateMfaStepUpUsed: true,
      masterBillingDelegateMfaStepUpAction: STEP_UP_ACTION.MASTER_SUBSCRIPTION,
    };

    recordPrivilegedMutationSuccess(masterAdminAudit, req as never, 201);

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        mfaStepUpUsed: true,
        mfaStepUpAction: STEP_UP_ACTION.MASTER_SUBSCRIPTION,
      }),
    );
  });
});