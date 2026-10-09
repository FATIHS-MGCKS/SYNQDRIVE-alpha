import {
  certifyPhaseAProductionTlsIdentityV1,
  type PhaseAProductionTlsSessionEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-identity.v1';

const verifyFullUrl =
  'postgresql://audit_ro@127.0.0.1:5432/synqdrive_test?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.pem';

describe('certifyPhaseAProductionTlsIdentityV1', () => {
  it('does not certify identity from ssl=true alone when URL policy fails', () => {
    const evidence: PhaseAProductionTlsSessionEvidenceV1 = {
      backendPid: 42,
      sslActive: true,
      version: 'TLSv1.3',
      cipher: 'AES',
    };
    const result = certifyPhaseAProductionTlsIdentityV1(
      'postgresql://audit_ro@127.0.0.1:5432/synqdrive_test',
      evidence,
      42,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_TLS_VERIFY_FULL_REQUIRED');
    }
  });

  it('requires encrypted session even when verify-full URL policy passes', () => {
    const evidence: PhaseAProductionTlsSessionEvidenceV1 = {
      backendPid: 7,
      sslActive: false,
      version: null,
      cipher: null,
    };
    const result = certifyPhaseAProductionTlsIdentityV1(verifyFullUrl, evidence, 7);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_TLS_HANDSHAKE_NOT_ENCRYPTED');
    }
  });

  it('certifies only when verify-full policy, ssl session, and anchor pid align', () => {
    const evidence: PhaseAProductionTlsSessionEvidenceV1 = {
      backendPid: 99,
      sslActive: true,
      version: 'TLSv1.3',
      cipher: 'AES',
    };
    const result = certifyPhaseAProductionTlsIdentityV1(verifyFullUrl, evidence, 99);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certification.tlsIdentityCertified).toBe(true);
      expect(result.certification.verifyFullConnectPolicy).toBe(true);
    }
  });
});
