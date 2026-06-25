import { mapDiditStatusToCheckStatus } from './didit-status.mapper';
describe('mapDiditStatusToCheckStatus', () => {
  it('maps known Didit statuses case-sensitively', () => {
    expect(mapDiditStatusToCheckStatus('Approved').status).toBe('VERIFIED');
    expect(mapDiditStatusToCheckStatus('Declined').status).toBe('REJECTED');
    expect(mapDiditStatusToCheckStatus('In Review').status).toBe('REQUIRES_REVIEW');
    expect(mapDiditStatusToCheckStatus('In Progress').status).toBe('IN_PROGRESS');
    expect(mapDiditStatusToCheckStatus('Awaiting User').status).toBe('AWAITING_USER');
    expect(mapDiditStatusToCheckStatus('Not Started').status).toBe('PENDING');
    expect(mapDiditStatusToCheckStatus('Abandoned').status).toBe('ABANDONED');
    expect(mapDiditStatusToCheckStatus('Resubmitted').status).toBe('IN_PROGRESS');
    expect(mapDiditStatusToCheckStatus('Expired').status).toBe('EXPIRED');
    expect(mapDiditStatusToCheckStatus('Kyc Expired').status).toBe('KYC_EXPIRED');
  });

  it('does not match lowercased Didit statuses', () => {
    const result = mapDiditStatusToCheckStatus('approved');
    expect(result.status).toBe('REQUIRES_REVIEW');
    expect(result.warning).toBeDefined();
  });

  it('maps unknown statuses to REQUIRES_REVIEW with warning', () => {
    const result = mapDiditStatusToCheckStatus('Something New');
    expect(result.status).toBe('REQUIRES_REVIEW');
    expect(result.warning).toContain('Something New');
  });
});
