import {
  createApplyFailure,
  createApplySuccess,
  createArchiveOnlyApplySuccess,
  isProvenApplySuccess,
  readProvenApplyFromAudit,
  toProvenApplyAuditDetails,
} from './document-extraction-apply-result.util';

describe('document-extraction-apply-result.util', () => {
  it('treats empty legacy result shape as not proven', () => {
    const legacyNoOp = {
      success: false,
      downstreamEntityType: null,
      downstreamEntityId: null,
      actionCount: 0,
      errors: ['DOWNSTREAM_APPLY_FAILED'],
    };
    expect(isProvenApplySuccess(legacyNoOp)).toBe(false);
  });

  it('allows archive-only success without downstream entity id', () => {
    const archive = createArchiveOnlyApplySuccess();
    expect(isProvenApplySuccess(archive)).toBe(true);
    expect(toProvenApplyAuditDetails(archive)).toMatchObject({
      success: true,
      downstreamEntityType: 'archive',
      mode: 'archive_only',
    });
  });

  it('requires downstream entity id for non-archive success', () => {
    const missingId = createApplySuccess({
      downstreamEntityType: 'fine',
      downstreamEntityId: '',
      actionCount: 1,
    });
    expect(isProvenApplySuccess(missingId)).toBe(false);

    const proven = createApplySuccess({
      downstreamEntityType: 'fine',
      downstreamEntityId: 'fine-1',
      actionCount: 1,
    });
    expect(isProvenApplySuccess(proven)).toBe(true);
  });

  it('reads proven apply from audit without duplicate downstream proof', () => {
    const plausibility = {
      _pipeline: {
        actionAudit: [
          {
            action: 'apply',
            at: '2026-07-17T12:00:00.000Z',
            userId: null,
            details: {
              success: true,
              downstreamEntityType: 'service_event',
              downstreamEntityId: 'evt-1',
              actionCount: 1,
            },
          },
        ],
      },
    };
    expect(readProvenApplyFromAudit(plausibility)).toMatchObject({
      downstreamEntityType: 'service_event',
      downstreamEntityId: 'evt-1',
    });
  });

  it('does not treat failed apply audit as proven', () => {
    const plausibility = {
      _pipeline: {
        actionAudit: [
          {
            action: 'apply',
            at: '2026-07-17T12:00:00.000Z',
            userId: null,
            details: createApplyFailure(['VEHICLE_ORGANIZATION_REQUIRED']),
          },
        ],
      },
    };
    expect(readProvenApplyFromAudit(plausibility)).toBeNull();
  });
});
