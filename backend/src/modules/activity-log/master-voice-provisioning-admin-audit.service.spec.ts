import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditService } from './master-admin-audit.service';
import {
  deriveVoiceProvisioningJobOutcome,
  MasterVoiceProvisioningAdminAuditService,
} from './master-voice-provisioning-admin-audit.service';

describe('MasterVoiceProvisioningAdminAuditService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: MasterVoiceProvisioningAdminAuditService;

  const req = {
    user: { id: 'admin-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    method: 'POST',
    originalUrl: '/api/v1/admin/voice-assistant/organizations/o1/twilio/subaccount/provision',
    headers: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterVoiceProvisioningAdminAuditService(
      masterAdminAudit as unknown as MasterAdminAuditService,
    );
  });

  it('never maps dry-run to PROVISIONING_COMPLETED', () => {
    expect(
      deriveVoiceProvisioningJobOutcome({
        dryRun: true,
        mutating: false,
        job: { status: 'COMPLETED' },
      }),
    ).toBe('ALREADY_COMPLETED');
    expect(
      deriveVoiceProvisioningJobOutcome({
        dryRun: true,
        mutating: false,
        job: { status: 'PENDING' },
      }),
    ).toBe('PROVISIONING_REQUESTED');
  });

  it('records twilio mutation with sanitized metadata', () => {
    service.recordProvisioningMutation({
      req,
      domain: 'TWILIO',
      operation: 'SUBACCOUNT_PROVISION',
      targetOrganizationId: 'org-1',
      entityId: 'job-1',
      outcome: 'PROVISIONING_REQUESTED',
      extraMetadata: { jobStatus: 'PENDING', dryRun: true },
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_VOICE_TWILIO_PROVISIONING,
        targetOrganizationId: 'org-1',
        entityId: 'job-1',
        httpStatus: 201,
        metadata: expect.objectContaining({ outcome: 'PROVISIONING_REQUESTED' }),
      }),
    );
    expect(JSON.stringify(masterAdminAudit.record.mock.calls)).not.toMatch(/authToken|apiKey/i);
  });
});