import { parseDiditDecision } from './didit-decision.parser';
describe('parseDiditDecision', () => {
  it('extracts id_verifications without document_number or mrz', () => {
    const result = parseDiditDecision(
      {
        id_verifications: [
          {
            first_name: 'Max',
            last_name: 'Mustermann',
            document_number: 'SECRET123',
            mrz: { line1: 'hidden' },
            expiration_date: '2030-01-01',
          },
        ],
      },
      'ID_DOCUMENT',
    );

    expect(result.extractedJson).toEqual({
      first_name: 'Max',
      last_name: 'Mustermann',
      expiration_date: '2030-01-01',
    });
    expect(result.decisionJson).not.toHaveProperty('document_number');
    expect(
      JSON.stringify(result.decisionJson),
    ).not.toContain('SECRET123');
  });

  it('logs biometric warnings without using liveness or face match data', () => {
    const result = parseDiditDecision(
      {
        liveness_checks: [{ status: 'pass' }],
        face_matches: [{ score: 0.99 }],
        id_verifications: [],
      },
      'DRIVING_LICENSE',
    );

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]?.message).toContain('biometric');
  });

  it('extracts poa_verifications for proof of address', () => {
    const result = parseDiditDecision(
      {
        poa_verifications: [
          {
            status: 'Approved',
            poa_address: 'Main St 1',
            issuer: 'Utility Co',
          },
        ],
      },
      'PROOF_OF_ADDRESS',
    );

    expect(result.extractedJson).toEqual({
      status: 'Approved',
      poa_address: 'Main St 1',
      issuer: 'Utility Co',
    });
  });
});
