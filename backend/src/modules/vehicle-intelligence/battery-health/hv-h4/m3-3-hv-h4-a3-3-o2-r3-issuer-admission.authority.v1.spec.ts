import {
  assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1,
  M3_3HvH4A3IssuerAdmissionRequestInvalidError,
  M3_3HvH4A3IssuerAdmissionScopeMismatchError,
} from './m3-3-hv-h4-a3-3-o2-r3-issuer-admission.authority.v1';
import type { M3_3HvH4A3IssuerAdmissionRequestV1 } from './m3-3-hv-h4-a3-3-o2-r3-issuer-admission.types.v1';

const baseRequest: M3_3HvH4A3IssuerAdmissionRequestV1 = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  revisionId: 'rev-1',
  requestedBy: 'workflow:reconciliation',
  correlationId: 'corr-1',
};

describe('m3-3-hv-h4-a3-3-o2-r3 issuer admission authority', () => {
  it('accepts matching revision scope', () => {
    expect(() =>
      assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1(baseRequest, {
        id: 'rev-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
      }),
    ).not.toThrow();
  });

  it('rejects organization spoofing', () => {
    expect(() =>
      assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1(baseRequest, {
        id: 'rev-1',
        organizationId: 'org-other',
        vehicleId: 'veh-1',
      }),
    ).toThrow(M3_3HvH4A3IssuerAdmissionScopeMismatchError);
  });

  it('rejects vehicle spoofing', () => {
    expect(() =>
      assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1(baseRequest, {
        id: 'rev-1',
        organizationId: 'org-1',
        vehicleId: 'veh-other',
      }),
    ).toThrow(M3_3HvH4A3IssuerAdmissionScopeMismatchError);
  });

  it('rejects empty correlation id', () => {
    expect(() =>
      assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1(
        { ...baseRequest, correlationId: '  ' },
        { id: 'rev-1', organizationId: 'org-1', vehicleId: 'veh-1' },
      ),
    ).toThrow(M3_3HvH4A3IssuerAdmissionRequestInvalidError);
  });
});
